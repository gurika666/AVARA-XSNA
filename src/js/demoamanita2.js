import * as THREE from 'three';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LineHandler } from './lineHandler.js';

// Global variables
let scene, renderer, camera, controls, statuemesh, envMap;
let composer, bloomPass;
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
let intersectionPoint = new THREE.Vector3();
let sphereCenter = new THREE.Vector3();
let debugSphere;
let lineHandler;

// Config
const config = {
  lineWidth: 2,
  opacity: 0.5,
  bezierCurveAmount: 0.05,   // Amount of curve (0 = straight, higher = more curved)
  bloom: {
    strength: 0.5,           // Bloom strength
    radius: 0.4,             // Bloom radius
    threshold: 0.1           // Bloom threshold
  },
  cursor: {
    sphereRadius: 0.25,      // Radius of cursor influence sphere
    transitionWidth: 0.1,    // Width of the transition edge
    visible: false,          // Whether to show debug sphere
    hideThreshold: 0.99      // Threshold for hiding vertices (0-1, higher = less hiding)
  },
  displacement: {
    amount: 0.02,            // Increased base amount for face displacement
    speed: 0,              // Animation speed for displacement
    variation: 0,          // Higher variation for more randomness
    edgeShrink: 1         // Amount to shrink faces to create cracks
  }
};

// GLSL shader code - exporting to separate variables for easier tweaking
const vertexShaderCommon = `
varying vec3 vWorldPosition;
varying float vCursorInfluence;
varying vec3 vBaryCoord;     // Barycentric coordinates for face effects
uniform vec3 uCursorPosition;
uniform float uCursorRadius;
uniform float uTransitionWidth;
uniform float uTime;
uniform float uDisplacementAmount;
uniform float uDisplacementSpeed;
uniform float uDisplacementVariation;
uniform float uEdgeShrink;   // Amount to shrink faces to create cracks

// Function to calculate cursor influence (0.0 = no influence, 1.0 = full influence)
float getVertexCursorInfluence(vec3 worldPos, vec3 cursorPos, float radius, float transWidth) {
  float dist = distance(worldPos, cursorPos);
  float sphereEdge = radius;
  float influenceRadius = sphereEdge + transWidth;
  
  if (dist < sphereEdge) {
    // Fully inside sphere
    return 1.0;
  } else if (dist < influenceRadius) {
    // In transition zone - calculate smooth falloff
    float t = (dist - sphereEdge) / transWidth;
    return 1.0 - smoothstep(0.0, 1.0, t);
  }
  
  // Outside influence zone
  return 0.0;
}

// Hash function for generating face ID from position
float hash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.zyx + 19.19);
  return fract((p.x + p.y) * p.z);
}`;

const vertexShaderMain = `
// Calculate world position for vertex hiding calculation
vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;

// Calculate cursor influence at this vertex
float vertInfluence = getVertexCursorInfluence(worldPos, uCursorPosition, uCursorRadius, uTransitionWidth);

// Add slight pulse effect to the influence
float pulse = 0.2 * sin(uTime * 2.0);
vertInfluence = mix(vertInfluence, min(vertInfluence + 0.1, 1.0), pulse);

// Generate a unique value for this face/vertex to create independent movement
// Using the floored position as a seed ensures faces move independently
// Round to the nearest 0.5 unit to ensure vertices on the same face get the same hash
vec3 facePos = floor(worldPos * 20.0) / 20.0;
float faceId = hash(facePos);

// Calculate displacement amount with variation
float faceDisplacement = uDisplacementAmount * vertInfluence;

// Add variation based on position and face ID
float timeOffset = faceId * 10.0;
float variation = sin(facePos.x * 10.0 + timeOffset) * 
                cos(facePos.y * 8.0 + timeOffset) * 
                sin(facePos.z * 6.0 + uTime * uDisplacementSpeed);

// Scale variation by config parameter
variation *= uDisplacementVariation;

// Add time-based animation and face-specific variation
faceDisplacement *= (1.0 + variation);

// Apply edge shrinking effect to create gaps between faces
// For this, we need to calculate how close this vertex is to the face edge
// Since we don't have direct face info in the vertex shader, we use the normal
// Vertices with similar normals are likely on the same face plane

// Create a unique direction for this face to move
vec3 faceDirection = normalize(vec3(
  sin(faceId * 42.539),
  cos(faceId * 32.372),
  sin(faceId * 63.193)
));

// Blend between normal and unique direction
vec3 displaceDir = normalize(mix(objectNormal, faceDirection, 0.3)); 

// Apply displacement along calculated direction
if (vertInfluence > 0.05) {
  // The main displacement
  transformed += displaceDir * faceDisplacement;
  
  // Create the crack effect by scaling vertices inward 
  // Calculate face center approximation by using the facePos
  vec3 faceCenter = facePos + vec3(0.025); // Small offset to approximate center
  
  // Get vector from face center to this vertex in object space
  vec3 centerToVertex = position - (inverse(modelMatrix) * vec4(faceCenter, 1.0)).xyz;
  
  // Scale based on cursor influence (more shrinkage where cursor is)
  float shrinkAmount = uEdgeShrink * vertInfluence;
  
  // Apply the shrinkage proportional to distance from center
  float shrinkFactor = 1.0 - shrinkAmount;
  transformed = transformed - centerToVertex * (1.0 - shrinkFactor);
}

// Pass influence to fragment shader
vCursorInfluence = vertInfluence;`;

const fragmentShaderCommon = `
varying vec3 vWorldPosition;
varying float vCursorInfluence;
varying vec3 vBaryCoord;
uniform vec3 uCursorPosition;
uniform float uCursorRadius;
uniform float uTransitionWidth;
uniform float uTime;
uniform float uHideThreshold;`;

const fragmentShaderDiscard = `
// Check if this fragment should be hidden based on cursor influence
if (vCursorInfluence > uHideThreshold) {
  // discard; // Skip rendering this fragment completely
}`;

const fragmentShaderColorEffect = `
// Apply subtle color transition at the edge of the hidden area
float edgeEffect = smoothstep(uHideThreshold - 0.2, uHideThreshold, vCursorInfluence);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 1.0), edgeEffect * 0.7);`;

// Create scene first
scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Create loading manager
const loadingManager = new THREE.LoadingManager(
  () => {
    init();
    animate();
  }
);

// Load HDRI environment
const hdriLoader = new RGBELoader(loadingManager);
hdriLoader.load('images/01.hdr', function(texture) {
    envMap = texture;
    envMap.mapping = THREE.EquirectangularReflectionMapping;
});

const TextureLoader = new THREE.TextureLoader();
let normal = TextureLoader.load("/images/normal.jpg");

// Load the edge-only model
const loader = new GLTFLoader(loadingManager);
loader.load("mesh/man2.glb", (gltf) => {
  gltf.scene.traverse((child) => {
    if(child.name.includes("statue_")){
      statuemesh = child;
      
      // Pre-process the mesh to expose individual faces
      processMeshForSeparateFaces(child);
      
      // Create physical material for the statue
      setupStatuePhysicalMaterial(child);
    }
  });
  console.log("Edge model loaded:", gltf);
  
  // Initialize line handler and create curves
  lineHandler = new LineHandler(config);
  lineHandler.createCurvesFromEdgeModel(gltf.scene).forEach(curve => {
    curve.renderOrder = 1;
    scene.add(curve);
  });
});

// Pre-process mesh to expose faces
function processMeshForSeparateFaces(mesh) {
  if (!(mesh.geometry instanceof THREE.BufferGeometry)) {
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);
  }
  
  // Ensure we have computed normals
  mesh.geometry.computeVertexNormals();
  
  // Create non-indexed geometry to allow separate faces
  if (mesh.geometry.index !== null) {
    mesh.geometry = mesh.geometry.toNonIndexed();
    console.log("Converted to non-indexed geometry for separate faces");
  }
  
  // Compute face normals again after conversion
  mesh.geometry.computeVertexNormals();
}

// Setup physical material for the statue with face displacement
function setupStatuePhysicalMaterial(mesh) {
  // Create standard physical material - white color with transmission properties
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    normalMap: normal,
    metalness: 0,
    roughness: 0.5,
    thickness: 0.5,
    side: THREE.DoubleSide,
    envMap: envMap
  });
  
  // Create custom uniforms for the shader
  const customUniforms = {
    uTime: { value: 0 },
    uCursorPosition: { value: new THREE.Vector3() },
    uCursorRadius: { value: config.cursor.sphereRadius },
    uTransitionWidth: { value: config.cursor.transitionWidth },
    uHideThreshold: { value: config.cursor.hideThreshold },
    uDisplacementAmount: { value: config.displacement.amount },
    uDisplacementSpeed: { value: config.displacement.speed },
    uDisplacementVariation: { value: config.displacement.variation },
    uEdgeShrink: { value: config.displacement.edgeShrink }
  };
  
  // Add shader material modifications
  material.onBeforeCompile = function(shader) {
    // Add our custom uniforms
    shader.uniforms.uTime = customUniforms.uTime;
    shader.uniforms.uCursorPosition = customUniforms.uCursorPosition;
    shader.uniforms.uCursorRadius = customUniforms.uCursorRadius;
    shader.uniforms.uTransitionWidth = customUniforms.uTransitionWidth;
    shader.uniforms.uHideThreshold = customUniforms.uHideThreshold;
    shader.uniforms.uDisplacementAmount = customUniforms.uDisplacementAmount;
    shader.uniforms.uDisplacementSpeed = customUniforms.uDisplacementSpeed;
    shader.uniforms.uDisplacementVariation = customUniforms.uDisplacementVariation;
    shader.uniforms.uEdgeShrink = customUniforms.uEdgeShrink;
    
    // Add varying for world position - use a unique name to avoid conflicts
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      ${vertexShaderCommon}`
    );
    
    // Calculate cursor influence and displacement in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      ${vertexShaderMain}`
    );
    
    // Assign world position in vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWorldPosition = worldPosition.xyz;'
    );
    
    // Add cursor interaction in fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      'varying vec3 vViewPosition;',
      'varying vec3 vViewPosition;\n' + fragmentShaderCommon
    );
    
    // Add discard check to beginning of fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `void main() {
      ${fragmentShaderDiscard}`
    );
    
    // Modify the fragment shader to change color based on cursor proximity
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      ${fragmentShaderColorEffect}`
    );
    
    // Store the modified shader for our use
    material.userData.shader = shader;
  };
  
  // Store custom uniforms for later updates
  material.userData.customUniforms = customUniforms;
  
  // Apply the physical material to the mesh
  mesh.material = material;
  
  // Create a debug sphere to visualize cursor sphere
  if (config.cursor.visible) {
    const sphereGeometry = new THREE.SphereGeometry(config.cursor.sphereRadius, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.5,
      wireframe: true
    });
    debugSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    debugSphere.visible = config.cursor.visible;
    scene.add(debugSphere);
  }
}

// Initialize the scene
function init() {
  // Set up renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  
  // Set up camera
  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 5;
  
  // Set up controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  
  // Add window resize listener
  window.addEventListener("resize", onWindowResize);
  
  // Add mouse event listeners for cursor-based transparency
  window.addEventListener("mousemove", onMouseMove);
  
  // Set rendering order
  if (statuemesh) {
    statuemesh.renderOrder = 0;
    scene.add(statuemesh);
  }
 
  // Setup post-processing (just bloom)
  setupPostProcessing();
}

// Mouse move handler to update cursor position
function onMouseMove(event) {
  // Calculate normalized device coordinates
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  // Update the picking ray
  raycaster.setFromCamera(mouse, camera);
  
  // Check for intersections with the statue mesh
  if (statuemesh) {
    const intersects = raycaster.intersectObject(statuemesh);
    
    if (intersects.length > 0) {
      // We hit the statue mesh, use intersection point
      intersectionPoint.copy(intersects[0].point);
      
      // Update sphere center for opacity calculations
      sphereCenter.copy(intersectionPoint);
      
      // Update debug sphere position if it exists
      if (debugSphere) {
        debugSphere.position.copy(intersectionPoint);
      }
    } else {
      // No direct hit, try to find a point along the ray at a reasonable distance
      const rayDirection = raycaster.ray.direction.clone();
      const rayOrigin = raycaster.ray.origin.clone();
      
      // Project the ray forward to a reasonable distance
      const distanceToModel = 5; // Adjust based on your scene scale
      sphereCenter.copy(rayOrigin).addScaledVector(rayDirection, distanceToModel);
      
      // Update debug sphere position if it exists
      if (debugSphere) {
        debugSphere.position.copy(sphereCenter);
      }
    }
  }
}

// Set up post-processing - simplified with just bloom
function setupPostProcessing() {
  // Create composer
  composer = new EffectComposer(renderer);
  
  // Add render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  
  // Add bloom pass
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    config.bloom.strength,
    config.bloom.radius,
    config.bloom.threshold
  );
  composer.addPass(bloomPass);
}

// Handle window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Update resolution for all line materials
  if (lineHandler) {
    lineHandler.updateResolution(window.innerWidth, window.innerHeight);
  }
  
  // Update post-processing passes
  composer.setSize(window.innerWidth, window.innerHeight);
}

// Add helper function to update parameters
function updateConfig(params) {
  // Update bloom settings
  if (params.bloom) {
    config.bloom.strength = params.bloom.strength !== undefined ? params.bloom.strength : config.bloom.strength;
    config.bloom.radius = params.bloom.radius !== undefined ? params.bloom.radius : config.bloom.radius;
    config.bloom.threshold = params.bloom.threshold !== undefined ? params.bloom.threshold : config.bloom.threshold;
    
    // Apply to bloom pass
    if (bloomPass) {
      bloomPass.strength = config.bloom.strength;
      bloomPass.radius = config.bloom.radius;
      bloomPass.threshold = config.bloom.threshold;
    }
  }
  
  // Update cursor settings
  if (params.cursor) {
    config.cursor.sphereRadius = params.cursor.sphereRadius !== undefined ? params.cursor.sphereRadius : config.cursor.sphereRadius;
    config.cursor.transitionWidth = params.cursor.transitionWidth !== undefined ? params.cursor.transitionWidth : config.cursor.transitionWidth;
    config.cursor.visible = params.cursor.visible !== undefined ? params.cursor.visible : config.cursor.visible;
    config.cursor.hideThreshold = params.cursor.hideThreshold !== undefined ? params.cursor.hideThreshold : config.cursor.hideThreshold;
    
    // Update debug sphere visibility if it exists
    if (debugSphere) {
      debugSphere.visible = config.cursor.visible;
      debugSphere.scale.setScalar(config.cursor.sphereRadius / 0.3);
    }
    
    // Update shader uniforms if available
    if (statuemesh && statuemesh.material.userData.customUniforms) {
      const uniforms = statuemesh.material.userData.customUniforms;
      uniforms.uCursorRadius.value = config.cursor.sphereRadius;
      uniforms.uTransitionWidth.value = config.cursor.transitionWidth;
      uniforms.uHideThreshold.value = config.cursor.hideThreshold;
    }
  }
  
  // Update displacement settings
  if (params.displacement) {
    config.displacement.amount = params.displacement.amount !== undefined ? params.displacement.amount : config.displacement.amount;
    config.displacement.speed = params.displacement.speed !== undefined ? params.displacement.speed : config.displacement.speed;
    config.displacement.variation = params.displacement.variation !== undefined ? params.displacement.variation : config.displacement.variation;
    config.displacement.edgeShrink = params.displacement.edgeShrink !== undefined ? params.displacement.edgeShrink : config.displacement.edgeShrink;
    
    // Update shader uniforms if available
    if (statuemesh && statuemesh.material.userData.customUniforms) {
      const uniforms = statuemesh.material.userData.customUniforms;
      uniforms.uDisplacementAmount.value = config.displacement.amount;
      uniforms.uDisplacementSpeed.value = config.displacement.speed;
      uniforms.uDisplacementVariation.value = config.displacement.variation;
      uniforms.uEdgeShrink.value = config.displacement.edgeShrink;
    }
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  
  // Update time value for shaders
  const time = performance.now() * 0.001; // Convert to seconds
  
  // Update shader uniforms for cursor position
  if (statuemesh && statuemesh.material.userData.customUniforms) {
    const uniforms = statuemesh.material.userData.customUniforms;
    uniforms.uTime.value = time;
    uniforms.uCursorPosition.value.copy(sphereCenter);
  }
  
  // Render scene with post-processing
  composer.render();
}
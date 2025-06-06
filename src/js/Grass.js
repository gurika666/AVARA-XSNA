import * as THREE from "three";

// Define constants for grass blade generation
const BLADE_WIDTH = 0.2;
const BLADE_HEIGHT = 1.2; // Increased blade height
const BLADE_HEIGHT_VARIATION = 0.8; // Increased height variation
const BLADE_VERTEX_COUNT = 5;
const BLADE_TIP_OFFSET = 0.1;

// Constants for grass patches management
const spreadWidth = 10; // Reduced spread to condense patches more in the center
const removalZ = 10; // Point where grass patches get removed (when they pass the camera)
const generationZ = -70; // Where new grass patches are generated
const minDistance = 6; // Reduced minimum distance between patches to allow denser placement

// Patch size constants
const MIN_PATCH_SIZE = 10;  // Minimum patch size (increased)
const MAX_PATCH_SIZE = 15; // Maximum patch size (increased)
const MIN_BLADE_COUNT = 500; // Minimum blades per patch (increased)
const MAX_BLADE_COUNT = 600; // Maximum blades per patch (increased)

// Helper function to interpolate values
function interpolate(val, oldMin, oldMax, newMin, newMax) {
  return ((val - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
}

// Helper function to create a distribution that favors center positions
function centerBiasedRandom() {
  // This will create a distribution that's more concentrated toward the center
  return Math.pow(Math.random(), 1.5) * 2 - 1;
}

// Grass geometry class - creates individual blades
class GrassGeometry extends THREE.BufferGeometry {
  constructor(size, count) {
    super();

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < count; i++) {
      const surfaceMin = (size / 2) * -1;
      const surfaceMax = size / 2;
      
      // Distribute grass blades in a circular pattern
      // Use square root distribution for more even blade placement
      const radius = (size / 2) * Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const x = radius * Math.cos(theta);
      const y = radius * Math.sin(theta);
      
      // Add UV coordinates for this blade
      // These UVs will be used for both texture and alpha mapping
      uvs.push(
        ...Array.from({ length: BLADE_VERTEX_COUNT }).flatMap((_, vertexIndex) => {
          // Make bottom vertices have low v (for alpha mapping)
          // and tips have high v values (for alpha mapping)
          let v = 0;
          if (vertexIndex >= 2) { // tl, tr vertices (middle)
            v = 0.5;
          }
          if (vertexIndex === 4) { // tc vertex (tip)
            v = 1.0;
          }
          
          return [
            interpolate(x, surfaceMin, surfaceMax, 0, 1),
            v // Use v for vertical alpha mapping
          ];
        })
      );
      
      // Generate a grass blade and add its vertices and indices
      const blade = this.computeBlade([x, 0, y], i);
      positions.push(...blade.positions);
      indices.push(...blade.indices);
    }

    // Set attributes for the geometry
    this.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(positions), 3)
    );
    this.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    this.setIndex(indices);
    this.computeVertexNormals();
  }

  // Generate a single grass blade
  computeBlade(center, index = 0) {
    const height = BLADE_HEIGHT + Math.random() * BLADE_HEIGHT_VARIATION;
    const vIndex = index * BLADE_VERTEX_COUNT;
    
    // Randomize blade orientation and tip angle
    const yaw = Math.random() * Math.PI * 2;
    const yawVec = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const bend = Math.random() * Math.PI * 2;
    const bendVec = [Math.sin(bend), 0, -Math.cos(bend)];
    
    // Calculate bottom, middle, and tip vertices
    const bl = yawVec.map((n, i) => n * (BLADE_WIDTH / 2) * 1 + center[i]);
    const br = yawVec.map((n, i) => n * (BLADE_WIDTH / 2) * -1 + center[i]);
    const tl = yawVec.map((n, i) => n * (BLADE_WIDTH / 4) * 1 + center[i]);
    const tr = yawVec.map((n, i) => n * (BLADE_WIDTH / 4) * -1 + center[i]);
    const tc = bendVec.map((n, i) => n * BLADE_TIP_OFFSET + center[i]);
    
    // Attenuate height
    tl[1] += height / 2;
    tr[1] += height / 2;
    tc[1] += height;
    
    return {
      positions: [...bl, ...br, ...tr, ...tl, ...tc],
      indices: [
        vIndex,
        vIndex + 1,
        vIndex + 2,
        vIndex + 2,
        vIndex + 4,
        vIndex + 3,
        vIndex + 3,
        vIndex,
        vIndex + 2
      ]
    };
  }
}

// Original shader code - kept for future reference
const originalShaders = {
  vertexShader: /* glsl */ `
   uniform float uTime;
   varying vec3 vPosition;
   varying vec2 vUv;
   varying vec3 vNormal;
   float wave(float waveSize, float tipDistance, float centerDistance) {
     // Tip is the fifth vertex drawn per blade
     bool isTip = (gl_VertexID + 1) % 5 == 0;
     float waveDistance = isTip ? tipDistance : centerDistance;
     return sin((uTime / 500.0) + waveSize) * waveDistance;
   }
   void main() {
     vPosition = position;
     vUv = uv;
     vNormal = normalize(normalMatrix * normal);
     if (vPosition.y < 0.0) {
       vPosition.y = 0.0;
     } else {
       vPosition.x += wave(uv.x * 10.0, 0.3, 0.1);
     }
     gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
   }
  `,
  fragmentShader: /* glsl */ `
   uniform sampler2D uCloud;
   varying vec3 vPosition;
   varying vec2 vUv;
   varying vec3 vNormal;
   vec3 green = vec3(0.2, 0.6, 0.3);
   void main() {
     vec3 color = mix(green * 0.7, green, vPosition.y);
     color = mix(color, texture2D(uCloud, vUv).rgb, 0.4);
     float lighting = normalize(dot(vNormal, vec3(10)));
     gl_FragColor = vec4(color + lighting * 0.03, 1.0);
   }
  `
};

// Helper function to create a default texture
function createDefaultTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  // Create a simple gradient pattern
  const gradient = ctx.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, '#dddddd');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Helper function to create a gradient alpha texture
function createGradientAlphaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256; // Taller for better vertical gradient resolution
  const ctx = canvas.getContext('2d');
  
  // Create a vertical gradient from transparent to opaque
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');    // Bottom (transparent)
  // gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)'); // Middle (semi-transparent)
  // gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.8)'); // Upper middle
  gradient.addColorStop(1, 'rgb(0, 0, 0)');    // Top (opaque)
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createGradientColorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256; // Taller for better vertical gradient resolution
  const ctx = canvas.getContext('2d');
  
  // Create a vertical gradient from transparent to opaque
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(0, 255, 191, 0)');    // Bottom (transparent)
  // gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)'); // Middle (semi-transparent)
  // gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.8)'); // Upper middle
  gradient.addColorStop(1, 'rgb(0, 0, 0)');    // Top (opaque)
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Material options for the grass
const materialOptions = {
  // Current rendering mode: 'physical' or 'shader'
  currentMode: 'physical',
  
  // Create a MeshPhysicalMaterial for grass with alpha gradient
  createPhysicalMaterial(color = 0x33aa33) {
    
    // Create a gradient texture for alpha
    const alphaTexture = createGradientAlphaTexture();
    const colortexture = createGradientColorTexture();
    
    return new THREE.MeshPhysicalMaterial({
      // color: colortexture,
      map: alphaTexture,
      roughness: 0.8,
      metalness: 0.1,
      clearcoat: 0.2,
      clearcoatRoughness: 0.8,
      side: THREE.DoubleSide,
      transparent: true,
      alphaMap: alphaTexture,
      alphaTest: 0.1 // Helps avoid sorting issues
    });
  },
  
  // Create the shader material with alpha gradient
  createShaderMaterial(cloudTexture) {
    const texture = cloudTexture && cloudTexture.isTexture ? 
      cloudTexture : createDefaultTexture();
    
    // Modified fragment shader with alpha gradient
    const fragmentShaderWithAlpha = /* glsl */ `
     uniform sampler2D uCloud;
     varying vec3 vPosition;
     varying vec2 vUv;
     varying vec3 vNormal;
     vec3 green = vec3(0.2, 0.6, 0.3);
     void main() {
       vec3 color = mix(green * 0.7, green, vPosition.y);
       color = mix(color, texture2D(uCloud, vUv).rgb, 0.4);
       float lighting = normalize(dot(vNormal, vec3(10)));
       
       // Create alpha gradient based on height (y position)
       // Only blade tips will be fully visible
       float alpha = smoothstep(0.0, 1.0, vPosition.y / 1.4);
       
       gl_FragColor = vec4(color + lighting * 0.03, alpha);
     }
    `;
      
    return new THREE.ShaderMaterial({
      uniforms: {
        uCloud: { value: texture },
        uTime: { value: 0 }
      },
      side: THREE.DoubleSide,
      transparent: true,
      vertexShader: originalShaders.vertexShader,
      fragmentShader: fragmentShaderWithAlpha
    });
  },
  
  // Switch between material modes
  switchMaterialMode(mode) {
    if (mode === 'physical' || mode === 'shader') {
      this.currentMode = mode;
      return true;
    }
    return false;
  }
};

// Grass mesh class that combines geometry and material
class Grass extends THREE.Mesh {
  constructor(size, count, cloudTexture, usePhysicalMaterial = true) {
    // Create grass geometry
    const geometry = new GrassGeometry(size, count);
    
    // Create the appropriate material based on the current mode
    const material = usePhysicalMaterial || materialOptions.currentMode === 'physical' 
      ? materialOptions.createPhysicalMaterial() 
      : materialOptions.createShaderMaterial(cloudTexture);
    
    // Create mesh with geometry and material
    super(geometry, material);
    
    // Remember which material type we're using
    this.usingShaderMaterial = !usePhysicalMaterial && materialOptions.currentMode === 'shader';
    
    // Store cloud texture reference for potential material switching
    this.cloudTexture = cloudTexture;
    
    // No floor plane - we only want the grass blades
  }
  
  // Update method - handles both material types
  update(time) {
    if (this.usingShaderMaterial && this.material.uniforms && this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value = time;
    }
    // Physical material doesn't need time updates
  }
  
  // Switch material type for this grass patch
  switchMaterial(mode) {
    if (mode === materialOptions.currentMode) return; // Already using this mode
    
    if (mode === 'physical') {
      // Switch to physical material
      if (this.material) this.material.dispose();
      this.material = materialOptions.createPhysicalMaterial();
      this.usingShaderMaterial = false;
    } else if (mode === 'shader') {
      // Switch to shader material
      if (this.material) this.material.dispose();
      this.material = materialOptions.createShaderMaterial(this.cloudTexture);
      this.usingShaderMaterial = true;
    }
  }
}

// Find and remove any existing grass planes
function removeExistingGrassPlanes(scene) {
  // Look for circle geometries (which are likely our floor planes)
  scene.traverse(object => {
    // Check if it's a mesh with circle geometry
    if (object.type === 'Mesh' && 
        object.geometry && 
        object.geometry.type === 'CircleGeometry') {
      
      console.log("Found and removing grass floor plane");
      // Remove it from its parent
      if (object.parent) {
        object.parent.remove(object);
      }
      
      // Dispose of resources
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    }
  });
}

// Grass management variables
let grassPatches = [];
let cloudTexture = null;
let isInitialized = false;

function init(scene, manager) {
  // First, remove any existing floor planes
  removeExistingGrassPlanes(scene);
  
  // The texture loader should use the provided loading manager
  const textureLoader = new THREE.TextureLoader(manager);
  
  // Load cloud texture (needed for shader mode)
  textureLoader.load('images/cloud.jpg', 
    // Success callback
    (texture) => {
      cloudTexture = texture;
      cloudTexture.wrapS = cloudTexture.wrapT = THREE.RepeatWrapping;
      
      // Create initial grass patches
      createInitialGrassPatches(scene);
      isInitialized = true;
    },
    // Progress callback
    undefined,
    // Error callback
    (error) => {
      console.error("Error loading cloud texture:", error);
      // Create a fallback texture to avoid errors
      cloudTexture = createDefaultTexture();
      isInitialized = true;
      createInitialGrassPatches(scene);
    }
  );
}

// Create initial grass patches
function createInitialGrassPatches(scene) {
  // Clear existing patches
  for (const patch of grassPatches) {
    scene.remove(patch);
  }
  grassPatches = [];
  
  // Remove any existing floor planes
  removeExistingGrassPlanes(scene);
  
  // Create a primary central patch (larger)
  const centralPatchSize = MAX_PATCH_SIZE + 5;
  const centralPatchCount = MAX_BLADE_COUNT + 200;
  createGrassPatch(scene, 0, -40, centralPatchSize, centralPatchCount);
  
  // Create multiple grass patches spaced throughout the scene
  // More concentrated in the center with more patches
  for (let z = -20; z > -200; z -= 25) { // Closer z spacing
    // More patches per row near the camera
    const patchesInRow = Math.max(2, Math.floor(6 * (1 - Math.abs(z) / 200)));
    
    for (let i = 0; i < patchesInRow; i++) {
      // Center-biased positioning
      const x = centerBiasedRandom() * spreadWidth;
      
      // Larger patches in the center
      const distanceFromCenter = Math.sqrt(x*x + z*z) / Math.sqrt(spreadWidth*spreadWidth + 200*200);
      const sizeFactor = 1 - distanceFromCenter * 0.5;
      
      const size = MIN_PATCH_SIZE + (MAX_PATCH_SIZE - MIN_PATCH_SIZE) * sizeFactor;
      const count = MIN_BLADE_COUNT + Math.floor((MAX_BLADE_COUNT - MIN_BLADE_COUNT) * sizeFactor);
      
      createGrassPatch(scene, x, z, size, count);
    }
  }
}

// Create a single grass patch
function createGrassPatch(scene, x, z, size, count) {
  // Create the grass patch with current material mode
  const usePhysicalMaterial = materialOptions.currentMode === 'physical';
  const grassPatch = new Grass(size, count, cloudTexture, usePhysicalMaterial);
  grassPatch.position.set(x, 0, z);
  scene.add(grassPatch);
  grassPatches.push(grassPatch);
  
  return grassPatch;
}

// Create a new grass patch at the far end
function createNewGrassPatch(scene) {
  for (let attempts = 0; attempts < 10; attempts++) {
    // Center-biased positioning for new patches
    const x = centerBiasedRandom() * spreadWidth;
    const z = generationZ - (Math.random() * 50);
    
    // Larger patches in the center
    const distanceFromCenter = Math.abs(x) / spreadWidth;
    const sizeFactor = 1 - distanceFromCenter * 0.5;
    
    const size = MIN_PATCH_SIZE + (MAX_PATCH_SIZE - MIN_PATCH_SIZE) * sizeFactor;
    const count = MIN_BLADE_COUNT + Math.floor((MAX_BLADE_COUNT - MIN_BLADE_COUNT) * sizeFactor);
    
    // Check if too close to existing patches
    let tooClose = false;
    for (const patch of grassPatches) {
      const dx = patch.position.x - x;
      const dz = patch.position.z - z;
      const distSquared = dx * dx + dz * dz;
      
      if (distSquared < minDistance * minDistance) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      createGrassPatch(scene, x, z, size, count);
      return true;
    }
  }
  
  return false;
}

// Update grass patches - move and manage them
function updateGrass(scene, time, deltaZ) {
  if (!isInitialized) return 0;
  
  // Use a default delta if none provided
  const movementDelta = deltaZ || 0.5;
  
  // Animate grass blades waving (when using shader material)
  for (const patch of grassPatches) {
    if (patch && patch.update) {
      patch.update(time);
    }
    
    // Move grass patch toward camera
    patch.position.z += movementDelta;
  }
  
  // Manage grass patches (remove if behind camera, create new ones)
  let removedCount = 0;
  
  for (let i = grassPatches.length - 1; i >= 0; i--) {
    if (grassPatches[i].position.z > removalZ) {
      // Remove grass patch
      scene.remove(grassPatches[i]);
      
      // Dispose of geometry and materials to free memory
      if (grassPatches[i].geometry) {
        grassPatches[i].geometry.dispose();
      }
      
      if (grassPatches[i].material) {
        if (Array.isArray(grassPatches[i].material)) {
          grassPatches[i].material.forEach(m => m.dispose());
        } else {
          grassPatches[i].material.dispose();
        }
      }
      
      grassPatches.splice(i, 1);
      removedCount++;
      
      // Create a new grass patch at the far end
      createNewGrassPatch(scene);
    }
  }
  
  return grassPatches.length;
}

// Switch material type for all grass patches
function switchMaterialType(mode) {
  if (mode !== 'physical' && mode !== 'shader') {
    console.warn("Invalid material mode. Use 'physical' or 'shader'");
    return false;
  }
  
  // Update the global setting
  materialOptions.switchMaterialMode(mode);
  
  // Update all existing grass patches
  for (const patch of grassPatches) {
    if (patch && patch.switchMaterial) {
      patch.switchMaterial(mode);
    }
  }
  
  return true;
}

// Get all grass patches (for external access)
function getAllGrassPatches() {
  return grassPatches;
}

// Get current material mode
function getCurrentMaterialMode() {
  return materialOptions.currentMode;
}

// Clean up resources
function dispose() {
  for (const patch of grassPatches) {
    if (patch.geometry) patch.geometry.dispose();
    if (patch.material) {
      if (Array.isArray(patch.material)) {
        patch.material.forEach(m => m.dispose());
      } else {
        patch.material.dispose();
      }
    }
  }
  
  grassPatches = [];
  if (cloudTexture) cloudTexture.dispose();
  cloudTexture = null;
  isInitialized = false;
}

// Export necessary functions for other modules
export {
  init,
  updateGrass,
  Grass,
  getAllGrassPatches,
  switchMaterialType,
  getCurrentMaterialMode,
  dispose,
  isInitialized,
  removeExistingGrassPlanes
};
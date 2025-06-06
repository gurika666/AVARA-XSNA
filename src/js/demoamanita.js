import * as THREE from 'three';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { LineHandler } from './lineHandler.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';


// Register the ScrollTrigger plugin
gsap.registerPlugin(ScrollTrigger);



// Global variables

let scene, renderer, camera, controls, statuemesh, envMap, material;
let composer, bloomPass;
let isCameraAnimating = false;
let mixer, animations;
let lineHandler;
let animationActions = []; // Array to store all animation actions

// Config
const config = {
  lineWidth: 2,
  minLineWidth: 0.1,    // Minimum line width for variation - lower for more dramatic thin lines
  maxLineWidth: 5.0,    // Maximum line width for variation - higher for more dramatic thick lines
  widthDistribution: 10.8, // Value below 1.0 favors thicker lines, above 1.0 favors thinner lines
  widthVariationMode: 'spatial', // Determines whether width varies by spatial position
  opacity: 0.2,
  bezierCurveAmount: 0.07,   // Amount of curve (0 = straight, higher = more curved)
  orbitControls: {
    enabled: false,           // Whether orbit controls are enabled
    enableDamping: true,     // Whether damping is enabled
    dampingFactor: 0.1       // Damping factor for smoother controls
  },

  bloom: {
    strength: 0.5,           // Bloom strength
    radius: 0.4,             // Bloom radius
    threshold: 0.1           // Bloom threshold
  }
};

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
hdriLoader.load('images/02.hdr', function(texture) {
    envMap = texture;
    envMap.mapping = THREE.EquirectangularReflectionMapping;

    material = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      metalness: 0.1,
      roughness: 0.5,
      thickness: 0.5,
      side: THREE.DoubleSide,
      envMap: envMap
    });
    
});

hdriLoader.load('images/bg.hdr', function(texture) {
  const bg = texture;
  bg.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = bg;
});

// Load model with animation
const loader = new GLTFLoader(loadingManager);

loader.load("mesh/man3.glb", (gltf) => {
  camera = gltf.cameras[0];
 

  gltf.scene.traverse((child) => {
    if(child.name.includes("statue_")){
      statuemesh = child;
      statuemesh.material = material;
    }
    if(child.name.includes("line_")){
      child.visible = false;
    }
  });
  
  console.log("Model loaded:", gltf);
  scene.add(gltf.scene);
 
  // Set up animation mixer
  if (gltf.animations && gltf.animations.length > 0) {
    animations = gltf.animations;
    mixer = new THREE.AnimationMixer(gltf.scene);
    
    // Create actions for all animations and store them in the array
    for (let i = 0; i < animations.length; i++) {
      const action = mixer.clipAction(animations[i]);
      action.timeScale = 1;
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
      action.play();
      
      animationActions.push(action);
      
      console.log(`Added animation ${i}: ${animations[i].name}`);
    }
    
    // Now create the scroll-based animation controller for all animations
    createAnimationController(mixer, animationActions, animations);
  }
  
  // Initialize line handler and create curves
  lineHandler = new LineHandler(config);
  lineHandler.createCurvesFromEdgeModel(gltf.scene).forEach(curve => {
    curve.renderOrder = 1;
    scene.add(curve);
  });
  
  // Randomize line widths on initial load
  // Set to 'uniform', 'normal', 'extreme', or 'spatial' for different distribution patterns
  randomizeLineWidths('normal');
  
  // Optional: Log the variety of line widths for debugging
  logLineWidthDistribution();
});

// Helper function to log line width distribution
function logLineWidthDistribution() {
  if (!lineHandler || !lineHandler.getLineCurves().length) return;
  
  const widths = lineHandler.getLineCurves().map(curve => curve.material.linewidth);
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);
  const avgWidth = widths.reduce((sum, width) => sum + width, 0) / widths.length;
  
  console.log(`Line width distribution - Min: ${minWidth.toFixed(2)}, Max: ${maxWidth.toFixed(2)}, Avg: ${avgWidth.toFixed(2)}`);
  console.log(`Total curves: ${widths.length}`);
}

function createAnimationController(mixer, actions, clips) {
  console.log("Creating animation controller for", actions.length, "animations");
  
  // Create a proxy object that will control all animations
  let proxy = {
    get time() {
      return mixer.time;
    },
    set time(value) {
      // Unpause all actions
      actions.forEach(action => {
        action.paused = false;
      });
      
      // Set mixer time
      mixer.setTime(value);
      
      // Pause all actions again (this freezes them at the current time)
      actions.forEach(action => {
        action.paused = true;
      });
    },
  };
  
  // Initialize time to 0
  proxy.time = 0;
  
  // Get the longest animation duration to use as the timeline duration
  const maxDuration = Math.max(...clips.map(clip => clip.duration));
  
  // Create the scroll timeline
  let scroll = gsap.timeline({
    scrollTrigger: {
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: function (self) {
        // console.log("Scroll progress:", self.progress.toFixed(2));
        const totalTime = maxDuration;
        proxy.time = self.progress * totalTime;
      },
    },
  });

  // Reset scroll position
  window.scrollTo(0, 0);
}

// Initialize the scene
function init() {
  // Set up renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.querySelector("#canvas") });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  
  // Set up camera
 
  camera.position.z = 5;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();


  // Create composer
  composer = new EffectComposer(renderer);
  // composer.setSize(window.innerWidth, window.innerHeight);
  
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
  
  // Set up controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = config.orbitControls.enableDamping;
  controls.dampingFactor = config.orbitControls.dampingFactor;
  controls.enabled = config.orbitControls.enabled;

  const light = new THREE.AmbientLight(0xffffff, 1);
  scene.add(light);
  
  // Add window resize listener
  window.addEventListener("resize", onWindowResize);

  
  // Set rendering order
  if (statuemesh) {
    statuemesh.renderOrder = 0;
    scene.add(statuemesh);
  }
 
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
  // Update orbit control settings
  if (params.orbitControls) {
    config.orbitControls.enabled = params.orbitControls.enabled !== undefined ? 
      params.orbitControls.enabled : config.orbitControls.enabled;
    config.orbitControls.enableDamping = params.orbitControls.enableDamping !== undefined ? 
      params.orbitControls.enableDamping : config.orbitControls.enableDamping;
    config.orbitControls.dampingFactor = params.orbitControls.dampingFactor !== undefined ? 
      params.orbitControls.dampingFactor : config.orbitControls.dampingFactor;
    
    // Update controls if they exist
    if (controls) {
      controls.enabled = config.orbitControls.enabled;
      controls.enableDamping = config.orbitControls.enableDamping;
      controls.dampingFactor = config.orbitControls.dampingFactor;
    }
  }
  
  // Update line properties
  if (params.lineWidth !== undefined || params.minLineWidth !== undefined || 
      params.maxLineWidth !== undefined || params.opacity !== undefined ||
      params.bezierCurveAmount !== undefined || params.widthDistribution !== undefined) {
    
    // Update config
    if (params.lineWidth !== undefined) config.lineWidth = params.lineWidth;
    if (params.minLineWidth !== undefined) config.minLineWidth = params.minLineWidth;
    if (params.maxLineWidth !== undefined) config.maxLineWidth = params.maxLineWidth;
    if (params.widthDistribution !== undefined) config.widthDistribution = params.widthDistribution;
    if (params.opacity !== undefined) config.opacity = params.opacity;
    if (params.bezierCurveAmount !== undefined) config.bezierCurveAmount = params.bezierCurveAmount;
    
    // Update line handler if it exists
    if (lineHandler) {
      lineHandler.updateLineProperties({
        lineWidth: params.lineWidth,
        minLineWidth: params.minLineWidth,
        maxLineWidth: params.maxLineWidth,
        widthDistribution: params.widthDistribution,
        opacity: params.opacity,
        bezierCurveAmount: params.bezierCurveAmount,
        updateExisting: params.updateExistingLines || false,
        setUniformWidth: params.setUniformWidth || false,
        regenerateWidths: params.regenerateWidths || false,
        fullyRandom: params.fullyRandom || false
      });
    }
  }

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
}

/**
 * Completely randomize all line widths using various distribution patterns
 * @param {string} mode - The randomization mode: 'uniform', 'normal', 'extreme'
 */
function randomizeLineWidths(mode = 'normal') {
  if (!lineHandler) return;
  
  if (mode === 'uniform') {
    // Simple uniform randomization
    lineHandler.randomizeLineWidths();
  } else if (mode === 'extreme') {
    // Create more extreme contrast with very thin and very thick lines
    const originalMin = config.minLineWidth;
    const originalMax = config.maxLineWidth;
    
    // Temporarily change the config to allow more extreme values
    config.minLineWidth = originalMin * 0.5;  // Even thinner minimum
    config.maxLineWidth = originalMax * 1.5;  // Even thicker maximum
    
    lineHandler.randomizeLineWidths();
    
    // Restore original range
    config.minLineWidth = originalMin;
    config.maxLineWidth = originalMax;
  } else if (mode === 'spatial') {
    // Create lines that vary by spatial position (distance from center or height)
    // This requires custom code to read and use line positions
    const center = new THREE.Vector3(0, 0, 0);
    
    lineHandler.getLineCurves().forEach(curve => {
      if (curve.material) {
        // Compute center of the line
        const geometry = curve.geometry;
        const positionAttribute = geometry.getAttribute('position');
        const midIndex = Math.floor(positionAttribute.count / 2);
        
        // Get mid-point position
        const midPoint = new THREE.Vector3(
          positionAttribute.getX(midIndex),
          positionAttribute.getY(midIndex),
          positionAttribute.getZ(midIndex)
        );
        
        // Transform to world position if needed
        midPoint.applyMatrix4(curve.matrixWorld);
        
        // Calculate distance from center
        const distFromCenter = midPoint.distanceTo(center);
        
        // Use normalized distance for width
        const maxDist = 5.0; // Adjust based on your scene scale
        const normDist = Math.min(distFromCenter / maxDist, 1.0);
        
        // Map to width range - can invert relation if needed
        // Here, lines farther from center are thinner
        const width = config.maxLineWidth - normDist * (config.maxLineWidth - config.minLineWidth);
        
        curve.material.linewidth = width;
        curve.userData.customWidth = width;
      }
    });
  } else {
    // Default normal randomization
    lineHandler.randomizeLineWidths();
  }
  
  console.log(`Randomized line widths using '${mode}' distribution`);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Only update controls if not animating
  if (!isCameraAnimating && controls.enabled) {
    controls.update();
  }
  
  // Update camera animation if active
  if (isCameraAnimating) {
    updateCameraAnimation(performance.now());
  }
  
  // Note: We no longer need to update the mixer in the animation loop
  // as it's now controlled by the scroll position
  
  // Render scene with post-processing
  composer.render();
}
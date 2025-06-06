import * as THREE from "three";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
// import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as GUI from './gui.js';
import * as AudioController from './audio-Controller.js';
import * as TreeManager from './tree-manager.js';
import * as GrassModule from './Grass.js'; // Import the grass module
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createSkyPlane, updateCloudUniforms } from './sky-material.js';
import { ChromaticAberrationPass } from './chromatic-aberration.js'; // Import our new effect
import { DisplacementPass } from './displacement-pass.js';
import { DisplacementScenePass } from './DisplacementScenePass.js';

// Global variables
let camera, scene, renderer;
let composer, bloomPass, chromaticAberrationPass;
let isAnimating = false;
let animationId = null;
let lastTime = null;
let envMap, spotlightHelper;
let skyPlane;
let txthdr;
let textureloader = new THREE.TextureLoader();
let displacementScenePass;

let spotlight, spotlightTarget;


// Add raycaster for cursor-based targeting
let raycaster = new THREE.Raycaster();
// Normalized mouse coordinates
let mouseNDC = new THREE.Vector2();

// Mouse interaction variables
let mouseX = 0;
let mouseY = 0;
// Base camera rotation (looking forward)
const cameraBaseRotation = new THREE.Euler(0, 0, 0, 'YXZ');
// Maximum rotation in radians
const maxRotation = 0.15; 
// How quickly the camera rotates toward the target
const rotationEasing = 0.05;


let font;


let displacementTexture;

const config = {
  text: {
    size: 2,
    height: 0.1,
    depth: 1,
    z: -50
  },
  bloom: {
    strength: 1,           // Bloom strength
    radius: 20,             // Bloom radius
    threshold: 0.4           // Bloom threshold
  },
  chromaticAberration: {
    strength: 0.1,         // Initial chromatic aberration strength
    audioResponsive: true   // Whether the effect strength responds to audio
  },
  flashligh:{
    // color: 0xffffff,
    color: 0xff0000,
  },
  displacement: {
    scale: 0.5,        // Initial displacement scale
    audioResponsive: false,  // Whether the effect strength responds to audio
    speed: 0.2          // Animation speed
  }
};

// Define when text should appear (in seconds)
let textAppearTimes = [
  { time: 0.593, text: "თვალებს" },
  { time: 26.593, text: "თვალებს" },
  { time: 27.593, text: "ადევს" },
  { time: 28.593, text: "ნამი" },
  { time: 29.777, text: "ზღვაა" },
  { time: 30.777, text: "ძაან" },
  { time: 31.777, text: "წყნარი" },
  { time: 32.890, text: "ცაზე" },
  { time: 33.890, text: "ფანტავს ელვებს" },
  { time: 35, text: "დაუოკებელი" },
  { time: 36.243, text: "ბრაზი" },
  { time: 37.8, text: "ახალს" },
  { time: 38.8, text: "არაფერს" },
  { time: 39.8, text: "არ გეტყვი" },
];

// Constants
const moveSpeed = 0.5;
const fogColor = 0x000000; // Black fog
const fogNear = 30;        // Fog starts at this distance
const fogFar = 100;        // Fog is completely opaque at this distance

// Resource loading tracking
let resourcesLoaded = {
  hdri: false,
  font: false,
  displacement: false
};

// -------------------------------------------------------------
// Resource Loaders Setup
// -------------------------------------------------------------
// Create a loading manager to track all resources
const manager = new THREE.LoadingManager();

manager.onProgress = function(url, loaded, total) {
  // Update loading progress bar
  const overallProgress = (loaded / total) * 100;
  console.log(`Overall loading: ${Math.round(overallProgress)}%`);
};

manager.onLoad = function() {
  console.log('All resources loaded successfully');
  completeSetup();
  TreeManager.createInitialTrees(scene);
  
  // Make sure audio is properly initialized before enabling controls
  setTimeout(() => {
    enableControls();
  }, 100);
};

manager.onError = function(url) {
  console.error('Error loading resource:', url);
};

// Initialize basics first (canvas, renderer)
function initBasics() {
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  // Create scene early
  scene = new THREE.Scene();

  const txthdrloader = new RGBELoader();
  txthdrloader.load('images/txt.hdr', function(texture){
  txthdr = texture;
  txthdr.mapping = THREE.EquirectangularReflectionMapping;

});
  
  // Initialize GUI first (for loading indicators)
  GUI.setupUI(
    startAnimation,  // Start callback
    pauseAnimation   // Pause callback
  );
  
  // Initialize audio controller
  AudioController.init({
    onTimeUpdate: updateTimeBasedEvents,
    onScrubComplete: resetTextDisplay
  });
  
  // Initialize tree manager
  TreeManager.init(scene, manager);
  
  // Initialize grass module
  GrassModule.init(scene, manager);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    if (camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// -------------------------------------------------------------
// Load Resources
// -------------------------------------------------------------
function loadResources() {

 // Load displacement texture
 textureloader.load('images/displacement-map.png', function(texture) {
  displacementTexture = texture;
  displacementTexture.wrapS = THREE.RepeatWrapping;
  displacementTexture.wrapT = THREE.RepeatWrapping;
  resourcesLoaded.displacement = true;
  GUI.updateLoadingProgress('displacement', 100);
  checkAllResourcesLoaded();
}, 
(xhr) => {
  GUI.updateLoadingProgress('displacement', xhr.loaded / xhr.total * 100);
},
(error) => {
  console.error('Error loading displacement texture:', error);
  // Continue anyway
  resourcesLoaded.displacement = true;
  GUI.updateLoadingProgress('displacement', 100);
  checkAllResourcesLoaded();
});

  // Load HDRI environment map
  const hdriLoader = new RGBELoader(manager);
  hdriLoader.load('images/01.hdr', function(texture) {
    envMap = texture;
    envMap.mapping = THREE.EquirectangularReflectionMapping;
    resourcesLoaded.hdri = true;
    GUI.updateLoadingProgress('hdri', 100);
    checkAllResourcesLoaded();
  });

  // Load font
  const fontLoader = new FontLoader(manager);
  fontLoader.load(
    'fonts/Monarch_Regular.json',
    (loadedFont) => {
      font = loadedFont;
      resourcesLoaded.font = true;
      GUI.updateLoadingProgress('font', 100);
      checkAllResourcesLoaded();
    },
    (xhr) => {
      GUI.updateLoadingProgress('font', xhr.loaded / xhr.total * 100);
    },
    (error) => {
      console.error('Error loading font:', error);
      resourcesLoaded.font = true; // Mark as loaded even if it failed
      checkAllResourcesLoaded();
    }
  );

  // Let the AudioController handle audio loading
  AudioController.loadAudio('audio/xsna.mp3');
}

// Check if all resources are loaded
function checkAllResourcesLoaded() {
  const allLoaded = resourcesLoaded.hdri && resourcesLoaded.font && 
                    resourcesLoaded.displacement &&
                    AudioController.isAudioLoaded() && TreeManager.isLoaded();
  if (allLoaded) {
    console.log("All resources loaded, setting up scene");
    manager.onLoad();
  }
}

// -------------------------------------------------------------
// Scene Setup (after all resources are loaded)
// -------------------------------------------------------------
function completeSetup() {
  // Configure scene
  scene.background = new THREE.Color(0x000000); // Black background
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

  // Create camera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2, 0);
  // Set initial camera rotation instead of lookAt
  camera.rotation.set(cameraBaseRotation.x, cameraBaseRotation.y, cameraBaseRotation.z);

  // Add mouse move event listener for camera movement
  document.addEventListener('mousemove', onMouseMove);

  // Optional: Add touch move event listener for mobile
  document.addEventListener('touchmove', onTouchMove, { passive: false });

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

  // Initialize the displacement scene pass with text support
  displacementScenePass = new DisplacementScenePass(renderer, config.displacement.scale);
  // Initialize it with the loaded font
  displacementScenePass.initTextSupport(font);
  // Configure text display properties
  displacementScenePass.setTextConfig({
    size: config.text.size , // Scale down the size for the displacement scene
    height: config.text.height,
    depth: config.text.depth,
    z: config.text.z // Start further back in the displacement scene
  });
  // Configure movement speed and removal distance
  displacementScenePass.setTextMoveSpeed(moveSpeed); // Slower movement in displacement scene
  displacementScenePass.setTextRemovalZ(5); // Point where text gets removed
  composer.addPass(displacementScenePass);

  // Add chromatic aberration pass
  chromaticAberrationPass = new ChromaticAberrationPass(config.chromaticAberration.strength);
  chromaticAberrationPass.update(renderer, window.innerWidth, window.innerHeight);
  // composer.addPass(chromaticAberrationPass);
  composer.addPass(bloomPass);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
  // scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0x111111, 5);
  // directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

spotlight = new THREE.SpotLight(config.flashligh.color, 5);
spotlight.position.set(0, 2, 0);
spotlight.angle = Math.PI / 12; 
spotlight.penumbra = 0.7; // Soft edge
spotlight.decay = 1; // Physical light decay
spotlight.distance = 100; // Maximum distance
spotlight.castShadow = false;
spotlight.shadow.mapSize.width = 1024;
spotlight.shadow.mapSize.height = 1024;
spotlight.shadow.camera.near = 1;
spotlight.shadow.camera.far = 200;
// Create a separate target object and add it to the scene
spotlightTarget = new THREE.Object3D();
spotlightTarget.position.set(0, 0, -100);
scene.add(spotlightTarget);
// Set the spotlight target
spotlight.target = spotlightTarget;
scene.add(spotlight);



  // Add audioListener to camera (for AudioController to use)
  if (AudioController.getAudioListener) {
    camera.add(AudioController.getAudioListener());
  }

  // Create a sky plane with clouds
  skyPlane = createSkyPlane({
    width: 200,
    height: 200,
    position: new THREE.Vector3(0, 20, -50),
    rotation: new THREE.Euler(Math.PI / 2.1, 0, Math.PI / -2),
    colors: {
      cloudColor: '#000000',
      skyTopColor: '#151761',
      skyBottomColor: '#000000'
    }
  });
  scene.add(skyPlane);

  // Update window resize handler
  window.removeEventListener('resize', onWindowResize);
  window.addEventListener('resize', onWindowResize);
}

// Mouse move handler
function onMouseMove(event) {
  // Calculate mouse position relative to center of screen
  mouseX = (event.clientX - window.innerWidth / 2);
  mouseY = (event.clientY - window.innerHeight / 2);
}

// Touch move handler for mobile
function onTouchMove(event) {
  if (event.touches.length > 0) {
    // Prevent default to avoid scrolling
    event.preventDefault();
    
    // Get touch position relative to center
    mouseX = (event.touches[0].clientX - window.innerWidth / 2);
    mouseY = (event.touches[0].clientY - window.innerHeight / 2);
  }
}

// Update time-based events (texts, etc.) - only for displacement scene
function updateTimeBasedEvents(currentTime, deltaTime) {
  // We're only handling text in the displacement scene now,
  // so we don't need any text update logic in the main scene
  
  // Just forward the information to the displacement scene pass if it exists
  if (displacementScenePass) {
    displacementScenePass.updateTextBasedOnAudioTime(currentTime, deltaTime, textAppearTimes);
  }
}

// Reset text display when scrubbing - only for displacement scene
function resetTextDisplay(targetTime) {
  // Reset text only in the displacement scene
  if (displacementScenePass) {
    displacementScenePass.resetTextDisplay(targetTime, textAppearTimes);
  }
}

// Window resize handler
function onWindowResize() {
  // Update camera
  if (camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  
  // Update renderer
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Update composer if it exists
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  
  // Update displacement scene pass size
  if (displacementScenePass) {
    displacementScenePass.setSize(window.innerWidth, window.innerHeight);
  }
}

// Enable controls after loading
function enableControls() {
  const audioDuration = AudioController.getAudioDuration();
  const treeCount = TreeManager.getTreeCount();
  
  GUI.enableControls(audioDuration, treeCount);
  
  // Setup additional GUI controls for audio/scrubbing
  GUI.setupScrubber(
    AudioController.handleScrubberInput,
    AudioController.handleScrubberChange
  );
}

// -------------------------------------------------------------
// Animation & Runtime Functions
// -------------------------------------------------------------
// Animation loop - contains all real-time operations

function animate(time) {
  if (!isAnimating) return;
  
  animationId = requestAnimationFrame(animate);
  
  // Calculate delta time with safety check
  let deltaTime = 0;
  
  if (lastTime !== null) {
    // Calculate delta in seconds
    deltaTime = (time - lastTime) / 1000;
    
    // Safety cap to avoid huge jumps (no more than 1/10 second)
    deltaTime = Math.min(deltaTime, 0.1);
  }
  
  // Update last time
  lastTime = time;
  
  const audioTime = AudioController.getCurrentTime() * 0.03; // Scale factor to adjust speed
  updateCloudUniforms(skyPlane.material, audioTime, window.innerWidth, window.innerHeight);
  
  // Calculate distance to move this frame (speed * time)
  const deltaZ = moveSpeed * (deltaTime * 60);
  
  // Update trees through TreeManager
  const updatedTreeCount = TreeManager.updateTrees(scene, deltaZ);
  
  // Update grass animation
  GrassModule.updateGrass(scene, time);
  
  // Update audio controller (time tracking, etc.)
  AudioController.update(deltaTime, updatedTreeCount);

  if (spotlightHelper) spotlightHelper.update();
  


  if (displacementScenePass) {
    // Use a fixed displacement scale instead of audio-responsive one
    let displacementScale = config.displacement.scale;
    
    // Update the displacement scene pass with the current audio time, delta time, text info and scale
    displacementScenePass.update(
      renderer,
      time,
      AudioController.getCurrentTime(),
      deltaTime,
      textAppearTimes,
      displacementScale
    );
  }

  // Calculate target rotation based on mouse position
  const targetRotationY = (mouseX / window.innerWidth) * maxRotation;
  const targetRotationX = (mouseY / window.innerHeight) * maxRotation;

  // Apply smooth easing to rotation
  camera.rotation.y += (targetRotationY - camera.rotation.y) * rotationEasing;
  camera.rotation.x += (targetRotationX - camera.rotation.x) * rotationEasing;

  // Make sure we don't rotate too far
  camera.rotation.x = Math.max(-maxRotation, Math.min(maxRotation, camera.rotation.x));
  camera.rotation.y = Math.max(-maxRotation, Math.min(maxRotation, camera.rotation.y));

  mouseNDC.x = (mouseX / window.innerWidth) * 2;
  mouseNDC.y = -(mouseY / window.innerHeight) * 2;

// Set up raycaster from camera through cursor position
  raycaster.setFromCamera(mouseNDC, camera);

  // Calculate point at a fixed distance from camera
const targetDistance = 50;
const targetPoint = new THREE.Vector3();
raycaster.ray.at(targetDistance, targetPoint);

// Point spotlight at this target point
spotlightTarget.position.copy(targetPoint);

// Make sure the spotlight position follows the camera
spotlight.position.copy(camera.position);

  // Render scene
  if (scene && camera) {
    // renderer.render(scene, camera);
    composer.render();
  }
}

// Start the animation
function startAnimation() {
  // Update UI
  GUI.updatePlaybackState(true);
  
  // Start audio through the controller
  AudioController.startAudio();
  
  // Start animation - reset lastTime to avoid jumps
  lastTime = null;
  isAnimating = true;
  animate(performance.now());
}

// Pause the animation
function pauseAnimation() {
  if (!isAnimating) return;

  // Pause audio through the controller
  AudioController.pauseAudio();

  // Cancel animation frame
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Stop animating
  isAnimating = false;

  // Update UI
  GUI.updatePlaybackState(false);
}

// -------------------------------------------------------------
// Main Execution
// -------------------------------------------------------------
// Initialize basics first
initBasics();

// Start loading resources
loadResources();

// Export necessary functions for other modules
export {
  scene,
  resetTextDisplay,
  updateTimeBasedEvents
};
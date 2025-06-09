// app.js - Optimized main application with streamlined loading and animation blending
import * as THREE from "three";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { DisplacementScenePass } from './DisplacementScenePass.js';
import { ChromaticAberrationPass, CursorPlane, createSkyPlane, updateCloudUniforms } from './shader-manager.js';
import * as GUI from './gui.js';
import * as AudioController from './audio-controller.js';
import * as VegetationManager from './vegetation-manager.js';
import * as LoadingManager from './loading-manager.js';

// Globals
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass, displacementScenePass;
let isAnimating = false, animationId = null, lastTime = null, isSetupComplete = false;
let skyPlane, gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font, txthdr;
let cursorPlane = new CursorPlane();

// Character animation specific variables
let walkAnimation = null;
let faceUpAnimation = null;
let hasTransitioned = false; // Track if we've already transitioned

// Animation timing
const animStartTime = 10; // When to start transitioning to faceUp
const animEndTime = 20;  // Camera animation end time
const transitionDuration = 0.8; // Duration of the blend in seconds

const textureloader = new THREE.TextureLoader();
const config = {
  text: { size: 2, height: 0.1, depth: 1, z: -50 },
  bloom: { strength: 1, radius: 20, threshold: 0.4 },
  chromaticAberration: { strength: 0.1 },
  displacement: { scale: 0.5, speed: 0.2 },
  camera: { fov: 40 },
  glb: {
    path: 'mesh/latex.glb',
    position: new THREE.Vector3(0, 0, -100),
    scale: new THREE.Vector3(1, 1, 1),
    rotation: new THREE.Euler(0, 0, 0),
    autoplay: true
  }
};

const textAppearTimes = [
  { time: 0.593, text: "თვალებს" }, { time: 26.593, text: "თვალებს" },
  { time: 27.593, text: "ადევს" }, { time: 28.593, text: "ნამი" },
  { time: 29.777, text: "ზღვაა" }, { time: 30.777, text: "ძაან" },
  { time: 31.777, text: "წყნარი" }, { time: 32.890, text: "ცაზე" },
  { time: 33.890, text: "ფანტავს ელვებს" }, { time: 35, text: "დაუოკებელი" },
  { time: 36.243, text: "ბრაზი" }, { time: 37.8, text: "ახალს" },
  { time: 38.8, text: "არაფერს" }, { time: 39.8, text: "არ გეტყვი" }
];

// Resources to be loaded
const resources = {
  hdri: null,
  txthdr: null,
  displacement: null,
  font: null,
  glb: null,
  audio: null,
  vegetation: null
};

// Initialize
async function init() {
  // Setup renderer first
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 30, 100);
  
  // Setup UI and show loading screen
  GUI.setupUI(startAnimation, pauseAnimation);
  GUI.showLoadingScreen();
  
  // Initialize controllers
  AudioController.init({ 
    onTimeUpdate: (t, dt) => displacementScenePass?.updateTextBasedOnAudioTime(t, dt, textAppearTimes),
    onScrubComplete: t => displacementScenePass?.resetTextDisplay(t, textAppearTimes)
  });
  
  // Setup event listeners
  setupEventListeners();
  
  // Start loading all resources
  try {
    await loadAllResources();
    completeSetup();
  } catch (error) {
    console.error('Loading failed:', error);
    GUI.showLoadingError(error.message);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Window resize
  window.addEventListener('resize', onWindowResize);
  
  // Mouse/touch movement
  document.addEventListener('mousemove', e => {
    mouseX = e.clientX - window.innerWidth / 2;
    mouseY = e.clientY - window.innerHeight / 2;
  });
  
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 0) {
      e.preventDefault();
      mouseX = e.touches[0].clientX - window.innerWidth / 2;
      mouseY = e.touches[0].clientY - window.innerHeight / 2;
    }
  }, { passive: false });
  
  // Keyboard controls - SPACE for play/pause
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      if (isSetupComplete) {
        if (isAnimating) {
          pauseAnimation();
        } else {
          startAnimation();
        }
      }
    }
  });
  
  // Setup scrubber
  GUI.setupScrubber(AudioController.handleScrubberInput, AudioController.handleScrubberChange);
}

// Centralized resource loading
async function loadAllResources() {
  let allResourcesLoaded = false;
  
  const manager = LoadingManager.create(
    onProgress, 
    () => {
      // This is called when ALL resources tracked by the manager are loaded
      allResourcesLoaded = true;
      // console.log('LoadingManager reports all resources loaded');
    },
    (url) => {
      console.error('Failed to load:', url);
    }
  );
  
  // Start all loading tasks
  const loadingTasks = [
    // Load HDR textures
    loadHDRTexture('images/txt.hdr', 'txthdr', manager),
    loadHDRTexture('images/01.hdr', 'hdri', manager),
    
    // Load displacement texture
    loadTexture('images/displacement-map.png', 'displacement', manager),
    
    // Load font
    loadFont('fonts/Monarch_Regular.json', manager),
    
    // Load GLB model
    loadGLB(config.glb.path, manager),
    
    // Load audio (not tracked by manager)
    loadAudio('audio/xsna.mp3'),
    
    // Initialize vegetation (this will use the manager internally)
    initVegetation(manager)
  ];
  
  // Wait for all promises to resolve
  await Promise.all(loadingTasks);
  
  // Also wait for the manager to report completion
  if (!allResourcesLoaded) {
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (allResourcesLoaded) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10000);
    });
  }
  
  console.log('All resources fully loaded');
}

// Loading functions
async function loadHDRTexture(path, key, manager) {
  return new Promise((resolve, reject) => {
    new RGBELoader(manager).load(
      path,
      texture => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        resources[key] = texture;
        resolve();
      },
      undefined,
      error => reject(new Error(`Failed to load HDR: ${path}`))
    );
  });
}

async function loadTexture(path, key, manager) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader(manager).load(
      path,
      texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        resources[key] = texture;
        resolve();
      },
      undefined,
      error => reject(new Error(`Failed to load texture: ${path}`))
    );
  });
}

async function loadFont(path, manager) {
  return new Promise((resolve, reject) => {
    new FontLoader(manager).load(
      path,
      loadedFont => {
        font = loadedFont;
        resources.font = loadedFont;
        resolve();
      },
      undefined,
      error => reject(new Error('Failed to load font'))
    );
  });
}

async function loadGLB(path, manager) {
  return new Promise((resolve, reject) => {
    new GLTFLoader(manager).load(
      path,
      gltf => {
        gltfModel = gltf.scene;
        
        // Apply txthdr to latex materials
        if (resources.txthdr) {
          gltfModel.traverse(child => {
            if (child.isMesh && child.material?.name?.includes("latex_")) {
              const mat = child.material.clone();
              mat.envMap = resources.txthdr;
              mat.envMapIntensity = 1.0;
              mat.needsUpdate = true;
              child.material = mat;
            }
          });
        }
        
        const { position: p, scale: s, rotation: r } = config.glb;
        gltfModel.position.copy(p);
        gltfModel.scale.copy(s);
        gltfModel.rotation.copy(r);
        scene.add(gltfModel);
        
        
        // Handle animations
        if (gltf.animations?.length) {
          gltfMixer = new THREE.AnimationMixer(gltfModel);
          gltf.animations.forEach(clip => {
            const action = gltfMixer.clipAction(clip);
            
            // Handle Walk_01 animation
            if (clip.name === 'Walk_01') {
              walkAnimation = action;
              action.setLoop(THREE.LoopRepeat);
              action.timeScale = 0.7;
              action.play(); // Start walking animation immediately
              console.log('Started Walk_01 animation');
            }
            // Handle faceUp animation
            else if (clip.name === 'faceUp') {
              faceUpAnimation = action;
              action.setLoop(THREE.LoopOnce);
              action.clampWhenFinished = true; // Keep the final pose
              action.setEffectiveWeight(1.0); // Ensure weight is set
              // Don't play it yet - will be triggered at startTime
              console.log('Prepared faceUp animation');
            }
            // Handle any other animations
            else {
              action.setLoop(THREE.LoopRepeat);
              action.timeScale = 0.7;
              gltfAnimationActions.push(action);
              if (config.glb.autoplay) action.play();
            }
          });
        }
        
        resources.glb = gltfModel;
        console.log(gltf.animations)
        resolve();
      },
      undefined,
      error => reject(new Error('Failed to load GLB model'))
    );
  });
}

async function loadAudio(path) {
  return new Promise((resolve) => {
    AudioController.loadAudio(path);
    // Audio loading is handled internally by AudioController
    // We'll resolve immediately and let it load in background
    resources.audio = true;
    resolve();
  });
}

async function initVegetation(manager) {
  return new Promise((resolve) => {
    // Track vegetation loading state
    let vegetationLoaded = false;
    let checkInterval;
    
    // Initialize vegetation manager
    VegetationManager.init(scene, manager);
    
    // Check if vegetation resources are loaded
    const checkVegetationLoaded = () => {
      if (VegetationManager.isLoaded()) {
        vegetationLoaded = true;
        resources.vegetation = true;
        if (checkInterval) clearInterval(checkInterval);
        resolve();
      }
    };
    
    // Check immediately and then periodically
    checkVegetationLoaded();
    if (!vegetationLoaded) {
      checkInterval = setInterval(checkVegetationLoaded, 100);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (!vegetationLoaded) {
          console.warn('Vegetation loading timed out');
          if (checkInterval) clearInterval(checkInterval);
          resources.vegetation = true;
          resolve();
        }
      }, 30000);
    }
  });
}

// Progress callback
function onProgress(itemUrl, itemsLoaded, itemsTotal) {
  const progress = (itemsLoaded / itemsTotal) * 100;
  GUI.updateLoadingProgress('overall', progress);
  // console.log(`Loading: ${itemsLoaded}/${itemsTotal} - ${progress.toFixed(1)}%`);
}

// Complete setup after loading
function completeSetup() {
  if (isSetupComplete) return;
  
  // Create camera
  camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2, 0);
  if (AudioController.getAudioListener) camera.add(AudioController.getAudioListener());
  
  // Setup composer and passes
  setupPostProcessing();
  
  // Setup lights
  setupLights();
  
  // Create sky plane
  skyPlane = createSkyPlane({
    width: 300, height: 300,
    position: new THREE.Vector3(0, 40, -50),
    rotation: new THREE.Euler(Math.PI / 2.1, 0, Math.PI / -2),
    colors: { cloudColor: '#000000', skyTopColor: '#151761', skyBottomColor: '#000000' }
  });
  scene.add(skyPlane);
  
  // Initialize cursor plane
  cursorPlane.init(scene, camera);
  
  // Create initial vegetation
  VegetationManager.createInitialVegetationWhenReady(scene);
  
  // Hide loading screen and enable controls
  GUI.hideLoadingScreen();
  setTimeout(() => {
    // Double-check vegetation creation after a short delay
    VegetationManager.createInitialVegetationWhenReady(scene);
    GUI.enableControls(AudioController.getAudioDuration(), VegetationManager.getTreeCount());
  }, 100);
  
  isSetupComplete = true;
}

// Setup post-processing
function setupPostProcessing() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  
  // Bloom pass
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    config.bloom.strength, config.bloom.radius, config.bloom.threshold
  );
  
  // Displacement pass
  displacementScenePass = new DisplacementScenePass(renderer, config.displacement.scale);
  displacementScenePass.initTextSupport(font);
  displacementScenePass.setTextConfig(config.text);
  displacementScenePass.setTextMoveSpeed(0.5);
  displacementScenePass.setTextRemovalZ(5);
  // composer.addPass(displacementScenePass);
  
  // Chromatic aberration pass
  chromaticAberrationPass = new ChromaticAberrationPass(config.chromaticAberration.strength);
  chromaticAberrationPass.update(renderer, window.innerWidth, window.innerHeight);
  composer.addPass(bloomPass);
}

// Setup lights
function setupLights() {
  scene.add(new THREE.DirectionalLight(0x111111, 5));
  
  spotlight = new THREE.SpotLight(0xff0000, 5);
  Object.assign(spotlight, { angle: Math.PI / 12, penumbra: 0.7, decay: 1, distance: 100 });
  spotlight.position.set(0, 2, 0);
  
  const spotlightTarget = new THREE.Object3D();
  spotlightTarget.position.set(0, 0, -100);
  scene.add(spotlightTarget);
  spotlight.target = spotlightTarget;
  scene.add(spotlight);
}

// Window resize
function onWindowResize() {
  if (camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer?.setSize(window.innerWidth, window.innerHeight);
  displacementScenePass?.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate(time) {
  if (!isAnimating) return;
  animationId = requestAnimationFrame(animate);
  
  const deltaTime = lastTime !== null ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  
  gltfMixer?.update(deltaTime);
  
  const audioTime = AudioController.getCurrentTime();
  updateCloudUniforms(skyPlane.material, audioTime * 0.03, window.innerWidth, window.innerHeight);
  
  const vegetationCounts = VegetationManager.updateVegetation(scene, 0.5 * (deltaTime * 60));
  AudioController.update(deltaTime, vegetationCounts.trees);
  
  if (displacementScenePass) {
    displacementScenePass.update(renderer, time, AudioController.getCurrentTime(), 
      deltaTime, textAppearTimes, config.displacement.scale);
  }
  
  // Handle animation transitions
  if (faceUpAnimation && walkAnimation) {
    if (audioTime >= animStartTime && !hasTransitioned) {
      // Time to transition to faceUp
      hasTransitioned = true;
      // Make sure faceUp is reset and ready
      faceUpAnimation.reset();
      faceUpAnimation.play();
      walkAnimation.crossFadeTo(faceUpAnimation, transitionDuration, true);
      console.log('Starting crossfade to faceUp at', audioTime, 'seconds');
    } else if (audioTime < animStartTime && hasTransitioned) {
      // We've scrubbed back before the transition point
      hasTransitioned = false;
      // Immediately switch back to walk animation (no transition)
      faceUpAnimation.stop();
      faceUpAnimation.reset();
      walkAnimation.reset();
      walkAnimation.play();
      console.log('Jumped back to Walk_01 animation');
    }
  }
  
  // Camera animation based on audio time
  const startPos = new THREE.Vector3(0, 2, 0);
  const endPos = new THREE.Vector3(0, 5, -70); // Example target position
  
  const startRot = new THREE.Euler(0, 0, 0);
  const endRot = new THREE.Euler(0.5, 0, 0); // Example target rotation
  
  // Calculate base camera position/rotation based on audio time
  let baseCameraPos = new THREE.Vector3();
  let baseCameraRot = new THREE.Euler();
  
  if (audioTime < animStartTime) {
    // Before animation starts
    baseCameraPos.copy(startPos);
    baseCameraRot.copy(startRot);
  } else if (audioTime >= animStartTime && audioTime <= animEndTime) {
    // During animation - calculate interpolated position
    const progress = (audioTime - animStartTime) / (animEndTime - animStartTime);
    
    // Interpolate position
    baseCameraPos.lerpVectors(startPos, endPos, progress);
    
    // Interpolate rotation
    baseCameraRot.x = THREE.MathUtils.lerp(startRot.x, endRot.x, progress);
    baseCameraRot.y = THREE.MathUtils.lerp(startRot.y, endRot.y, progress);
    baseCameraRot.z = THREE.MathUtils.lerp(startRot.z, endRot.z, progress);
  } else {
    // After animation ends
    baseCameraPos.copy(endPos);
    baseCameraRot.copy(endRot);
  }
  
  // Apply the base position
  camera.position.copy(baseCameraPos);
  
  // Apply mouse control on top of base rotation
  const targetRotY = (mouseX / window.innerWidth) * 0.15;
  const targetRotX = (mouseY / window.innerHeight) * 0.15;
  
  // Add mouse rotation to base rotation
  camera.rotation.x = baseCameraRot.x + targetRotX;
  camera.rotation.y = baseCameraRot.y + targetRotY;
  camera.rotation.z = baseCameraRot.z;
  
  // Clamp the X rotation to prevent over-rotation
  camera.rotation.x = Math.max(baseCameraRot.x - 0.15, Math.min(baseCameraRot.x + 0.15, camera.rotation.x));
  
  // Update spotlight
  mouseNDC.set((mouseX / window.innerWidth) * 2, (mouseY / window.innerHeight) * -2);
  raycaster.setFromCamera(mouseNDC, camera);
  const targetPoint = new THREE.Vector3();
  raycaster.ray.at(50, targetPoint);
  spotlight.target.position.copy(targetPoint);
  spotlight.position.copy(camera.position);
  
  cursorPlane.update(camera, deltaTime);
  
  if (scene && camera) composer.render();
}

// Controls
function startAnimation() {
  GUI.updatePlaybackState(true);
  AudioController.startAudio();
  lastTime = null;
  isAnimating = true;
  animate(performance.now());
}

function pauseAnimation() {
  if (!isAnimating) return;
  AudioController.pauseAudio();
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  isAnimating = false;
  GUI.updatePlaybackState(false);
}

// GLB Animation Controls
const animControl = (method, i = 0) => {
  if (gltfAnimationActions?.[i]) {
    if (method === 'play') gltfAnimationActions[i].play();
    else if (method === 'pause') gltfAnimationActions[i].paused = true;
    else if (method === 'stop') gltfAnimationActions[i].stop();
  }
};

export const playGLBAnimation = (i = 0) => animControl('play', i);
export const pauseGLBAnimation = (i = 0) => animControl('pause', i);
export const stopGLBAnimation = (i = 0) => animControl('stop', i);
export const playAllGLBAnimations = () => gltfAnimationActions.forEach((_, i) => playGLBAnimation(i));
export const pauseAllGLBAnimations = () => gltfAnimationActions.forEach((_, i) => pauseGLBAnimation(i));
export const stopAllGLBAnimations = () => gltfAnimationActions.forEach((_, i) => stopGLBAnimation(i));

// Initialize
init();

export { scene, gltfModel, gltfMixer, gltfAnimationActions };
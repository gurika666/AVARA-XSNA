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
import {GammaCorrectionShader} from 'three/examples/jsm/shaders/GammaCorrectionShader'
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import * as AudioController from './audio-controller.js';
import * as VegetationManager from './vegetation-manager.js';
import * as LoadingManager from './loading-manager.js';
import { DepthDrivenBlurPass } from './custom-dof.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import { TextManager } from './TextManager.js';
import { Rive, EventType, RiveEventType, Layout,  Fit, Alignment } from '@rive-app/webgl2'

let depthBlurPass;
let riveOverlay;
let rive;
let width;
let stoppedInput;
let loadedInput;
let loadingProgress; 
let currentProgress = 0;
let progressInterval = null; 
let songprogressadd;
let scrub;
let isScrubbing = false;
let isSeekingAudio = false;

// Globals
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass, displacementScenePass, textManager;
let isAnimating = false, animationId = null, lastTime = null, isSetupComplete = false;
let skyPlane, gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font;
let cursorPlane = new CursorPlane();
let titleModel = null;
let titleMixer;
let textmaterial;
const canvas = document.querySelector('.main-animation');
const rivecanvas = document.querySelector('.rive');

const LAYERS = {
  DOFIGNORE: 2,
};

let walkAnimation = null;
let faceUpAnimation = null;
let hasTransitioned = false; // Track if we've already transitioned
let isInTransition = false; // Track if we're currently transitioning
let transitionStartTime = null; // Track when transition started

// Animation timing
const animStartTime = 60; // When to start transitioning to faceUp
const animEndTime = 80;  // Camera animation end time
const transitionTime = 12; // When to start transitioning to faceUp animation
const transitionDuration = 2.8; // Duration of the blend in seconds

let headBone = null;
let headQuaternion = new THREE.Quaternion();
let targetQuaternion = new THREE.Quaternion();

// Mouse tracking for inactivity
let lastMouseX = 0;
let lastMouseY = 0;
let mouseInactiveFrames = 0;
const MOUSE_INACTIVE_THRESHOLD = 60; // frames before returning to original position
const MOUSE_MOVEMENT_THRESHOLD = 2; // pixels to consider as movement

const textureloader = new THREE.TextureLoader();
const config = {
  text: { size: 2, height: 0.1, depth: 1, z: -50 },
  bloom: { strength: 0.1, radius: 2, threshold: 0.1 },
  chromaticAberration: { strength: 0.01 },
  displacement: { scale: 0.5, speed: 0.2 },
  camera: { fov: 40 },
  glb: {
    path: 'mesh/latex.glb',
    position: new THREE.Vector3(0, 0, -100),
    scale: new THREE.Vector3(1, 1, 1),
    rotation: new THREE.Euler(0, 0, 0),
    autoplay: true
  },
  titleGlb: {
    path: 'mesh/title.glb',
    position: new THREE.Vector3(0, 4, -18), // Starting position
    scale: new THREE.Vector3(0.7, 0.7, 0.7),
    rotation: new THREE.Euler(-0.2, 0, 0),
    animation: {
      startTime: 0, // Start moving at 10 seconds
      endTime: 10,   // End at 40 seconds (adjust as needed)
      startZ: -18,   // Starting Z position
      endZ: 10       // End Z position (past the camera)
    }
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
  titleGlb: null,
  audio: null,
  vegetation: null
};

async function init() {

  loadRiveOverlay();

  // Setup renderer first
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 30, 100);
  
  // Initialize controllers

  AudioController.init({ 
  onTimeUpdate: (t, dt) => textManager?.update(t, dt, textAppearTimes),
  onScrubComplete: t => textManager?.reset(t, textAppearTimes)
});
  
  // Setup event listeners
  setupEventListeners();
  
  // Start loading all resources
  try {
    await loadAllResources();
    completeSetup();
  } catch (error) {
    console.error('Loading failed:', error);
  }
}

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
  
  // Keyboard controls - SPACE for play/pause using the SAME toggle function
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      if (isSetupComplete) {
        togglePlayPause();
      }
    }

    if (e.key === 'd' && depthBlurPass) {
      depthBlurPass.toggleDebugDepth();
    }
    
    if (e.key >= '1' && e.key <= '9' && depthBlurPass) {
      const blurAmount = parseInt(e.key);
      depthBlurPass.setMaxBlurSize(blurAmount);
    }
  });
}

function animateProgressTo(targetValue) {
  // Clear any existing animation
  if (progressInterval) {
    clearInterval(progressInterval);
  }
  
  // Calculate step size based on distance
  const distance = Math.abs(targetValue - currentProgress);
  const duration = 500; // 500ms for any animation
  const steps = 30; // 30 steps for smooth animation
  const stepSize = distance / steps;
  const stepDelay = duration / steps;
  
  let stepCount = 0;
  
  progressInterval = setInterval(() => {
    stepCount++;
    
    if (stepCount >= steps || Math.abs(targetValue - currentProgress) < 0.5) {
      // We're done, set final value
      currentProgress = targetValue;
      if (loadingProgress) {
        loadingProgress.value = targetValue;
      }
      clearInterval(progressInterval);
      progressInterval = null;
    } else {
      // Move towards target
      if (currentProgress < targetValue) {
        currentProgress += stepSize;
      } else {
        currentProgress -= stepSize;
      }
      
      if (loadingProgress) {
        loadingProgress.value = currentProgress;
      }
    }
  }, stepDelay);
}

async function loadAllResources() {
  let allResourcesLoaded = false;
  let totalSteps = 6; // Your existing value
  let currentStep = 0;
  
  const updateProgress = () => {
    currentStep++;
    const progress = (currentStep / totalSteps) * 100;
    
    // Use smooth animation instead of direct assignment
    animateProgressTo(progress);
  };
  
  const manager = LoadingManager.create(
    (itemUrl, itemsLoaded, itemsTotal) => {
      const itemProgress = (itemsLoaded / itemsTotal) * 100;
      const overallProgress = ((currentStep + (itemProgress / 100)) / totalSteps) * 100;
      
      // Smooth animation for granular updates
      animateProgressTo(overallProgress);
    },
    () => {
      allResourcesLoaded = true;
      // Animate to 100%
      animateProgressTo(100);
    },
    (url) => {
      console.error('Failed to load:', url);
    }
  );
  
  // Initialize at 0
  currentProgress = 0;
  if (loadingProgress) {
    loadingProgress.value = 0;
  }
  
  // Your existing loading phases...
  try {
    // Show some initial progress
    animateProgressTo(5);
    await loadAudio('audio/xsna.mp3');
    updateProgress();
  } catch (error) {
    console.error('Failed to load audio:', error);
    throw error;
  }
  
  // Rest of your loading code remains the same...
  try {
    await Promise.all([
      loadHDRTexture('images/txt.hdr', 'txthdr', manager),
      loadHDRTexture('images/01.hdr', 'hdri', manager)
    ]);
    updateProgress();
  } catch (error) {
    console.error('Failed to load HDR textures:', error);
    throw error;
  }
  
  // Continue with remaining tasks...
  const remainingTasks = [
    loadTexture('images/displacement-map.png', 'displacement', manager),
    loadFont('fonts/Monarch_Regular.json', manager),
    loadGLB(config.glb.path, manager),
    loadTitleGLB(config.titleGlb.path, manager),
    initVegetation(manager)
  ];
  
  try {
    await Promise.all(remainingTasks);
    updateProgress();
  } catch (error) {
    console.error('Failed to load remaining resources:', error);
    throw error;
  }
  
  // Wait for completion
  if (!allResourcesLoaded) {
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (allResourcesLoaded) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10000);
    });
  }
  
  // Final animation to 100%
  animateProgressTo(100);
  
  // Wait a bit for animation to complete
  await new Promise(resolve => setTimeout(resolve, 600));
}

async function loadHDRTexture(path, key, manager) {
  return new Promise((resolve, reject) => {
    new RGBELoader(manager).load(
      path,
      texture => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        resources[key] = texture;
        textmaterial = new THREE.MeshPhysicalMaterial({

              envMap: resources.hdri,
              envMapIntensity : 0.6,
              metalness : 1,
              roughness : 0,


            }) 
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
        
        setupHeadTracking();
        
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
              action.setEffectiveWeight(1.0);
            }
            // Handle faceUp animation
            else if (clip.name === 'faceUp') {
              faceUpAnimation = action;
              action.setLoop(THREE.LoopOnce);
              action.timeScale = 0.7;
              action.clampWhenFinished = true; // Keep the final pose
              action.setEffectiveWeight(0.0); // Start with 0 weight
              // Don't play it yet - will be triggered at startTime
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
        resolve();
      },
      undefined,
      error => reject(new Error('Failed to load GLB model'))
    );
  });
}

async function loadTitleGLB(path, manager) {
  return new Promise((resolve, reject) => {
    new GLTFLoader(manager).load(
      path,
      gltf => {
        titleModel = gltf.scene;
        
        // Apply materials if needed (similar to the main GLB)

  
          titleModel.traverse(child => {
            if (child.isMesh) {
             

              child.material = textmaterial;
             
            }

          });
        

        // Apply transform from config
        const { position: p, scale: s, rotation: r } = config.titleGlb;
        titleModel.position.copy(p);
        titleModel.scale.copy(s);
        titleModel.rotation.copy(r);
        
        // Add to scene
        scene.add(titleModel);

        
        // Handle animations if the title has any
        if (gltf.animations?.length) {
          titleMixer = new THREE.AnimationMixer(titleModel);
          gltf.animations.forEach(clip => {
            const action = titleMixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat);
            action.play();
           
          });
          
          // Store mixer reference if you need to update it in the animation loop
          titleModel.userData.mixer = titleMixer;
        }
        
        resources.titleGlb = titleModel;
        resolve();
      },
      undefined,
      error => reject(new Error('Failed to load title GLB'))
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

function onProgress(itemUrl, itemsLoaded, itemsTotal) {
  const progress = (itemsLoaded / itemsTotal) * 100;
}

async function loadRiveOverlay() {
  

   rive = new Rive({
        src: 'animations/xsna.riv', // Ensure this file name is correct
        canvas: rivecanvas,
        autoplay: true,
        autoBind: true,
        artboard: 'Artboard', // Ensure this artboard name is correct
        stateMachines: 'State Machine 1', // Ensure this state machine name is correct
        layout: new Layout({
        
          fit: Fit.Layout,
        }),
        onLoad: () => {

            rive.resizeDrawingSurfaceToCanvas();
            const inputs = rive.stateMachineInputs('State Machine 1');
            const gl = rivecanvas.getContext('webgl2') || rivecanvas.getContext('webgl');

            const viewmodel = rive.viewModelInstance;
            loadingProgress = viewmodel.number('loadprogress');
            width = viewmodel.number('width');
            songprogressadd = viewmodel.number('progressnum');
            scrub = viewmodel.boolean('scrub');
            
          
          stoppedInput = inputs.find(i => i.name === 'stopped');
          loadedInput = inputs.find(i => i.name === 'Loaded');
          


            rive.on(EventType.RiveEvent || 'riveevent', (event) => {
        // Check if this is the click event
              if (event && event.data && event.data.name === 'click') {
                
                // Only toggle if setup is complete
                if (isSetupComplete) {
                  togglePlayPause();
                }
              }
            });


          if (width) {

            
              width.value = window.innerWidth; 
            
          }
          if (stoppedInput) {
              stoppedInput.value = isAnimating; // Set initial state based on animation state

           } else {
              console.warn('Stopped input not found in Rive state machine');
          }
          if (loadedInput) {
              loadedInput.value = false; // Ensure it starts as false
            } else {
              console.warn('Loaded input not found in Rive state machine');
        }

        
      
  
    }
    });
    


}

function togglePlayPause() {
  if (!isSetupComplete) {
    return;
  }
  
  if (isAnimating) {
    pauseAnimation();
  } else {
    startAnimation();
  }
}

async function completeSetup() {
  if (isSetupComplete) return;
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create camera
  camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 0);
  camera.layers.enable(LAYERS.DOFIGNORE); // This is the fix!

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

  const material = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
  const plane = new THREE.PlaneGeometry(1000, 1000);
  const background = new THREE.Mesh(plane, material);
  background.position.set(0, 0, -200);
  scene.add(background);

  // Initialize cursor plane
 
  cursorPlane.init(scene, camera);

  if (cursorPlane.plane) {
  cursorPlane.plane.layers.set(LAYERS.DOFIGNORE);
}
  
 // Initialize text manager instead of displacement pass
  textManager = new TextManager();
  
  // Configure text appearance
  textManager.setTextConfig({
    size: 0.8,
    height: 0.05,
    depth: 0.1,
    startZ: -100,
    endZ: 10,
    yPosition: 2,
    xSpread: 15
  });
  
  textManager.setMoveSpeed(15);

    if (resources.txthdr) {
 
    textManager.setMaterial(textmaterial);
  }
  
  // Create initial vegetation only once
  VegetationManager.createInitialVegetationWhenReady(scene);
  
  isSetupComplete = true;

   if (loadedInput) {
    loadedInput.value = true;
  }
}

function setupHeadTracking() {
  if (!gltfModel) return;
  
  // Find the head bone
  gltfModel.traverse((child) => {
    if (child.isBone && child.name === 'headbone') {
      headBone = child;
      
      // Store the initial rotation
      headBone.userData.initialRotation = headBone.rotation.clone();
      headBone.userData.initialQuaternion = headBone.quaternion.clone();
    }
  });
  
  if (!headBone) {
    console.warn('Head bone not found');
  }
}

function updateTitlePosition(audioTime) {
  if (!titleModel) return;
  
  const { startTime, endTime, startZ, endZ } = config.titleGlb.animation;
  
  if (audioTime < startTime) {
    // Before animation starts, keep at starting position
    titleModel.position.z = startZ;
  } else if (audioTime >= startTime && audioTime <= endTime) {
    // During animation, interpolate position
    const progress = (audioTime - startTime) / (endTime - startTime);
    // Use easing for smoother motion
    const easedProgress = progress * progress * (3 - 2 * progress); // smoothstep
    titleModel.position.z = THREE.MathUtils.lerp(startZ, endZ, easedProgress);
  } else {
    // After animation ends, keep at end position
    titleModel.position.z = endZ;
  }
}

function updateHeadLookAt(camera, deltaTime) {
  if (!headBone || !isAnimating) return;
  
  // Check for mouse movement
  const mouseMoved = Math.abs(mouseX - lastMouseX) > MOUSE_MOVEMENT_THRESHOLD || 
                     Math.abs(mouseY - lastMouseY) > MOUSE_MOVEMENT_THRESHOLD;
  
  if (mouseMoved) {
    mouseInactiveFrames = 0;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  } else {
    mouseInactiveFrames++;
  }
  
  // Calculate whether we should use mouse look or return to original
  const isMouseActive = mouseInactiveFrames < MOUSE_INACTIVE_THRESHOLD;
  const returnToOriginalProgress = isMouseActive ? 0 : 
    Math.min((mouseInactiveFrames - MOUSE_INACTIVE_THRESHOLD) / 60, 1); // 1 second transition
  
  // Get normalized mouse position (-1 to 1)
  const normalizedMouseX = -(mouseX / (window.innerWidth * 0.5));
  const normalizedMouseY = -(mouseY / (window.innerHeight * 0.5));
  
  // Define rotation limits
  const maxRotationX = Math.PI / 4; // 45 degrees up/down
  const maxRotationY = Math.PI / 6; // 30 degrees left/right
  const maxRotationZ = Math.PI / 12; // 15 degrees tilt
  

  const baseRotationOffset = new THREE.Quaternion();
  baseRotationOffset.setFromEuler(new THREE.Euler(-Math.PI / 5, 0, 0)); // Rotate 90 degrees around X
  
  // Calculate target rotations based on mouse activity
  let targetRotationY, targetRotationX;
  
  if (isMouseActive && returnToOriginalProgress === 0) {
    // Use mouse-based rotation
    targetRotationY = THREE.MathUtils.clamp(
      -normalizedMouseX * maxRotationY,
      -maxRotationY,
      maxRotationY
    );
    targetRotationX = THREE.MathUtils.clamp(
      -normalizedMouseY * maxRotationX,
      -maxRotationX,
      maxRotationX
    );
  } else {
    // Blend between mouse rotation and original (0,0)
    const mouseRotationY = THREE.MathUtils.clamp(
      -normalizedMouseX * maxRotationY,
      -maxRotationY,
      maxRotationY
    );
    const mouseRotationX = THREE.MathUtils.clamp(
      -normalizedMouseY * maxRotationX,
      -maxRotationX,
      maxRotationX
    );
    
    // Lerp to original rotation
    targetRotationY = THREE.MathUtils.lerp(mouseRotationY, 0, returnToOriginalProgress);
    targetRotationX = THREE.MathUtils.lerp(mouseRotationX, 0, returnToOriginalProgress);
  }
  
  // Create the look rotation
  const lookEuler = new THREE.Euler(targetRotationX, targetRotationY, 0, 'YXZ');
  const lookQuaternion = new THREE.Quaternion();
  lookQuaternion.setFromEuler(lookEuler);
  
  // Combine base offset with look rotation
  const targetQuaternion = new THREE.Quaternion();
  targetQuaternion.multiplyQuaternions(baseRotationOffset, lookQuaternion);
  

  
  // Get the current animation quaternion
  const animationQuaternion = headBone.quaternion.clone();
  
  // Blend between animation and look-at rotation
  const animationInfluence = 0.5;
  const lookAtInfluence = 1 - animationInfluence;
  
  // Interpolate between animation and look-at
  const blendedQuaternion = new THREE.Quaternion();
  blendedQuaternion.copy(animationQuaternion);
  blendedQuaternion.slerp(targetQuaternion, lookAtInfluence);
  
  // Smooth interpolation to target - adjust speed based on whether returning to original
  const smoothingFactor = isMouseActive ? 0.1 : 0.05; // Slower when returning to original
  headBone.quaternion.slerp(blendedQuaternion, smoothingFactor);
}

function setupPostProcessing() {

  composer = new EffectComposer(renderer);

 const taaRenderPass = new TAARenderPass(scene, camera);
  taaRenderPass.unbiased = false;
  taaRenderPass.sampleLevel = 1; // 0 = 1 sample, 1 = 2 samples, 2 = 4 samples
  composer.addPass(taaRenderPass);
  
  // Bloom pass
 bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  config.bloom.strength, 
  config.bloom.radius, 
  config.bloom.threshold
);
bloomPass.renderTargetsHorizontal.forEach(target => {
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
});
bloomPass.renderTargetsVertical.forEach(target => {
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
});
  
  
  // Displacement pass
  displacementScenePass = new DisplacementScenePass(renderer, config.displacement.scale);
  displacementScenePass.initTextSupport(font);
  displacementScenePass.setTextConfig(config.text);
  displacementScenePass.setTextMoveSpeed(0.5);
  displacementScenePass.setTextRemovalZ(5);
  
  // Chromatic aberration pass
  chromaticAberrationPass = new ChromaticAberrationPass(config.chromaticAberration.strength);
  chromaticAberrationPass.update(renderer, window.innerWidth, window.innerHeight);
 
  composer.addPass(displacementScenePass); // Uncomment if needed



  depthBlurPass = new DepthDrivenBlurPass(scene, camera, 1.0); // 5.0 = max blur size

  depthBlurPass.excludeLayer(LAYERS.DOFIGNORE);

 const gamma = new ShaderPass(GammaCorrectionShader);



  composer.addPass(chromaticAberrationPass)
  composer.addPass(depthBlurPass);
  composer.addPass(bloomPass); 
  composer.addPass(gamma);
  

  
  

}

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

function onWindowResize() {
  if (camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer?.setSize(window.innerWidth, window.innerHeight);

if (rive) {
    rive.resizeDrawingSurfaceToCanvas();
    
    // Update the width input to match new window width
    if (width) {
      width.value = window.innerWidth; 
    }
  }

}

function animate(time) {
  if (!isAnimating) return;
  animationId = requestAnimationFrame(animate);
  
  const deltaTime = lastTime !== null ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  
  gltfMixer?.update(deltaTime);
  titleMixer?.update(deltaTime);

  const audioTime = AudioController.getCurrentTime();

// UPDATE RIVE PROGRESS
if (songprogressadd && scrub) {
  if (scrub.value && !isScrubbing) {
    isScrubbing = true;
  } else if (!scrub.value && isScrubbing) {
    isScrubbing = false;
    const targetValue = songprogressadd.value;
    
    // Set seeking flag
    isSeekingAudio = true;
    
    const duration = AudioController.getAudioDuration();
    if (duration > 0) {
      const seekTime = (targetValue / 100) * duration;
      AudioController.seekTo(seekTime);
    }
    
    // Clear seeking flag after a brief delay
    setTimeout(() => {
      isSeekingAudio = false;
    }, 50);
  }
  
  // Only update progress when NOT scrubbing AND NOT seeking
  if (!isScrubbing && !isSeekingAudio) {
    const duration = AudioController.getAudioDuration();
    if (duration > 0) {
      const progress = (audioTime / duration) * 100;
      songprogressadd.value = progress;
    } else {
      songprogressadd.value = 0;
    }
  }
}

  // Update title position based on audio time
  updateTitlePosition(audioTime);

    // Update text manager
  if (textManager) {
    textManager.update(
      AudioController.getCurrentTime(), 
      deltaTime, 
      textAppearTimes
    );
  }
  
  updateCloudUniforms(skyPlane.material, audioTime * 0.03, window.innerWidth, window.innerHeight);
  
  const vegetationCounts = VegetationManager.updateVegetation(scene, 0.5 * (deltaTime * 60));
  AudioController.update(deltaTime, vegetationCounts.trees);
  
  if (displacementScenePass) {
    displacementScenePass.update(renderer, time, AudioController.getCurrentTime(), 
      deltaTime, textAppearTimes, config.displacement.scale);
  }

  // Handle animation transitions
  if (faceUpAnimation && walkAnimation) {
    // Check if we should be in faceUp state (after transition time)
    const shouldBeInFaceUp = audioTime >= transitionTime;
    const shouldBeTransitioning = audioTime >= transitionTime && audioTime < (transitionTime + transitionDuration);
    
    if (shouldBeTransitioning && !hasTransitioned && !isInTransition) {
      // Start transition
      hasTransitioned = true;
      isInTransition = true;
      transitionStartTime = audioTime;
      
      // Reset and play faceUp animation
      faceUpAnimation.reset();
      faceUpAnimation.play();
      faceUpAnimation.setEffectiveWeight(0.0);
      walkAnimation.setEffectiveWeight(1.0);
    } else if (isInTransition && shouldBeTransitioning) {
      // Continue transition - calculate progress
      const transitionProgress = Math.min((audioTime - transitionStartTime) / transitionDuration, 1.0);
      
      // Smooth easing function
      const easedProgress = 0.5 - 0.5 * Math.cos(transitionProgress * Math.PI);
      
      walkAnimation.setEffectiveWeight(1.0 - easedProgress);
      faceUpAnimation.setEffectiveWeight(easedProgress);
      
      if (transitionProgress >= 1.0) {
        isInTransition = false;
      }
    } else if (isInTransition && shouldBeInFaceUp && !shouldBeTransitioning) {
      // Continue quick transition after jump - use half duration
      const quickTransitionDuration = transitionDuration / 2;
      const transitionProgress = Math.min((audioTime - transitionStartTime) / quickTransitionDuration, 1.0);
      
      // Smooth easing function
      const easedProgress = 0.5 - 0.5 * Math.cos(transitionProgress * Math.PI);
      
      walkAnimation.setEffectiveWeight(1.0 - easedProgress);
      faceUpAnimation.setEffectiveWeight(easedProgress);
      
      if (transitionProgress >= 1.0) {
        isInTransition = false;
      }
    } else if (shouldBeInFaceUp && !shouldBeTransitioning && !hasTransitioned) {
      // We jumped past the transition time - check if we need to transition
      const walkWeight = walkAnimation.getEffectiveWeight();
      const faceUpWeight = faceUpAnimation.getEffectiveWeight();
      
      // Only start transition if walk animation is active (weight > 0)
      if (walkWeight > 0 && faceUpWeight < 1) {
        // Start a quick transition from walk to faceUp
        hasTransitioned = true;
        isInTransition = true;
        transitionStartTime = audioTime;
        
        // Reset and play faceUp animation
        faceUpAnimation.reset();
        faceUpAnimation.play();
        faceUpAnimation.setEffectiveWeight(0.0);
        walkAnimation.setEffectiveWeight(1.0);
      } else if (faceUpWeight === 1) {
        // Already in faceUp, just update state
        hasTransitioned = true;
        isInTransition = false;
      }
    } else if (shouldBeInFaceUp && !shouldBeTransitioning && hasTransitioned) {
      // We're past the transition, ensure faceUp is fully active
      if (isInTransition) {
        isInTransition = false;
      }
      walkAnimation.setEffectiveWeight(0.0);
      faceUpAnimation.setEffectiveWeight(1.0);
    } else if (!shouldBeInFaceUp && (hasTransitioned || isInTransition)) {
      // We've scrubbed back before the transition point
      hasTransitioned = false;
      isInTransition = false;
      transitionStartTime = null;
      
      // Stop faceUp and ensure walk is playing
      faceUpAnimation.stop();
      faceUpAnimation.reset();
      faceUpAnimation.setEffectiveWeight(0.0);
      
      // Reset walk animation to ensure proper speed
      if (!walkAnimation.isRunning()) {
        walkAnimation.reset();
        walkAnimation.play();
      }
      walkAnimation.setEffectiveWeight(1.0);
      walkAnimation.timeScale = 0.7; // Ensure correct time scale
    } else if (!shouldBeInFaceUp && !hasTransitioned) {
      // We're before the transition and haven't transitioned yet
      // Ensure walk animation is at correct speed
      if (walkAnimation.isRunning() && walkAnimation.timeScale !== 0.7) {
        walkAnimation.timeScale = 0.7;
      }
    }
  }

  updateHeadLookAt(camera, deltaTime);

  
  
  // Camera animation based on audio time (rest of the code remains the same)
  const startPos = new THREE.Vector3(0, 2, 0);
  const endPos = new THREE.Vector3(0, 4, -70);
  
  const startRot = new THREE.Euler(0, 0, 0);
  const endRot = new THREE.Euler(0.5, 0, 0);
  
  // Calculate base camera position/rotation based on audio time
  let baseCameraPos = new THREE.Vector3();
  let baseCameraRot = new THREE.Euler();
  
  if (audioTime < animStartTime) {
    baseCameraPos.copy(startPos);
    baseCameraRot.copy(startRot);
  } else if (audioTime >= animStartTime && audioTime <= animEndTime) {
    const progress = (audioTime - animStartTime) / (animEndTime - animStartTime);
    baseCameraPos.lerpVectors(startPos, endPos, progress);
    baseCameraRot.x = THREE.MathUtils.lerp(startRot.x, endRot.x, progress);
    baseCameraRot.y = THREE.MathUtils.lerp(startRot.y, endRot.y, progress);
    baseCameraRot.z = THREE.MathUtils.lerp(startRot.z, endRot.z, progress);
  } else {
    baseCameraPos.copy(endPos);
    baseCameraRot.copy(endRot);
  }
  
  camera.position.copy(baseCameraPos);
  
  const targetRotY = (mouseX / window.innerWidth) * 0.15;
  const targetRotX = (mouseY / window.innerHeight) * 0.15;
  
  camera.rotation.x = baseCameraRot.x + targetRotX;
  camera.rotation.y = baseCameraRot.y + targetRotY;
  camera.rotation.z = baseCameraRot.z;
  
  camera.rotation.x = Math.max(baseCameraRot.x - 0.15, Math.min(baseCameraRot.x + 0.15, camera.rotation.x));
  
  mouseNDC.set((mouseX / window.innerWidth) * 2, (mouseY / window.innerHeight) * -2);
  
  raycaster.setFromCamera(mouseNDC, camera);
  const targetPoint = new THREE.Vector3();
  raycaster.ray.at(50, targetPoint);
  spotlight.target.position.copy(targetPoint);
  spotlight.position.copy(camera.position);
  
  cursorPlane.update(camera, deltaTime);
  
  if (scene && camera) composer.render();
}

function startAnimation() {
  if (isAnimating) {
    return;
  }
  
  AudioController.startAudio();
  lastTime = null;
  isAnimating = true;
  
  if (stoppedInput) {
    stoppedInput.value = false;
  }
  
  animate(performance.now());
}

function pauseAnimation() {
  if (!isAnimating) {
    return;
  }
  
  AudioController.pauseAudio();
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  isAnimating = false;
  
  if (stoppedInput) {
    stoppedInput.value = true;
  }
}

setTimeout(() => {
  init();
}, 1000);
// Initialize

export { scene, gltfModel, gltfMixer, gltfAnimationActions };
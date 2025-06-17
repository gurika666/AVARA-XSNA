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
import { BasicBlurPass } from './basic-blur-pass.js';
import { SimpleDepthPass } from './depth-visualization-pass.js';
import { DepthDrivenBlurPass } from './custom-dof.js';



let depthBlurPass;

// Globals
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass, displacementScenePass;
let isAnimating = false, animationId = null, lastTime = null, isSetupComplete = false;
let skyPlane, gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font, txthdr;
let cursorPlane = new CursorPlane();
let titleModel = null;


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
let lookAtTarget = new THREE.Object3D();
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
  bloom: { strength: 0.7, radius: 5, threshold: 0.5 },
  chromaticAberration: { strength: 0.1 },
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
    position: new THREE.Vector3(0, 2, -30), // Adjust position as needed
    scale: new THREE.Vector3(1, 1, 1),
    rotation: new THREE.Euler(0, 0, 0)
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

// Initialize
async function init() {
  // Setup renderer first
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 30, 100);


  const axesHelper = new THREE.AxesHelper(20);
  axesHelper.position.set(0, 0, -10); // Position it where we can see it
// scene.add(axesHelper);

  
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

    if (e.key === 'd' && depthBlurPass) {
    depthBlurPass.toggleDebugDepth();
    console.log('Depth visualization toggled');
  }
  
  // Add number keys to adjust blur amount
  if (e.key >= '1' && e.key <= '9' && depthBlurPass) {
    const blurAmount = parseInt(e.key);
    depthBlurPass.setMaxBlurSize(blurAmount);
    console.log('Max blur size set to:', blurAmount);
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

    //Load title
    loadTitleGLB(config.titleGlb.path, manager),
    
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
              // console.log('Started Walk_01 animation');
            }
            // Handle faceUp animation
            else if (clip.name === 'faceUp') {
              faceUpAnimation = action;
              action.setLoop(THREE.LoopOnce);
              action.timeScale = 0.7;
              action.clampWhenFinished = true; // Keep the final pose
              action.setEffectiveWeight(0.0); // Start with 0 weight
              // Don't play it yet - will be triggered at startTime
              // console.log('Prepared faceUp animation');
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
        // console.log(gltf.animations)
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
if(resources.txthdr) {
  
          titleModel.traverse(child => {
            if (child.isMesh) {
             
              const mat = new THREE.MeshPhysicalMaterial({

              envMap: resources.txthdr,
              envMapIntensity : 10.0,
              metalness : 1,
              roughness : 0.3,


            }) 

              // mat.needsUpdate = true;
              child.material = mat;
              console.log("hey")
            }

          });
        
}
        // Apply transform from config
        const { position: p, scale: s, rotation: r } = config.titleGlb;
        titleModel.position.copy(p);
        titleModel.scale.copy(s);
        titleModel.rotation.copy(r);
        
        // Add to scene
        scene.add(titleModel);
        // console.log(titleModel)
        
        // Handle animations if the title has any
        if (gltf.animations?.length) {
          const titleMixer = new THREE.AnimationMixer(titleModel);
          gltf.animations.forEach(clip => {
            const action = titleMixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat);
            action.play();
          });
          
          // Store mixer reference if you need to update it in the animation loop
          titleModel.userData.mixer = titleMixer;
        }
        
        resources.titleGlb = titleModel;
        console.log('Title GLB loaded successfully');
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
  // skyPlane.layers.set(LAYERS.DOFIGNORE);
  scene.add(skyPlane);

  const material = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
  const plane = new THREE.PlaneGeometry(1000, 1000);
  const background = new THREE.Mesh(plane, material);
  background.position.set(0, 0, -200);
  scene.add(background);
  // console.log('Background added:', background);
 
  
  // Initialize cursor plane
 
  cursorPlane.init(scene, camera);

  if (cursorPlane.plane) {
  cursorPlane.plane.layers.set(LAYERS.DOFIGNORE);
}
  

  
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

function setupHeadTracking() {
  if (!gltfModel) return;
  
  // Find the head bone
  gltfModel.traverse((child) => {
    if (child.isBone && child.name === 'headbone') {
      headBone = child;
      // console.log('Found head bone:', headBone);
      
      // Store the initial rotation
      headBone.userData.initialRotation = headBone.rotation.clone();
      headBone.userData.initialQuaternion = headBone.quaternion.clone();
    }
  });
  
  if (!headBone) {
    console.warn('Head bone not found');
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
  
  // Chromatic aberration pass
  chromaticAberrationPass = new ChromaticAberrationPass(config.chromaticAberration.strength);
  chromaticAberrationPass.update(renderer, window.innerWidth, window.innerHeight);
 
  // composer.addPass(displacementScenePass); // Uncomment if needed



  // Create depth-driven blur pass
  depthBlurPass = new DepthDrivenBlurPass(scene, camera, 3.0); // 5.0 = max blur size
  depthBlurPass.excludeLayer(LAYERS.DOFIGNORE);
  composer.addPass(depthBlurPass);
  composer.addPass(bloomPass); // Add bloom after blur
  

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

function onWindowResize() {
  if (camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer?.setSize(window.innerWidth, window.innerHeight);
  displacementScenePass?.setSize(window.innerWidth, window.innerHeight);
}

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
      
      // console.log('Starting transition to faceUp at', audioTime, 'seconds');
    } else if (isInTransition && shouldBeTransitioning) {
      // Continue transition - calculate progress
      const transitionProgress = Math.min((audioTime - transitionStartTime) / transitionDuration, 1.0);
      
      // Smooth easing function
      const easedProgress = 0.5 - 0.5 * Math.cos(transitionProgress * Math.PI);
      
      walkAnimation.setEffectiveWeight(1.0 - easedProgress);
      faceUpAnimation.setEffectiveWeight(easedProgress);
      
      if (transitionProgress >= 1.0) {
        isInTransition = false;
        // console.log('Transition to faceUp completed');
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
        console.log('Quick transition to faceUp completed');
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
        
        console.log('Starting quick transition to faceUp after jump at', audioTime, 'seconds');
      } else if (faceUpWeight === 1) {
        // Already in faceUp, just update state
        hasTransitioned = true;
        isInTransition = false;
        console.log('Already in faceUp animation, no transition needed');
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
      
      console.log('Jumped back to Walk_01 animation');
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
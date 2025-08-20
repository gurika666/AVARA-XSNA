// app.js - Optimized main application with streamlined loading and animation blending
import * as THREE from "three";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
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
import { WiggleBone } from "wiggle";
import { applyStarNestToModel, updateStarNestMaterials } from './star-nest-shader.js';

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

let starNestMaterials = new Map();

// Wiggle bones array
let wiggleBones = [];




// Globals
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass, textManager;
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

// Camera tracking globals (FIX: Added here for proper scope)
let baseCameraPos = new THREE.Vector3();
let baseCameraRot = new THREE.Euler();

const LAYERS = {
  DOFIGNORE: 2,
};

let walkAnimation = null;
let faceUpAnimation = null;
let hasTransitioned = false;
let isInTransition = false;
let transitionStartTime = null;

// Animation timing
const animStartTime = 60;
const animEndTime = 80;
const transitionTime = 80;
const transitionDuration = 2.8;

let headBone = null;
let headQuaternion = new THREE.Quaternion();
let targetQuaternion = new THREE.Quaternion();

// Mouse tracking for inactivity
let lastMouseX = 0;
let lastMouseY = 0;
let mouseInactiveFrames = 0;
const MOUSE_INACTIVE_THRESHOLD = 60;
const MOUSE_MOVEMENT_THRESHOLD = 2;

const textureloader = new THREE.TextureLoader();
const config = {
  text: { size: 2, height: 0.1, depth: 1, z: -50 },
  bloom: { strength: 0.2, radius: 2.0, threshold: 0.1 },
  chromaticAberration: { strength: 0.01 },
  camera: { fov: 40 },
  fog: {
    start: {
      near: 30,
      far: 100,
      color: 0x000000
    },
    end: {
      near: 3,
      far: 20,
      color: 0x000000
    }
  },
  glb: {
    path: 'mesh/latex.glb',
    position: new THREE.Vector3(0, 0, -100),
    scale: new THREE.Vector3(1, 1, 1),
    rotation: new THREE.Euler(0, 0, 0),
    autoplay: true
  },
  titleGlb: {
    path: 'mesh/title.glb',
    position: new THREE.Vector3(0, 4, -18),
    scale: new THREE.Vector3(0.7, 0.7, 0.7),
    rotation: new THREE.Euler(-0.2, 0, 0),
    animation: {
      startTime: 0,
      endTime: 10,
      startZ: -18,
      endZ: 10
    }
  }
};

  // Camera animation
  let startPos = new THREE.Vector3(0, 2, 0);
  let endPos = new THREE.Vector3(0, 6, -92);
  
  let startRot = new THREE.Euler(0, 0, 0);
  let endRot = new THREE.Euler(0.8, 0, 0);

  let startFOV = 40;  // Starting FOV
  let endFOV = 90;    // Ending FOV
  
  let fogStartColor = new THREE.Color(config.fog.start.color);
  let fogEndColor = new THREE.Color(config.fog.end.color);

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
  font: null,
  glb: null,
  titleGlb: null,
  audio: null,
  vegetation: null
};

async function init() {
  loadRiveOverlay();

  // Setup renderer first
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(config.fog.start.color, config.fog.start.near, config.fog.start.far);
  
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
  
  // Keyboard controls
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

    // Wiggle bones controls
    if (e.key === 'w' && wiggleBones.length > 0) {
      wiggleBones.forEach(bone => {
        bone.enabled = !bone.enabled;
      });
      console.log('Toggled wiggle bones');
    }
  });
}

function animateProgressTo(targetValue) {
  if (progressInterval) {
    clearInterval(progressInterval);
  }
  
  const distance = Math.abs(targetValue - currentProgress);
  const duration = 500;
  const steps = 30;
  const stepSize = distance / steps;
  const stepDelay = duration / steps;
  
  let stepCount = 0;
  
  progressInterval = setInterval(() => {
    stepCount++;
    
    if (stepCount >= steps || Math.abs(targetValue - currentProgress) < 0.5) {
      currentProgress = targetValue;
      if (loadingProgress) {
        loadingProgress.value = targetValue;
      }
      clearInterval(progressInterval);
      progressInterval = null;
    } else {
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
  let totalSteps = 6;
  let currentStep = 0;
  
  const updateProgress = () => {
    currentStep++;
    const progress = (currentStep / totalSteps) * 100;
    animateProgressTo(progress);
  };
  
  const manager = LoadingManager.create(
    (itemUrl, itemsLoaded, itemsTotal) => {
      const itemProgress = (itemsLoaded / itemsTotal) * 100;
      const overallProgress = ((currentStep + (itemProgress / 100)) / totalSteps) * 100;
      animateProgressTo(overallProgress);
    },
    () => {
      allResourcesLoaded = true;
      animateProgressTo(100);
    },
    (url) => {
      console.error('Failed to load:', url);
    }
  );
  
  currentProgress = 0;
  if (loadingProgress) {
    loadingProgress.value = 0;
  }
  
  try {
    animateProgressTo(5);
    await loadAudio('audio/xsna.mp3');
    updateProgress();
  } catch (error) {
    console.error('Failed to load audio:', error);
    throw error;
  }
  
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
  
  const remainingTasks = [
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
  
  animateProgressTo(100);
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
          envMapIntensity: 0.6,
          metalness: 1,
          roughness: 0,
        });
        resolve();
      },
      undefined,
      error => reject(new Error(`Failed to load HDR: ${path}`))
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
        
        // // Apply materials
        // if (resources.txthdr) {
        //   gltfModel.traverse(child => {
        //     if (child.isMesh && child.material?.name?.includes("latex_")) {
        //       const mat = child.material.clone();
        //       mat.envMap = resources.txthdr;
        //       mat.envMapIntensity = 1.0;
        //       mat.needsUpdate = true;
        //       child.material = mat;
        //     }
        //   });
        // }

        starNestMaterials = applyStarNestToModel(gltfModel, resources);
        
        const { position: p, scale: s, rotation: r } = config.glb;
        gltfModel.position.copy(p);
        gltfModel.scale.copy(s);
        gltfModel.rotation.copy(r);
        scene.add(gltfModel);
        
        // Setup tracking systems
        setupHeadTracking();
        // setupWiggleBones();
        
        // Handle animations
        if (gltf.animations?.length) {
          gltfMixer = new THREE.AnimationMixer(gltfModel);
          gltf.animations.forEach(clip => {
            const action = gltfMixer.clipAction(clip);
            
            if (clip.name === 'Walk_01') {
              walkAnimation = action;
              action.setLoop(THREE.LoopRepeat);
              action.timeScale = 0.7;
              action.play();
              action.setEffectiveWeight(1.0);
            }
            else if (clip.name === 'faceUp') {
              faceUpAnimation = action;
              action.setLoop(THREE.LoopOnce);
              action.timeScale = 0.7;
              action.clampWhenFinished = true;
              action.setEffectiveWeight(0.0);
              if (!faceUpAnimation.userData) {
                faceUpAnimation.userData = {};
              }
              faceUpAnimation.userData.lastAudioTime = 0;
            }
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
        
        titleModel.traverse(child => {
          if (child.isMesh) {
            child.material = textmaterial;
          }
        });
        
        const { position: p, scale: s, rotation: r } = config.titleGlb;
        titleModel.position.copy(p);
        titleModel.scale.copy(s);
        titleModel.rotation.copy(r);
        
        // scene.add(titleModel);
        
        if (gltf.animations?.length) {
          titleMixer = new THREE.AnimationMixer(titleModel);
          gltf.animations.forEach(clip => {
            const action = titleMixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat);
            action.play();
          });
          
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
    resources.audio = true;
    resolve();
  });
}

async function initVegetation(manager) {
  return new Promise((resolve) => {
    let vegetationLoaded = false;
    let checkInterval;
    
    VegetationManager.init(scene, manager);
    
    const checkVegetationLoaded = () => {
      if (VegetationManager.isLoaded()) {
        vegetationLoaded = true;
        resources.vegetation = true;
        if (checkInterval) clearInterval(checkInterval);
        resolve();
      }
    };
    
    checkVegetationLoaded();
    if (!vegetationLoaded) {
      checkInterval = setInterval(checkVegetationLoaded, 100);
      
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

async function loadRiveOverlay() {
  rive = new Rive({
    src: 'animations/xsna.riv',
    canvas: rivecanvas,
    autoplay: true,
    autoBind: true,
    artboard: 'Artboard',
    stateMachines: 'State Machine 1',
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
        if (event && event.data && event.data.name === 'click') {
          if (isSetupComplete) {
            togglePlayPause();
          }
        }
      });

      if (width) {
        width.value = window.innerWidth; 
      }
      if (stoppedInput) {
        stoppedInput.value = isAnimating;
      } else {
        console.warn('Stopped input not found in Rive state machine');
      }
      if (loadedInput) {
        loadedInput.value = false;
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

  camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 0);
  camera.layers.enable(LAYERS.DOFIGNORE);

  if (AudioController.getAudioListener) camera.add(AudioController.getAudioListener());

  setupPostProcessing();
  setupLights();
  
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

  cursorPlane.init(scene, camera);

  if (cursorPlane.plane) {
    cursorPlane.plane.layers.set(LAYERS.DOFIGNORE);
  }
  
  textManager = new TextManager();
  
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
  
  VegetationManager.createInitialVegetationWhenReady(scene);
  
  isSetupComplete = true;

  if (loadedInput) {
    loadedInput.value = true;
  }
  if(songprogressadd) {
    songprogressadd.value = 0;
  }
}

function setupHeadTracking() {
  if (!gltfModel) return;
  
  gltfModel.traverse((child) => {
    if (child.isBone && child.name === 'headbone') {
      headBone = child;
      headBone.userData.initialRotation = headBone.rotation.clone();
      headBone.userData.initialQuaternion = headBone.quaternion.clone();
    }
  });
  
  if (!headBone) {
    console.warn('Head bone not found');
  }
}

function setupWiggleBones() {
  if (!gltfModel) return;
  
  wiggleBones = [];
  
  gltfModel.traverse((child) => {
    if (child.isBone && child.name.includes('wiggle_')) {
      console.log('Found wiggle bone:', child.name);
      
      const wiggleBone = new WiggleBone(child, {
        stiffness: 0,
        damping: 0.3,
        elasticity: 1,
        maxAngle: Math.PI / 12,
        gravity: new THREE.Vector3(0, -0.5, 0),
        enabled: true
      });
      
      wiggleBones.push(wiggleBone);
    }
  });
  
  console.log(`Set up ${wiggleBones.length} wiggle bones`);
}

function updateTitlePosition(audioTime) {
  if (!titleModel) return;
  
  const { startTime, endTime, startZ, endZ } = config.titleGlb.animation;
  
  if (audioTime < startTime) {
    titleModel.position.z = startZ;
  } else if (audioTime >= startTime && audioTime <= endTime) {
    const progress = (audioTime - startTime) / (endTime - startTime);
    const easedProgress = progress * progress * (3 - 2 * progress);
    titleModel.position.z = THREE.MathUtils.lerp(startZ, endZ, easedProgress);
  } else {
    titleModel.position.z = endZ;
  }
}

function updateHeadLookAt(camera, deltaTime) {
  if (!headBone || !isAnimating) return;
  
  const mouseMoved = Math.abs(mouseX - lastMouseX) > MOUSE_MOVEMENT_THRESHOLD || 
                     Math.abs(mouseY - lastMouseY) > MOUSE_MOVEMENT_THRESHOLD;
  
  if (mouseMoved) {
    mouseInactiveFrames = 0;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  } else {
    mouseInactiveFrames++;
  }
  
  const isMouseActive = mouseInactiveFrames < MOUSE_INACTIVE_THRESHOLD;
  const returnToOriginalProgress = isMouseActive ? 0 : 
    Math.min((mouseInactiveFrames - MOUSE_INACTIVE_THRESHOLD) / 60, 1);
  
  const normalizedMouseX = -(mouseX / (window.innerWidth * 0.5));
  const normalizedMouseY = -(mouseY / (window.innerHeight * 0.5));
  
  const maxRotationX = Math.PI / 8;
  const maxRotationY = Math.PI / 6;
  
  const baseRotationOffset = new THREE.Quaternion();
  baseRotationOffset.setFromEuler(new THREE.Euler(-Math.PI / 18, 0, 0));
  
  let targetRotationY, targetRotationX;
  
  if (isMouseActive && returnToOriginalProgress === 0) {
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
    
    

    targetRotationY = THREE.MathUtils.lerp(mouseRotationY, 0, returnToOriginalProgress);
    targetRotationX = THREE.MathUtils.lerp(mouseRotationX, 0, returnToOriginalProgress);

    
  }
  
  const lookEuler = new THREE.Euler(targetRotationX, targetRotationY, 0, 'YXZ');
  const lookQuaternion = new THREE.Quaternion();
  lookQuaternion.setFromEuler(lookEuler);
  
  const targetQuaternion = new THREE.Quaternion();
  targetQuaternion.multiplyQuaternions(baseRotationOffset, lookQuaternion);
  
  const animationQuaternion = headBone.quaternion.clone();
  
  const animationInfluence = 0.5;
  const lookAtInfluence = 1 - animationInfluence;
  
  const blendedQuaternion = new THREE.Quaternion();
  blendedQuaternion.copy(animationQuaternion);
  blendedQuaternion.slerp(targetQuaternion, lookAtInfluence);
  
  const smoothingFactor = isMouseActive ? 0.1 : 0.05;
  headBone.quaternion.slerp(blendedQuaternion, smoothingFactor);
}

function setupPostProcessing() {
  composer = new EffectComposer(renderer);

  const taaRenderPass = new TAARenderPass(scene, camera);
  taaRenderPass.unbiased = false;
  taaRenderPass.sampleLevel = 1;
  composer.addPass(taaRenderPass);
  
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
  
  chromaticAberrationPass = new ChromaticAberrationPass(config.chromaticAberration.strength);
  chromaticAberrationPass.update(renderer, window.innerWidth, window.innerHeight);

  depthBlurPass = new DepthDrivenBlurPass(scene, camera, 1.0);
  depthBlurPass.excludeLayer(LAYERS.DOFIGNORE);

  const gamma = new ShaderPass(GammaCorrectionShader);

  composer.addPass(depthBlurPass);
  composer.addPass(chromaticAberrationPass);
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
    
    if (width) {
      width.value = window.innerWidth; 
    }
  }

  starNestMaterials.forEach(material => {
  if (material.userData.updateResolution) {
    material.userData.updateResolution(window.innerWidth, window.innerHeight);
  }
});

}

function animate(time) {
  if (!isAnimating) return;
  animationId = requestAnimationFrame(animate);
  
  const deltaTime = lastTime !== null ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  
  gltfMixer?.update(deltaTime);
  titleMixer?.update(deltaTime);

  const audioTime = AudioController.getCurrentTime();


  

  // Update Rive progress
  if (songprogressadd && scrub) {
    if (scrub.value && !isScrubbing) {
      isScrubbing = true;
    } else if (!scrub.value && isScrubbing) {
      isScrubbing = false;
      const targetValue = songprogressadd.value;
      
      isSeekingAudio = true;
      
      const duration = AudioController.getAudioDuration();
      if (duration > 0) {
        const seekTime = (targetValue / 100) * duration;
        AudioController.seekTo(seekTime);
      }
      
      setTimeout(() => {
        isSeekingAudio = false;
      }, 50);
    }
    
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

  updateTitlePosition(audioTime);

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

  // Handle animation transitions
  if (faceUpAnimation && walkAnimation) {
    const shouldBeInFaceUp = audioTime >= transitionTime;
    
    if (!faceUpAnimation.userData) {
      faceUpAnimation.userData = { lastAudioTime: 0 };
    }
    
    const lastAudioTime = faceUpAnimation.userData.lastAudioTime || 0;
    const timeDelta = Math.abs(audioTime - lastAudioTime);
    const isScrubbing = timeDelta > 0.5;
    faceUpAnimation.userData.lastAudioTime = audioTime;
    
    if (shouldBeInFaceUp) {
      if (isScrubbing) {
        if (!hasTransitioned || walkAnimation.getEffectiveWeight() > 0) {
          walkAnimation.setEffectiveWeight(0.0);
          faceUpAnimation.stop();
          faceUpAnimation.reset();
          faceUpAnimation.play();
          faceUpAnimation.setEffectiveWeight(1.0);
          
          const animTime = (audioTime - transitionTime) * faceUpAnimation.timeScale;
          if (animTime > 0) {
            faceUpAnimation.time = Math.min(animTime, faceUpAnimation.getClip().duration);
          }
          
          hasTransitioned = true;
          isInTransition = false;
        }
      } else if (!hasTransitioned && !isInTransition) {
        hasTransitioned = true;
        isInTransition = true;
        transitionStartTime = audioTime;
        
        faceUpAnimation.reset();
        faceUpAnimation.play();
        faceUpAnimation.setEffectiveWeight(0.0);
      } else if (isInTransition) {
        const transitionProgress = Math.min((audioTime - transitionStartTime) / transitionDuration, 1.0);
        const easedProgress = 0.5 - 0.5 * Math.cos(transitionProgress * Math.PI);
        
        walkAnimation.setEffectiveWeight(1.0 - easedProgress);
        faceUpAnimation.setEffectiveWeight(easedProgress);
        
        if (transitionProgress >= 1.0) {
          isInTransition = false;
        }
      }
    } else {
      if (hasTransitioned || isInTransition) {
        hasTransitioned = false;
        isInTransition = false;
        transitionStartTime = null;
        
        faceUpAnimation.stop();
        faceUpAnimation.reset();
        faceUpAnimation.setEffectiveWeight(0.0);
        
        if (!walkAnimation.isRunning()) {
          walkAnimation.reset();
          walkAnimation.play();
        }
        walkAnimation.setEffectiveWeight(1.0);
        walkAnimation.timeScale = 0.7;
      }
    }
  }

  // Update head tracking first
  updateHeadLookAt(camera, deltaTime);

  // Update wiggle bones after head tracking
  // wiggleBones.forEach(bone => {
  //   if (bone && bone.update) {
  //     bone.update(deltaTime);
  //   }
  // });
  

  
  // Update global camera position and rotation variables
 if (audioTime < animStartTime) {
  baseCameraPos.copy(startPos);
  baseCameraRot.copy(startRot);
  scene.fog.near = config.fog.start.near;
  scene.fog.far = config.fog.start.far;
  scene.fog.color.copy(fogStartColor);
  
  // Set initial FOV
  camera.fov = startFOV;
  camera.updateProjectionMatrix();
  
} else if (audioTime >= animStartTime && audioTime <= animEndTime) {
  const progress = (audioTime - animStartTime) / (animEndTime - animStartTime);
  const easedProgress = progress * progress * (3 - 2 * progress);
  
  baseCameraPos.lerpVectors(startPos, endPos, easedProgress);
  baseCameraRot.x = THREE.MathUtils.lerp(startRot.x, endRot.x, easedProgress);
  baseCameraRot.y = THREE.MathUtils.lerp(startRot.y, endRot.y, easedProgress);
  baseCameraRot.z = THREE.MathUtils.lerp(startRot.z, endRot.z, easedProgress);
  
  scene.fog.near = THREE.MathUtils.lerp(config.fog.start.near, config.fog.end.near, easedProgress);
  scene.fog.far = THREE.MathUtils.lerp(config.fog.start.far, config.fog.end.far, easedProgress);
  scene.fog.color.lerpColors(fogStartColor, fogEndColor, easedProgress);
  
  // Animate FOV
  camera.fov = THREE.MathUtils.lerp(startFOV, endFOV, easedProgress);
  camera.updateProjectionMatrix();
  
} else {
  baseCameraPos.copy(endPos);
  baseCameraRot.copy(endRot);
  scene.fog.near = config.fog.end.near;
  scene.fog.far = config.fog.end.far;
  scene.fog.color.copy(fogEndColor);
  
  // Set final FOV
  camera.fov = endFOV;
  camera.updateProjectionMatrix();
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

  updateStarNestMaterials(starNestMaterials, deltaTime, mouseX, mouseY, audioTime);
  
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

// Initialize after delay
setTimeout(() => {
  init();
}, 1000);

// Exports
export { scene, gltfModel, gltfMixer, gltfAnimationActions };
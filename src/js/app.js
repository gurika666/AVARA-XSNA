// app.js - Optimized main application with state machine
import * as THREE from "three";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader';
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import EndScene from './end-scene.js';

// Import unified shader manager
import { 
  ChromaticAberrationPass, 
  CursorPlane, 
  createSkyPlane, 
  updateCloudUniforms,
  applyStarNestToModel,
  updateStarNestMaterials,
  SHADER_QUALITY 
} from './shader-manager.js';

// Import other modules
import * as AudioController from './audioController.js';
import * as VegetationManager from './vegetation-manager.js';
import * as LoadingManager from './loading-manager.js';
import { DepthDrivenBlurPass } from './custom-dof.js';

import { Rive, EventType, RiveEventType, Layout, Fit, Alignment } from '@rive-app/webgl2';


let version1 = true;  // Default scene
let version2 = false;
let version3 = false;

// State Machine Class
class AnimationStateMachine {
  constructor() {
    this.STATES = {
      IDLE: 1,
      STAR_START: 2,
      MINIMAL: 3,
      FINAL: 4
    };
    
    this.currentState = this.STATES.IDLE;
    this.previousState = null;
    
    this.transitions = {
      toStarStart: 60,
      toMinimal: 80,
      toFinal: 85
    };
    
    this.stateFlags = {
      starShaderActive: false,
      firstCameraAnimActive: false,
      skyShaderActive: true,
      vegetationActive: true,
      secondCameraAnimActive: false,
      swirlAnimActive: false
    };
    
    // Swirl animation timing (relative to state 4 entry)
    this.swirlAnimation = {
      startDelay: 25,  // Start 25 seconds after entering FINAL state (85 + 25 = 110)
      duration: 10,    // Run for 10 seconds (110 to 120)
      stateEntryTime: null
    };
  }
  
  update(audioTime) {
    let newState = this.currentState;
    
    if (audioTime < this.transitions.toStarStart) {
      newState = this.STATES.IDLE;
    } else if (audioTime < this.transitions.toMinimal) {
      newState = this.STATES.STAR_START;
    } else if (audioTime < this.transitions.toFinal) {
      newState = this.STATES.MINIMAL;
    } else {
      newState = this.STATES.FINAL;
    }
    
    if (newState !== this.currentState) {
      this.transitionTo(newState, audioTime);
    }
    
    // Update swirl animation flag based on time in FINAL state
    if (this.currentState === this.STATES.FINAL && this.swirlAnimation.stateEntryTime !== null) {
      const timeInState = audioTime - this.swirlAnimation.stateEntryTime;
      const swirlStart = this.swirlAnimation.startDelay;
      const swirlEnd = this.swirlAnimation.startDelay + this.swirlAnimation.duration;
      
      this.stateFlags.swirlAnimActive = timeInState >= swirlStart && timeInState <= swirlEnd;
    }
    
    return this.currentState;
  }
  
  transitionTo(newState, audioTime = 0) {
    if (newState === this.currentState) return;
    
    this.previousState = this.currentState;
    this.currentState = newState;
    
    switch (newState) {
      case this.STATES.IDLE:
        this.stateFlags = {
          starShaderActive: false,
          firstCameraAnimActive: false,
          skyShaderActive: true,
          vegetationActive: true,
          secondCameraAnimActive: false,
          swirlAnimActive: false
        };
        this.swirlAnimation.stateEntryTime = null;
        break;
        
      case this.STATES.STAR_START:
        this.stateFlags = {
          starShaderActive: true,
          firstCameraAnimActive: true,
          skyShaderActive: true,
          vegetationActive: true,
          secondCameraAnimActive: false,
          swirlAnimActive: false
        };
        this.swirlAnimation.stateEntryTime = null;
        break;
        
      case this.STATES.MINIMAL:
        this.stateFlags = {
          starShaderActive: true,
          firstCameraAnimActive: false,
          skyShaderActive: false,
          vegetationActive: false,
          secondCameraAnimActive: false,
          swirlAnimActive: false
        };
        this.swirlAnimation.stateEntryTime = null;
        break;
        
      case this.STATES.FINAL:
        this.stateFlags = {
          starShaderActive: true,
          firstCameraAnimActive: false,
          skyShaderActive: false,
          vegetationActive: false,
          secondCameraAnimActive: true,
          swirlAnimActive: false  // Will be updated based on time in state
        };
        // Record when we entered FINAL state for swirl timing
        this.swirlAnimation.stateEntryTime = audioTime;
        break;
    }
    
    console.log(`State: ${this.getStateName(this.previousState)} -> ${this.getStateName(this.currentState)}`);
  }
  
  getStateName(state = this.currentState) {
    const names = Object.keys(this.STATES);
    return names.find(key => this.STATES[key] === state) || 'UNKNOWN';
  }
  
  isStarShaderActive() { return this.stateFlags.starShaderActive; }
  isFirstCameraAnimActive() { return this.stateFlags.firstCameraAnimActive; }
  isSkyShaderActive() { return this.stateFlags.skyShaderActive; }
  isVegetationActive() { return this.stateFlags.vegetationActive; }
  isSecondCameraAnimActive() { return this.stateFlags.secondCameraAnimActive; }
  isSwirlAnimActive() { return this.stateFlags.swirlAnimActive; }
  
  getSwirlProgress(audioTime) {
    if (!this.stateFlags.swirlAnimActive || this.swirlAnimation.stateEntryTime === null) {
      return -1; // Not active
    }
    
    const timeInState = audioTime - this.swirlAnimation.stateEntryTime;
    const timeInSwirl = timeInState - this.swirlAnimation.startDelay;
    return Math.max(0, Math.min(1, timeInSwirl / this.swirlAnimation.duration));
  }
  
  isInState(stateName) {
    return this.currentState === this.STATES[stateName];
  }
}

// Simple mobile detection
window.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                  (window.innerWidth <= 768);

// Initialize state machine
const stateMachine = new AnimationStateMachine();


let endScene = null;

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
let lyricText, spot;
let focus1, focus2, focus3;
let vhs1collected, vhs2collected, vhs3collected;
let focus1Triggered, focus2Triggered,focus3Triggered;
let vhscount;
let finished;

let preFocusPosition = null;  // Store camera position before zoom
let isHoverFocused = false;  // Track hover state
let hoverZoomAmount = 0;  // Current zoom distance
let zoomDirection = new THREE.Vector3();  // Direction to zoom toward

let hoverInput;

let starNestMaterials = new Map();

// Globals
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass;
let isAnimating = false, animationId = null, lastTime = null, isSetupComplete = false;
let skyPlane, gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font;
let cursorPlane = new CursorPlane();
let titleMixer;
let textmaterial;
const canvas = document.querySelector('.main-animation');
const rivecanvas = document.querySelector('.rive');

// Camera tracking globals
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
  }

};

// Animation timing
const animStartTime = 60;
const animEndTime = 80;
const transitionTime = 77;
const transitionDuration = 2.8;

// First camera animation
let startPos = new THREE.Vector3(0, 2, 0);
let endPos = new THREE.Vector3(0, 12, -94);

let startRot = new THREE.Euler(0, 0, 0);
let endRot = new THREE.Euler(0.8, 0, 0);

let startFOV = 40;
let endFOV = 90;

// Second camera animation
let startPos2 = new THREE.Vector3(0, 12, -94);
let endPos2 = new THREE.Vector3(0, 12, -95);

let startRot2 = new THREE.Euler(0.8, 0, 0);
let endRot2 = new THREE.Euler(0, 0, 0);

let startFOV2 = 90;
let endFOV2 = 10;

// Second animation timing
const animStartTime2 = 85;
const animEndTime2 = 110;
  
let fogStartColor = new THREE.Color(config.fog.start.color);
let fogEndColor = new THREE.Color(config.fog.end.color);

// Note: Swirl animation timing is now controlled by the state machine
// It starts 25 seconds after entering FINAL state (at t=110) and runs for 10 seconds

const textAppearTimes = [
  { time: 26.593, text: "Tvalebs Adevs Nami" },
  { time: 29.777, text: "Zgvaa Dzaan Wynari" },
  { time: 32.890, text: "Caze Fantavs Elvebs" },
  { time: 35, text: "Dauokebeli Brazi" },
  { time: 37.8, text: "Axals Arafers Ar Getyvi" },
 
];

const focusTimes = {
  focus1Time: 2,  // Set focus1 to true at 10 seconds
  focus2Time: 20,  // Set focus2 to true at 20 seconds
  focus3Time: 30   // Set focus3 to true at 30 seconds
};
const FOCUS_TIMEOUT_DURATION = 10;  // Seconds before focus auto-disables (easy to change)
let focus1Timer = null;
let focus2Timer = null;
let focus3Timer = null;

// Resources to be loaded
const resources = {
  hdri: null,
  txthdr: null,
  font: null,
  glb: null,
  audio: null,
  vegetation: null
};



async function init() {
  loadRiveOverlay();

  // Setup renderer first
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // renderer.outputEncoding = THREE.sRGBEncoding;

  const pixelRatio = window.isMobile ? 0.7 : 1;
  renderer.setPixelRatio(0.6);

  renderer.setSize(window.innerWidth, window.innerHeight);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(config.fog.start.color, config.fog.start.near, config.fog.start.far);
  
  // Initialize controllers
  AudioController.init({ 
  
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
      
    ]);
    updateProgress();
  } catch (error) {
    console.error('Failed to load HDR textures:', error);
    throw error;
  }
  
  const remainingTasks = [
    loadFont('fonts/Monarch_Regular.json', manager),
    loadGLB(config.glb.path, manager),
 
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
        
        // Apply star nest shader using unified shader manager
        starNestMaterials = applyStarNestToModel(gltfModel, resources);
        
        const { position: p, scale: s, rotation: r } = config.glb;
        gltfModel.position.copy(p);
        gltfModel.scale.copy(s);
        gltfModel.rotation.copy(r);
        scene.add(gltfModel);
        
        // Setup tracking systems
        setupHeadTracking();
        
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
    // artboard: 'Artboard',
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
      lyricText = viewmodel.string('lyrics');
      focus1 = viewmodel.boolean('focus1');
      focus2 = viewmodel.boolean('focus2');
      focus3 = viewmodel.boolean('focus3');
      hoverInput = viewmodel.boolean('hoverfocus');
      vhscount = viewmodel.number('vhscount');
    
      
      stoppedInput = inputs.find(i => i.name === 'stopped');
      loadedInput = inputs.find(i => i.name === 'Loaded');
      finished = inputs.find(i => i.name === 'finished');
      




    rive.on(EventType.RiveEvent || 'spotifyevent', (event) => {
        if (event.data.name === 'spotify') {
          // document.body.classList.add('spotify');

          console.log('Spotify event received');

        window.location.assign('https://open.spotify.com/artist/5UZEQzbK7ktedLBHvZ2wkJ?si=heZI_ZZFRO6ms4xBZURn7A', '_blank');
        }
      });


      rive.on(EventType.RiveEvent || 'instaevent', (event) => {
        if (event.data.name === 'instagram') {
          // document.body.classList.add('instagram');

          console.log('Instagram event received');
         window.location.assign('https://www.instagram.com/avara.band?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==', '_top');
        
        }
      });


      rive.on(EventType.RiveEvent || 'riveevent', (event) => {
        if (event && event.data && event.data.name === 'click') {
          document.body.classList.add('clicked');
          if (isSetupComplete) {
            togglePlayPause();
          }
         
        }
      });

     
 rive.on(EventType.RiveEvent || 'vhs1event', (event) => {
  if (event && event.data && event.data.name === 'vhs1') {
    if (focus1) focus1.value = false;
    if (focus2) focus2.value = false;
    if (focus3) focus3.value = false;
    if (hoverInput) hoverInput.value = false;
   clearFocusTimers();
    vhs1collected = true;
    vhscount.value += 1;
    console.log('VHS1 collected, focus and hover booleans set to false');
  }
});

rive.on(EventType.RiveEvent || 'vhs2event', (event) => {
  if (event && event.data && event.data.name === 'vhs2') {
    if (focus1) focus1.value = false;
    if (focus2) focus2.value = false;
    if (focus3) focus3.value = false;
    if (hoverInput) hoverInput.value = false;
  clearFocusTimers();
    vhs2collected = true;
    vhscount.value += 1;
    console.log('VHS2 collected, focus and hover booleans set to false');
  }
});

rive.on(EventType.RiveEvent || 'vhs3event', (event) => {
  if (event && event.data && event.data.name === 'vhs3') {
    if (focus1) focus1.value = false;
    if (focus2) focus2.value = false;
    if (focus3) focus3.value = false;
    if (hoverInput) hoverInput.value = false;
  clearFocusTimers();
    vhs3collected = true;
    vhscount.value += 1;
    console.log('VHS3 collected, focus and hover booleans set to false');
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

function updateFocusBooleans(audioTime) {
  // Check and trigger focus1
  if (!focus1Triggered && !vhs1collected && audioTime >= focusTimes.focus1Time) {
    if (focus1) {
      // Disable other focuses before enabling this one
      if (focus2) focus2.value = false;
      if (focus3) focus3.value = false;
      clearFocusTimers();  // Clear all timers
      
      focus1.value = true;
      startFocusTimer(1);
    }
    focus1Triggered = true;
  }
  
  // Check and trigger focus2
  if (!focus2Triggered && !vhs2collected && audioTime >= focusTimes.focus2Time) {
    if (focus2) {
      // Disable other focuses before enabling this one
      if (focus1) focus1.value = false;
      if (focus3) focus3.value = false;
      clearFocusTimers();  // Clear all timers
      
      focus2.value = true;
      startFocusTimer(2);
    }
    focus2Triggered = true;
  }
  
  // Check and trigger focus3
  if (!focus3Triggered && !vhs3collected && audioTime >= focusTimes.focus3Time) {
    if (focus3) {
      // Disable other focuses before enabling this one
      if (focus1) focus1.value = false;
      if (focus2) focus2.value = false;
      clearFocusTimers();  // Clear all timers
      
      focus3.value = true;
      startFocusTimer(3);
    }
    focus3Triggered = true;
  }
}

function clearFocusTimers() {
  if (focus1Timer) {
    clearTimeout(focus1Timer);
    focus1Timer = null;
  }
  if (focus2Timer) {
    clearTimeout(focus2Timer);
    focus2Timer = null;
  }
  if (focus3Timer) {
    clearTimeout(focus3Timer);
    focus3Timer = null;
  }
}

function startFocusTimer(focusNumber) {
  // Clear any existing timer for this focus
  if (focusNumber === 1 && focus1Timer) {
    clearTimeout(focus1Timer);
  } else if (focusNumber === 2 && focus2Timer) {
    clearTimeout(focus2Timer);
  } else if (focusNumber === 3 && focus3Timer) {
    clearTimeout(focus3Timer);
  }
  
  // Start new timer
  const timer = setTimeout(() => {
    if (focusNumber === 1 && focus1) {
      focus1.value = false;
      if (hoverInput) hoverInput.value = false;  // Also disable hover
      console.log('Focus1 auto-timeout after', FOCUS_TIMEOUT_DURATION, 'seconds');
    } else if (focusNumber === 2 && focus2) {
      focus2.value = false;
      if (hoverInput) hoverInput.value = false;  // Also disable hover
      console.log('Focus2 auto-timeout after', FOCUS_TIMEOUT_DURATION, 'seconds');
    } else if (focusNumber === 3 && focus3) {
      focus3.value = false;
      if (hoverInput) hoverInput.value = false;  // Also disable hover
      console.log('Focus3 auto-timeout after', FOCUS_TIMEOUT_DURATION, 'seconds');
    }
  }, FOCUS_TIMEOUT_DURATION * 1000);  // Convert seconds to milliseconds
  
  // Store timer reference
  if (focusNumber === 1) focus1Timer = timer;
  else if (focusNumber === 2) focus2Timer = timer;
  else if (focusNumber === 3) focus3Timer = timer;
}

function updateLyricText(audioTime) {
  if (!lyricText) return;
  
  // Find the current text that should be displayed
  let currentText = "";
  
  // Go through the times in reverse to find the most recent text
  for (let i = textAppearTimes.length - 1; i >= 0; i--) {
    if (audioTime >= textAppearTimes[i].time) {
      currentText = textAppearTimes[i].text;
      break;
    }
  }
  
  // Update the Rive text variable
 lyricText.value = currentText;
}

function handleVersionChange(versionNumber) {
  // Set version booleans based on selected object
  version1 = (versionNumber === 1);
  version2 = (versionNumber === 2);
  version3 = (versionNumber === 3);
  
  console.log(`Version changed to: version${versionNumber} - version1: ${version1}, version2: ${version2}, version3: ${version3}`);
  
  // Reset audio and restart scene
  AudioController.reset();
  if (finished) finished.value = false;
  
  // Hide end scene and restart animation
  if (endScene) {
    endScene.hide();
  }
  
  // Start animation from beginning
  startAnimation();
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

  console.log('Starting with version1 (default scene)');

  camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 0);
  camera.layers.enable(LAYERS.DOFIGNORE);

  if (!camera.parent) {
    scene.add(camera);
  }
  

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
  
 
  



  
  VegetationManager.createInitialVegetationWhenReady(scene);
  
  isSetupComplete = true;


   endScene = new EndScene(
    resources.txthdr, 
    (versionNumber) => {
      // Handle version change callback
      handleVersionChange(versionNumber);
    },
    {
      vhs1: vhs1collected || true,
      vhs2: vhs2collected || false,
      vhs3: vhs3collected || false
    }
  );

  await endScene.init();
  endScene.hide();

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


function updateSwirlAnimation(audioTime) {
  if (!starNestMaterials || starNestMaterials.size === 0) return;
  
  const swirlProgress = stateMachine.getSwirlProgress(audioTime);
  
  if (swirlProgress < 0) {
    // Swirl not active - use default values
    starNestMaterials.forEach(material => {
      if (material.userData?.uniforms) {
        material.userData.uniforms.swirlAmount.value = 2.5;
        material.userData.uniforms.swirlSpeed.value = 1.3;
      }
    });
  } else {
    // Swirl active - animate based on progress
    const easedProgress = swirlProgress * swirlProgress * (3 - 2 * swirlProgress);
    
    const swirlAmount = THREE.MathUtils.lerp(2.5, 6.0, easedProgress);
    const swirlSpeed = THREE.MathUtils.lerp(1.3, 20.0, easedProgress);
    
    starNestMaterials.forEach(material => {
      if (material.userData?.uniforms) {
        material.userData.uniforms.swirlAmount.value = swirlAmount;
        material.userData.uniforms.swirlSpeed.value = swirlSpeed;
      }
    });
  }
}

const animationCache = {
  animationQuaternion: new THREE.Quaternion(),
  blendedQuaternion: new THREE.Quaternion(),
  lookQuaternion: new THREE.Quaternion(),
  targetQuaternion: new THREE.Quaternion(),
  baseRotationOffset: new THREE.Quaternion(),
  lookEuler: new THREE.Euler(),
  targetPoint: new THREE.Vector3(),
  lastAudioDuration: 0,
};

function updateHeadLookAtOptimized(camera, deltaTime) {
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
  
  animationCache.baseRotationOffset.setFromEuler(new THREE.Euler(-Math.PI / 18, 0, 0));
  
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
  
  animationCache.lookEuler.set(targetRotationX, targetRotationY, 0, 'YXZ');
  animationCache.lookQuaternion.setFromEuler(animationCache.lookEuler);
  
  animationCache.targetQuaternion.multiplyQuaternions(
    animationCache.baseRotationOffset, 
    animationCache.lookQuaternion
  );
  
  animationCache.animationQuaternion.copy(headBone.quaternion);
  
  const animationInfluence = 0.5;
  const lookAtInfluence = 1 - animationInfluence;
  
  animationCache.blendedQuaternion.copy(animationCache.animationQuaternion);
  animationCache.blendedQuaternion.slerp(animationCache.targetQuaternion, lookAtInfluence);
  
  const smoothingFactor = isMouseActive ? 0.1 : 0.05;
  headBone.quaternion.slerp(animationCache.blendedQuaternion, smoothingFactor);
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

  const pixelRatio = window.isMobile ? 0.5 : 1;
  renderer.setPixelRatio(pixelRatio);

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer?.setSize(window.innerWidth, window.innerHeight);

  if (rive) {
    rive.resizeDrawingSurfaceToCanvas();
    
    if (width) {
      width.value = window.innerWidth; 
    }
  }

  starNestMaterials.forEach(material => {
    if (material.updateResolution) {
      material.updateResolution(window.innerWidth, window.innerHeight);
    }
  });
}

function handleAnimationTransitions(audioTime, deltaTime) {
  if (!faceUpAnimation || !walkAnimation) return;
  
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

function animate(time) {
  if (!isAnimating) return;
  animationId = requestAnimationFrame(animate);
  
  const deltaTime = lastTime !== null ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  
  if (deltaTime < 0.001) return;
  
  const audioTime = AudioController.getCurrentTime();
  
  // Update state machine
  stateMachine.update(audioTime);
  
  // Always running updates
  gltfMixer?.update(deltaTime);
 

  handleAnimationTransitions(audioTime, deltaTime);
  updateHeadLookAtOptimized(camera, deltaTime);
  cursorPlane.update(camera, deltaTime);
  
  // State-dependent updates
  
  // 1. Star shader
  if (stateMachine.isStarShaderActive()) {
    updateStarNestMaterials(starNestMaterials, deltaTime, mouseX, mouseY, audioTime);
  }
  
  // 2. Sky shader
  if (stateMachine.isSkyShaderActive()) {
    updateCloudUniforms(skyPlane.material, audioTime * 0.03, window.innerWidth, window.innerHeight);
  }
  
  // 3. Vegetation
  if (stateMachine.isVegetationActive()) {
    const vegetationCounts = VegetationManager.updateVegetation(scene, 0.5 * (deltaTime * 60));
    AudioController.update(deltaTime, vegetationCounts.trees);
  }
  
  // 4. Swirl animation (controlled by state machine)
  if (stateMachine.isSwirlAnimActive()) {
    updateSwirlAnimation(audioTime);
  }
  
  // 4. Camera animations
  if (stateMachine.isFirstCameraAnimActive()) {
    const progress = Math.max(0, Math.min(1, (audioTime - animStartTime) / (animEndTime - animStartTime)));
    const easedProgress = progress * progress * (3 - 2 * progress);
    
    baseCameraPos.lerpVectors(startPos, endPos, easedProgress);
    baseCameraRot.x = THREE.MathUtils.lerp(startRot.x, endRot.x, easedProgress);
    baseCameraRot.y = THREE.MathUtils.lerp(startRot.y, endRot.y, easedProgress);
    baseCameraRot.z = THREE.MathUtils.lerp(startRot.z, endRot.z, easedProgress);
    
    scene.fog.near = THREE.MathUtils.lerp(config.fog.start.near, config.fog.end.near, easedProgress);
    scene.fog.far = THREE.MathUtils.lerp(config.fog.start.far, config.fog.end.far, easedProgress);
    scene.fog.color.lerpColors(fogStartColor, fogEndColor, easedProgress);
    
    camera.fov = THREE.MathUtils.lerp(startFOV, endFOV, easedProgress);
    camera.updateProjectionMatrix();
  } else if (stateMachine.isSecondCameraAnimActive()) {
    const progress = Math.max(0, Math.min(1, (audioTime - animStartTime2) / (animEndTime2 - animStartTime2)));
    const easedProgress = progress * progress * (3 - 2 * progress);
    
    baseCameraPos.lerpVectors(startPos2, endPos2, easedProgress);
    baseCameraRot.x = THREE.MathUtils.lerp(startRot2.x, endRot2.x, easedProgress);
    baseCameraRot.y = THREE.MathUtils.lerp(startRot2.y, endRot2.y, easedProgress);
    baseCameraRot.z = THREE.MathUtils.lerp(startRot2.z, endRot2.z, easedProgress);
    
    camera.fov = THREE.MathUtils.lerp(startFOV2, endFOV2, easedProgress);
    camera.updateProjectionMatrix();
  } else {
    // Set static camera position based on state
    if (stateMachine.isInState('IDLE')) {
      baseCameraPos.copy(startPos);
      baseCameraRot.copy(startRot);
      camera.fov = startFOV;
      scene.fog.near = config.fog.start.near;
      scene.fog.far = config.fog.start.far;
      scene.fog.color.copy(fogStartColor);
    } else if (stateMachine.isInState('MINIMAL')) {
      baseCameraPos.copy(endPos);
      baseCameraRot.copy(endRot);
      camera.fov = endFOV;
      scene.fog.near = config.fog.end.near;
      scene.fog.far = config.fog.end.far;
      scene.fog.color.copy(fogEndColor);
    } else if (stateMachine.isInState('FINAL') && audioTime > animEndTime2) {
      baseCameraPos.copy(endPos2);
      baseCameraRot.copy(endRot2);
      camera.fov = endFOV2;
    }
    camera.updateProjectionMatrix();
  }
  
  // Update spotlight
  mouseNDC.set((mouseX / window.innerWidth) * 2, (mouseY / window.innerHeight) * -2);
  raycaster.setFromCamera(mouseNDC, camera);
  raycaster.ray.at(50, animationCache.targetPoint);
  spotlight.target.position.copy(animationCache.targetPoint);
  spotlight.position.copy(camera.position);
  
  // Mouse-based camera rotation
  const targetRotY = (mouseX / window.innerWidth) * 0.15;
  const targetRotX = (mouseY / window.innerHeight) * 0.15;
  camera.rotation.x = THREE.MathUtils.clamp(
    baseCameraRot.x + targetRotX,
    baseCameraRot.x - 0.15,
    baseCameraRot.x + 0.15
  );
  camera.rotation.y = baseCameraRot.y + targetRotY;
  camera.rotation.z = baseCameraRot.z;
  
  camera.position.copy(baseCameraPos);
  
  // Audio progress
  let audioDuration = animationCache.lastAudioDuration;
  if (songprogressadd && Math.abs(audioDuration - AudioController.getAudioDuration()) > 0.01) {
    audioDuration = AudioController.getAudioDuration();
    animationCache.lastAudioDuration = audioDuration;
  }
  
  if (songprogressadd && scrub && audioDuration > 0) {
    if (scrub.value && !isScrubbing) {
      isScrubbing = true;
    } else if (!scrub.value && isScrubbing) {
      isScrubbing = false;
      const targetValue = songprogressadd.value;
      isSeekingAudio = true;
      
      const seekTime = (targetValue / 100) * audioDuration;
      AudioController.seekTo(seekTime);
      
      setTimeout(() => { isSeekingAudio = false; }, 50);
    }
    
    if (!isScrubbing && !isSeekingAudio) {
      const progress = (audioTime / audioDuration) * 100;
      songprogressadd.value = progress;
    }
  }


// Handle hover cursor zoom
if (hoverInput && hoverInput.value) {
  // Store the position when first starting hover
  if (!isHoverFocused) {
    preFocusPosition = camera.position.clone();
    isHoverFocused = true;
    hoverZoomAmount = 0;
    
    // Calculate zoom direction from camera toward cursor position in 3D space
    mouseNDC.set(
      (mouseX / window.innerWidth) * 2,
      -(mouseY / window.innerHeight) * 2
    );
    raycaster.setFromCamera(mouseNDC, camera);
    
    // Get a point along the ray as zoom target
    raycaster.ray.at(50, zoomDirection);
    zoomDirection.sub(camera.position).normalize();
  }
  
  // Continuously zoom toward cursor position
  hoverZoomAmount += 0.5;  // Adjust this value to control zoom speed
  
  // Move camera along the zoom direction
  camera.position.copy(preFocusPosition);
  camera.position.addScaledVector(zoomDirection, hoverZoomAmount);
  
  // Optional: Limit maximum zoom distance
  // if (hoverZoomAmount > 20) hoverZoomAmount = 20;
  
} else if (isHoverFocused) {
  // Snap back to stored position when hover ends
  camera.position.copy(preFocusPosition);
  isHoverFocused = false;
  hoverZoomAmount = 0;
  preFocusPosition = null;
}

if (finished && audioDuration > 0) {
  const isFinished = audioTime >= audioDuration - 0.1;
  
  if (isFinished && !finished.value) {
    // Song just finished
    finished.value = true;
    isAnimating = false;  // Stop the animation loop


      if (endScene) {
        endScene.show();
      }


    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    // Don't call pauseAnimation() - just stop the loop
    return;
  } else if (!isFinished && finished.value) {
    // Song was finished but now we're not at the end (user seeked back)
    finished.value = false;


     if (endScene) {
        endScene.hide();
      }

  }
}

// If finished is true, don't continue animating
if (finished && finished.value) {
  return;
}

  updateLyricText(audioTime);

  updateFocusBooleans(audioTime);

  // Render
  if (scene && camera) composer.render();
}

function startAnimation() {
  if (isAnimating) {
    return;
  }
  
  // Check if we're at the end
  const audioTime = AudioController.getCurrentTime();
  const audioDuration = AudioController.getAudioDuration();
  
  if (audioDuration > 0 && audioTime >= audioDuration - 0.1) {
    // We're at the end, reset to beginning
    AudioController.reset();
    if (finished) finished.value = false;


      if (endScene) {
      endScene.hide();
    }

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
  
  // Don't reset finished state here - keep it true if song ended
}

// Initialize after delay
setTimeout(() => {
  init();
}, 1000);

// Exports
export { scene, gltfModel, gltfMixer, gltfAnimationActions };
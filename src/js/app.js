// app.js - Streamlined version with centralized timing configuration
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
import { inject } from '@vercel/analytics';

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


inject();

// Import other modules
import * as AudioController from './audioController.js';
import * as VegetationManager from './vegetation-manager.js';
import * as LoadingManager from './loading-manager.js';
import { DepthDrivenBlurPass } from './custom-dof.js';

import { Rive, EventType, RiveEventType, Layout, Fit, Alignment } from '@rive-app/webgl2';
import SimpleControls from './simple-controls.js';

// ============================================================================
// CENTRALIZED TIMING CONFIGURATION
// ============================================================================
const TIMING = {
  // Main state transitions (in seconds)
  states: {
    IDLE_END: 90,        // When IDLE ends and STAR_START begins
    STAR_START_END: 100,  // When STAR_START ends and MINIMAL begins  
    MINIMAL_END: 120,     // When MINIMAL ends and FINAL begins
  },
  
  // Camera animations
  camera: {
    // First animation (during STAR_START state)
    first: {
      get start() { return TIMING.states.IDLE_END; }, // Auto-sync with state
      get end() { return TIMING.states.STAR_START_END; },
      startPos: new THREE.Vector3(0, 2, 0),
      endPos: new THREE.Vector3(0, 12, -94),
      startRot: new THREE.Euler(0, 0, 0),
      endRot: new THREE.Euler(0.8, 0, 0),
      startFOV: 40,
      endFOV: 90
    },
    
    // Second animation (during FINAL state)
    second: {
      get start() { return TIMING.states.MINIMAL_END; }, // Auto-sync with state
      end: 130,
      startPos: new THREE.Vector3(0, 12, -94),
      endPos: new THREE.Vector3(0, 12, -95),
      startRot: new THREE.Euler(0.8, 0, 0),
      endRot: new THREE.Euler(0, 0, 0),
      startFOV: 90,
      endFOV: 10
    }
  },
  
  // Character animations
  character: {
    walkToFaceUp: {
      start: 96,      // When to start transitioning
      duration: 4.8   // How long the blend takes
    }
  },
  
  // Special effects
  effects: {
    swirl: {
      delayAfterFinalState: 25,  // Seconds after FINAL state starts
      duration: 10                // How long swirl lasts
    }
  },
  
  // Sky colors for different states
  skyColors: {
    idle: {
      cloudColor: new THREE.Vector3(0, 0, 0),        // Black clouds
      skyTopColor: new THREE.Vector3(0.002, 0.090, 0.480),  // Dark blue
      skyBottomColor: new THREE.Vector3(0, 0, 0)     // Black
    },
    starStart: {
      cloudColor: new THREE.Vector3(0, 0, 0),  // Purple clouds
      skyTopColor: new THREE.Vector3(1, 0.005, 0), // Purple top
      skyBottomColor: new THREE.Vector3(0, 0, 0) // Dark purple bottom
    }
  },
  
  // Fog configuration
  fog: {
    start: {
      near: 30,
      far: 100,
      color: 0x000000
    },
    end: {
      near: 2,
      far: 10,
      color: 0x000000
    }
  }
};

// ============================================================================
// STATE MACHINE CLASS
// ============================================================================
class AnimationStateMachine {
  constructor(timingConfig = TIMING) {
    this.timing = timingConfig;
    
    this.STATES = {
      IDLE: 1,
      STAR_START: 2,
      MINIMAL: 3,
      FINAL: 4
    };
    
    this.currentState = this.STATES.IDLE;
    this.previousState = null;
    
    this.transitions = {
      toStarStart: timingConfig.states.IDLE_END,
      toMinimal: timingConfig.states.STAR_START_END,
      toFinal: timingConfig.states.MINIMAL_END
    };
    
    this.stateFlags = {
      starShaderActive: false,
      firstCameraAnimActive: false,
      skyShaderActive: true,
      vegetationActive: true,
      secondCameraAnimActive: false,
      swirlAnimActive: false
    };
    
    this.swirlAnimation = {
      startDelay: timingConfig.effects.swirl.delayAfterFinalState,
      duration: timingConfig.effects.swirl.duration,
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
          skyShaderActive: true,
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
          swirlAnimActive: false
        };
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
      return -1;
    }
    
    const timeInState = audioTime - this.swirlAnimation.stateEntryTime;
    const timeInSwirl = timeInState - this.swirlAnimation.startDelay;
    return Math.max(0, Math.min(1, timeInSwirl / this.swirlAnimation.duration));
  }
  
  isInState(stateName) {
    return this.currentState === this.STATES[stateName];
  }
}

// ============================================================================
// GLOBALS AND CONFIGURATION
// ============================================================================
window.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                  (window.innerWidth <= 768);

const stateMachine = new AnimationStateMachine(TIMING);

let simpleControls;
let depthBlurPass;
let rive;
let width;
let stoppedInput;
let loadedInput;
let loadingProgress; 
let playingInput;
let currentProgress = 0;
let progressInterval = null;
let starNestMaterials = new Map();
let lyrics;

// Three.js globals
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass;
let isAnimating = false, animationId = null, lastTime = null, isSetupComplete = false;
let skyPlane, gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font;
let cursorPlane = new CursorPlane();
const canvas = document.querySelector('.main-animation');
const rivecanvas = document.querySelector('.rive');

// Camera tracking
let baseCameraPos = new THREE.Vector3();
let baseCameraRot = new THREE.Euler();

const LAYERS = {
  DOFIGNORE: 2,
};

// Animation variables
let walkAnimation = null;
let faceUpAnimation = null;
let hasTransitioned = false;
let isInTransition = false;
let transitionStartTime = null;

// Head tracking
let headBone = null;
let headQuaternion = new THREE.Quaternion();
let targetQuaternion = new THREE.Quaternion();

// Mouse tracking
let lastMouseX = 0;
let lastMouseY = 0;
let mouseInactiveFrames = 0;
const MOUSE_INACTIVE_THRESHOLD = 60;
const MOUSE_MOVEMENT_THRESHOLD = 2;

const textureloader = new THREE.TextureLoader();

// Static configuration
const config = {
  text: { size: 2, height: 0.1, depth: 1, z: -50 },
  bloom: { strength: 0.2, radius: 2.0, threshold: 0.1 },
  chromaticAberration: { strength: 0.01 },
  camera: { fov: 40 },
  fog: TIMING.fog,
  glb: {
    path: 'mesh/latex.glb',
    position: new THREE.Vector3(0, 0, -100),
    scale: new THREE.Vector3(1, 1, 1),
    rotation: new THREE.Euler(0, 0, 0),
    autoplay: true
  },
  sky: {
    cloudColor: new THREE.Vector3(0, 0, 0),
    skyTopColor: new THREE.Vector3(0.002, 0.090, 0.480),
    skyBottomColor: new THREE.Vector3(0, 0, 0)
  },
  stars: {
    nebulaColor1: new THREE.Vector3(1.0, 0.2, 0.5),
    nebulaColor2: new THREE.Vector3(0.1, 0.5, 1.0),
    nebulaColor3: new THREE.Vector3(1.0, 0.6, 0.1)
  }
};

let fogStartColor = new THREE.Color(0x000000);
let fogEndColor = new THREE.Color(0x000000);

// Resources
const resources = {
  hdri: null,
  txthdr: null,
  font: null,
  glb: null,
  audio: null,
  vegetation: null
};

// Lyrics data
const lyricsData = [

  { time: 26.0, text: "Tvalebs adevs nami" }, 
  { time: 29.0, text: "Zgvaa dzaan wynari" },
  { time: 32.0, text: "Caze fantavs elvebs" },
  { time: 35.0, text: "Dauokebeli brazi" },
  { time: 38.0, text: "Axals arafers ar getyvi" },
  { time: 40.5, text: "Rasac akamde shen" },
  { time: 43.0, text: "Ebrdzvi!" },
  { time: 45.0, text: "Dalewili dzvlebit" },
  { time: 48.0, text: "" },
  { time: 50.0, text: "Sadac ar unda iyo" },
  { time: 53.5, text: "Shenamde mosasvleli" },
  { time: 56.0, text: "Gza minda viyo" },
  { time: 60.0, text: "" },
  { time: 62.0, text: "Razec ar unda gelavde" },
  { time: 66.0, text: "Me shentvis movlenili" },
  { time: 68.0, text: "XSNA minda viyo" },
  { time: 71.0, text: "" },
  { time: 72.0, text: "Rasac ar unda fiqrobde" },
  { time: 76.0, text: "Razec ar unda gelavde" },
  { time: 79.0, text: "Rasac ar unda fiqrobde" },
  { time: 84.0, text: "Me sheni XSNA minda viyo!" },
  { time: 88.0, text: "Rasac ar unda fiqrobde" },
  { time: 91.0, text: "Razec ar unda gelavde" },
  { time: 96.0, text: "Me sheni XSNA minda viyo!" },
  { time: 100.0, text: "" },
  { time: 109.0, text: "Me sheni XSNA minda viyo" },
  { time: 112.0, text: "" },
  { time: 121.0, text: "Me sheni XSNA minda viyo" },
  { time: 124.0, text: "Macade Macade Macade Macade" },
  { time: 126.0, text: "Uceb getyvi" },
  { time: 127.5, text: "Usmine Usmine Usmine" },
  { time: 129.0, text: "Usityvod rom ver xvdebi" },
  { time: 131.0, text: "Gadade Gadade Gadade" },
  { time: 133.0, text: "Rasac shvrebi" },
  { time: 134.5, text: "Acade Acade Acade" },
  { time: 136.0, text: "Samyaro tviton getyvis" },
  { time: 137.5, text: "Azrebi Ambebi Bedi" },
  { time: 138.5, text: "Momavlis nostalgiebi" },
  { time: 140.0, text: "Ulevi Ulevi" },
  { time: 141.0, text: "Usasrulobidan wamosuli" },
  { time: 142.0, text: "Erevi Erevi" },
  { time: 143.0, text: "Everytime shen titqos emalebi" },
  { time: 146.5, text: "Acade Acade Acade" },
  { time: 148.5, text: "Samyaro tviton getyvis" },
  { time: 150.0, text: "Sadac ar unda iyo" },
  { time: 153.0, text: "Shenamde mosasvleli gza minda viyo" },
  { time: 156.0, text: "" },
  { time: 159.0, text: "Rasac ar unda fiqrobde" },
  { time: 162.0, text: "razec ar unda gelavde" },
  { time: 165.0, text: "Rasac ar unda fiqrobde" },
  { time: 168.0, text: "" },
  { time: 170.5, text: "Me sheni XSNA minda viyo" },
  { time: 183.5, text: "Me sheni XSNA minda viyo" },
  { time: 187.0, text: "" },
  { time: 195.0, text: "Me sheni XSNA minda viyo" },
  { time: 200.0, text: "" },
];

let currentLyricIndex = -1;
let glitch, finishedInput;

// ============================================================================
// INITIALIZATION AND SETUP
// ============================================================================
async function init() {
  loadRiveOverlay();

  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const pixelRatio = window.isMobile ? 0.2 : 1;
  renderer.setPixelRatio(0.6);
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(config.fog.start.color, config.fog.start.near, config.fog.start.far);
  
  AudioController.init({});
  
  simpleControls = new SimpleControls();
  simpleControls.init(
    () => togglePlayPause(),
    (seekTime) => {
      AudioController.seekTo(seekTime);
    }
  );
  simpleControls.hide();
  
  setupEventListeners();
  
  try {
    await loadAllResources();
    completeSetup();
  } catch (error) {
    console.error('Loading failed:', error);
  }
}

function setupEventListeners() {
  window.addEventListener('resize', onWindowResize);
  
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

// ============================================================================
// RIVE INTEGRATION
// ============================================================================
async function loadRiveOverlay() {
  rive = new Rive({
    src: 'animations/xsna.riv',
    canvas: rivecanvas,
    autoplay: true,
    autoBind: true,
    stateMachines: 'State Machine 1',
    layout: new Layout({
      fit: Fit.Layout,
    }),
    onLoad: () => {
      rive.resizeDrawingSurfaceToCanvas();
      const inputs = rive.stateMachineInputs('State Machine 1');

      const viewmodel = rive.viewModelInstance;
      loadingProgress = viewmodel.number('loadprogress');
      width = viewmodel.number('width');
      playingInput = viewmodel.boolean('playing');
      lyrics = viewmodel.string('lyrics');
      glitch = viewmodel.boolean('glitch');
      finishedInput = viewmodel.boolean('finished');
      
      stoppedInput = inputs.find(i => i.name === 'stopped');
      loadedInput = inputs.find(i => i.name === 'Loaded');
      
      if (playingInput) {
        setInterval(() => {
          if (playingInput.value && !isAnimating && isSetupComplete) {
            if (finishedInput) {
              finishedInput.value = false;
            }
            startAnimation();
            if (simpleControls) {
              setTimeout(() => {
                simpleControls.show();
              }, 2150);
            }
          } else if (!playingInput.value && isAnimating) {
            pauseAnimation();
          }
        }, 100);
      }
      
      rive.on(EventType.RiveEvent || 'spotifyevent', (event) => {
        if (event.data.name === 'spotify') {
          console.log('Spotify event received');
          window.location.assign('https://open.spotify.com/artist/5UZEQzbK7ktedLBHvZ2wkJ?si=heZI_ZZFRO6ms4xBZURn7A', '_blank');
        }
      });

      rive.on(EventType.RiveEvent || 'instaevent', (event) => {
        if (event.data.name === 'instagram') {
          console.log('Instagram event received');
          window.location.assign('https://www.instagram.com/avara.band?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==', '_top');
        }
      });

      if (width) {
        width.value = window.innerWidth; 
      }
      
      if (stoppedInput) {
        stoppedInput.value = !isAnimating;
      }
      
      if (loadedInput) {
        loadedInput.value = false;
      } else {
        console.warn('Loaded input not found in Rive state machine');
      }
    }
  });
}

// ============================================================================
// ANIMATION UPDATES
// ============================================================================
function updateGlitch(audioTime) {
  if (!glitch) return;
  const cycleTime = audioTime % 15;
  glitch.value = (cycleTime >= 0 && cycleTime < 2);
}

function updateLyrics(audioTime) {
  if (!lyrics || !lyricsData.length) return;
  
  let targetIndex = -1;
  for (let i = lyricsData.length - 1; i >= 0; i--) {
    if (audioTime >= lyricsData[i].time) {
      targetIndex = i;
      break;
    }
  }
  
  if (targetIndex !== currentLyricIndex) {
    currentLyricIndex = targetIndex;
    
    if (targetIndex >= 0) {
      lyrics.value = lyricsData[targetIndex].text;
    } else {
      lyrics.value = "";
    }
  }
}

function resetLyrics() {
  currentLyricIndex = -1;
  if (lyrics) {
    lyrics.value = "";
  }
}

function resetGlitch() {
  if (glitch) {
    glitch.value = false;
  }
}

// ============================================================================
// LOADING
// ============================================================================
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
        
        starNestMaterials = applyStarNestToModel(gltfModel, resources);

        gltfModel.traverse((child) => {
          if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            
            materials.forEach((mat, index) => {
              if (mat.name === 'metal_1') {
                const metallicMaterial = new THREE.MeshPhysicalMaterial({
                  metalness: 1.0,
                  roughness: 0.2,
                  envMap: resources.txthdr,
                  envMapIntensity: 0.5,
                });
                
                if (Array.isArray(child.material)) {
                  child.material[index] = metallicMaterial;
                } else {
                  child.material = metallicMaterial;
                }
                
                console.log('Replaced metal_01 with metallic physical material');
              }
            });
          }
        });
        
        const { position: p, scale: s, rotation: r } = config.glb;
        gltfModel.position.copy(p);
        gltfModel.scale.copy(s);
        gltfModel.rotation.copy(r);
        scene.add(gltfModel);
        
        setupHeadTracking();
        
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

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================
function togglePlayPause() {
  if (!isSetupComplete) {
    return;
  }
  
  if (isAnimating) {
    pauseAnimation();
  } else {
    startAnimation();
  }
  
  if (playingInput) {
    playingInput.value = isAnimating;
  }
  
  if (isAnimating && simpleControls) {
    simpleControls.show();
  }
}

function startAnimation() {
  if (isAnimating) {
    return;
  }
  
  const audioTime = AudioController.getCurrentTime();
  const audioDuration = AudioController.getAudioDuration();
  
  if (audioDuration > 0 && audioTime >= audioDuration - 0.1) {
    AudioController.reset();
    resetLyrics();
  }
  
  AudioController.startAudio();
  lastTime = null;
  isAnimating = true;
  
  if (stoppedInput) {
    stoppedInput.value = false;
  }
  
  if (simpleControls) {
    simpleControls.updatePlayButton(true);
  }

  window.dispatchEvent(new CustomEvent('animationStateChange', { detail: { isPlaying: true }}));

  
  animate(performance.now());
}

function pauseAnimation() {

console.log('Pausing animation');

glitch.value = true;

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
  
  if (simpleControls) {
    simpleControls.updatePlayButton(false);
  }
}

// ============================================================================
// SCENE SETUP
// ============================================================================
async function completeSetup() {
  if (isSetupComplete) return;
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Starting scene');

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
    position: new THREE.Vector3(0, 50, -50),
    rotation: new THREE.Euler(Math.PI / 2.1, 0, Math.PI / -2),
    colors: {
      cloudColor: '#000000',
      skyTopColor: '#151761', 
      skyBottomColor: '#000000'
    }
  });
  scene.add(skyPlane);

  cursorPlane.init(scene, camera);

  if (cursorPlane.plane) {
    cursorPlane.plane.layers.set(LAYERS.DOFIGNORE);
  }

  VegetationManager.createInitialVegetationWhenReady(scene);
  
  isSetupComplete = true;

  if (loadedInput) {
    loadedInput.value = true;
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
  // composer.addPass(chromaticAberrationPass);
  // composer.addPass(bloomPass); 
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

// ============================================================================
// ANIMATION HELPERS
// ============================================================================
function updateSwirlAnimation(audioTime) {
  if (!starNestMaterials || starNestMaterials.size === 0) return;
  
  const swirlProgress = stateMachine.getSwirlProgress(audioTime);
  
  if (swirlProgress < 0) {
    starNestMaterials.forEach(material => {
      if (material.userData?.uniforms) {
        material.userData.uniforms.swirlAmount.value = 2.5;
        material.userData.uniforms.swirlSpeed.value = 1.3;
      }
    });
  } else {
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
  const maxRotationY = Math.PI / 8;
  
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

function handleAnimationTransitions(audioTime, deltaTime) {
  if (!faceUpAnimation || !walkAnimation) return;
  
  const shouldBeInFaceUp = audioTime >= TIMING.character.walkToFaceUp.start;
  
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
        
        const animTime = (audioTime - TIMING.character.walkToFaceUp.start) * faceUpAnimation.timeScale;
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
      const transitionProgress = Math.min(
        (audioTime - transitionStartTime) / TIMING.character.walkToFaceUp.duration, 
        1.0
      );
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

// ============================================================================
// MAIN ANIMATION LOOP
// ============================================================================
function animate(time) {
  if (!isAnimating) return;
  animationId = requestAnimationFrame(animate);
  
  const deltaTime = lastTime !== null ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  
  if (deltaTime < 0.001) return;
  
  const audioTime = AudioController.getCurrentTime();
  
  updateLyrics(audioTime);
  updateGlitch(audioTime);
  
  stateMachine.update(audioTime);
  
  gltfMixer?.update(deltaTime);
  handleAnimationTransitions(audioTime, deltaTime);
  updateHeadLookAtOptimized(camera, deltaTime);
  cursorPlane.update(camera, deltaTime);
  
  // State-dependent updates
  if (stateMachine.isStarShaderActive()) {
    updateStarNestMaterials(starNestMaterials, deltaTime, mouseX, mouseY, audioTime);
  }
  
 if (stateMachine.isSkyShaderActive()) {
    updateCloudUniforms(skyPlane.material, audioTime * 0.03, window.innerWidth, window.innerHeight);
    
    // Update sky colors based on state
    if (skyPlane && skyPlane.material && skyPlane.material.uniforms) {
      let targetColors;
      
      // Determine target colors based on current state
      if (stateMachine.isInState('STAR_START')) {
        targetColors = TIMING.skyColors.starStart;
      } else if (stateMachine.isInState('MINIMAL')) {
        targetColors = TIMING.skyColors.starStart; // Keep star colors in MINIMAL
      } else if (stateMachine.isInState('IDLE')) {
        targetColors = TIMING.skyColors.idle;
      } else {
        // Default to idle colors for any other state
        targetColors = TIMING.skyColors.idle;
      }
      
      // Smooth color transition with increased speed for better responsiveness
      const lerpFactor = deltaTime * 0.5; // Increased from 0.1 for faster transitions
      
      skyPlane.material.uniforms.cloudColor.value.lerp(targetColors.cloudColor, lerpFactor);
      skyPlane.material.uniforms.skyTopColor.value.lerp(targetColors.skyTopColor, lerpFactor);
      skyPlane.material.uniforms.skyBottomColor.value.lerp(targetColors.skyBottomColor, lerpFactor);
    }
  }
  
  if (stateMachine.isVegetationActive()) {
    const vegetationCounts = VegetationManager.updateVegetation(scene, 0.5 * (deltaTime * 60));
    AudioController.update(deltaTime, vegetationCounts.trees);
  }
  
  if (stateMachine.isSwirlAnimActive()) {
    updateSwirlAnimation(audioTime);
  }
  
  // Camera animations using centralized timing
  if (stateMachine.isFirstCameraAnimActive()) {
    const { start, end, startPos, endPos, startRot, endRot, startFOV, endFOV } = TIMING.camera.first;
    const progress = Math.max(0, Math.min(1, (audioTime - start) / (end - start)));
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
    const { start, end, startPos, endPos, startRot, endRot, startFOV, endFOV } = TIMING.camera.second;
    const progress = Math.max(0, Math.min(1, (audioTime - start) / (end - start)));
    const easedProgress = progress * progress * (3 - 2 * progress);
    
    baseCameraPos.lerpVectors(startPos, endPos, easedProgress);
    baseCameraRot.x = THREE.MathUtils.lerp(startRot.x, endRot.x, easedProgress);
    baseCameraRot.y = THREE.MathUtils.lerp(startRot.y, endRot.y, easedProgress);
    baseCameraRot.z = THREE.MathUtils.lerp(startRot.z, endRot.z, easedProgress);
    
    camera.fov = THREE.MathUtils.lerp(startFOV, endFOV, easedProgress);
    camera.updateProjectionMatrix();
  } else {
    // Set static camera position based on state
    if (stateMachine.isInState('IDLE')) {
      baseCameraPos.copy(TIMING.camera.first.startPos);
      baseCameraRot.copy(TIMING.camera.first.startRot);
      camera.fov = TIMING.camera.first.startFOV;
      scene.fog.near = config.fog.start.near;
      scene.fog.far = config.fog.start.far;
      scene.fog.color.copy(fogStartColor);
    } else if (stateMachine.isInState('MINIMAL')) {
      baseCameraPos.copy(TIMING.camera.first.endPos);
      baseCameraRot.copy(TIMING.camera.first.endRot);
      camera.fov = TIMING.camera.first.endFOV;
      scene.fog.near = config.fog.end.near;
      scene.fog.far = config.fog.end.far;
      scene.fog.color.copy(fogEndColor);
    } else if (stateMachine.isInState('FINAL') && audioTime > TIMING.camera.second.end) {
      baseCameraPos.copy(TIMING.camera.second.endPos);
      baseCameraRot.copy(TIMING.camera.second.endRot);
      camera.fov = TIMING.camera.second.endFOV;
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
  
  // Check if song finished
  const audioDuration = AudioController.getAudioDuration();
  if (audioDuration > 0) {
    const isFinished = audioTime >= audioDuration - 0.1;
    
    if (isFinished && isAnimating) {
      isAnimating = false;

      if (finishedInput) {
        finishedInput.value = true;
      }
      
      if (playingInput) {
        playingInput.value = false;
      }

      resetLyrics();
      resetGlitch();
      
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      
      AudioController.reset();
      
      if (stoppedInput) {
        stoppedInput.value = true;
      }
      
      if (simpleControls) {
        simpleControls.updatePlayButton(false);
      }
      
      return;
    }
  }

  if (scene && camera) composer.render();
}

// ============================================================================
// RESIZE HANDLER
// ============================================================================
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

// ============================================================================
// INITIALIZATION
// ============================================================================
setTimeout(() => {
  init();
}, 1000);

// Exports
export { scene, gltfModel, gltfMixer, gltfAnimationActions };
// app.js - Simplified version with custom HTML controls alongside Rive
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
import SimpleControls from './simple-controls.js';



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
    
    this.swirlAnimation = {
      startDelay: 25,
      duration: 10,
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

// Simple mobile detection
window.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                  (window.innerWidth <= 768);

// Initialize state machine
const stateMachine = new AnimationStateMachine();

let simpleControls;
let depthBlurPass;
let rive;
let width;
let stoppedInput;
let loadedInput;
let loadingProgress; 
let playingInput; // Add playing boolean from Rive
let currentProgress = 0;
let progressInterval = null;
let starNestMaterials = new Map();
let lyrics;

// Globals
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass;
let isAnimating = false, animationId = null, lastTime = null, isSetupComplete = false;
let skyPlane, gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font;
let cursorPlane = new CursorPlane();
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
      near: 2,
      far: 10,
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
  // Default sky colors
  sky: {
    cloudColor: new THREE.Vector3(0, 0, 0),
    skyTopColor: new THREE.Vector3(0.002, 0.090, 0.480),
    skyBottomColor: new THREE.Vector3(0, 0, 0)
  },
  // Default star colors
  stars: {
    nebulaColor1: new THREE.Vector3(1.0, 0.2, 0.5),
    nebulaColor2: new THREE.Vector3(0.1, 0.5, 1.0),
    nebulaColor3: new THREE.Vector3(1.0, 0.6, 0.1)
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
  
let fogStartColor = new THREE.Color(0x000000);
let fogEndColor = new THREE.Color(0x000000);

// Resources to be loaded
const resources = {
  hdri: null,
  txthdr: null,
  font: null,
  glb: null,
  audio: null,
  vegetation: null
};

const lyricsData = [
  { time: 0, text: "hello world" }, // Start with empty
  { time: 2.5, text: "First line of lyrics here" },
  { time: 5.0, text: "Second line goes here" },
  { time: 8.2, text: "Another line of text" },
  { time: 12.0, text: "Next phrase or line" },
  { time: 15.5, text: "" }, // Clear between verses
  { time: 18.0, text: "New verse starts here" },
  { time: 22.0, text: "Continue with more lines" },
  { time: 26.5, text: "Add as many as needed" },
  { time: 30.0, text: "" }, // Clear again
  // Continue adding timing points...
  { time: 60.0, text: "Lyrics at 1 minute mark" },
  { time: 65.0, text: "More lyrics here" },
  { time: 70.0, text: "" },
  { time: 75.0, text: "Another section" },
  { time: 80.0, text: "Keep going" },
  { time: 85.0, text: "Final section starts" },
  { time: 90.0, text: "Almost done" },
  { time: 95.0, text: "Last line" },
  { time: 100.0, text: "" }, // Clear at end
];

let currentLyricIndex = -1;
let glitch, finishedInput;

async function init() {
  loadRiveOverlay();

  // Setup renderer first
  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const pixelRatio = window.isMobile ? 0.7 : 1;
  renderer.setPixelRatio(0.6);

  renderer.setSize(window.innerWidth, window.innerHeight);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(config.fog.start.color, config.fog.start.near, config.fog.start.far);
  
  // Initialize controllers
  AudioController.init({});
  
  // Initialize simple custom controls
  simpleControls = new SimpleControls();
  simpleControls.init(
    () => togglePlayPause(), // Play/pause callback
    (seekTime) => {          // Seek callback
      AudioController.seekTo(seekTime);
    }
  );
  simpleControls.hide(); // Hide until loaded
  
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
      
      
      // Watch for playing state changes from Rive
      if (playingInput) {
        // Poll for changes (Rive doesn't have native change listeners)
        setInterval(() => {
          if (playingInput.value && !isAnimating && isSetupComplete) {
            // Rive wants to play - reset finished state and start
            if (finishedInput) {
              finishedInput.value = false;
            }
            startAnimation();
            // Show controls when playing starts
            if (simpleControls) {
              setInterval(() => {
              simpleControls.show();
              }, 2150);
            }
          } else if (!playingInput.value && isAnimating) {
            // Rive says stop, but we're playing
            // Don't change finished state here - let pause/finish handlers set it
            pauseAnimation();
          }
        }, 100);
      }
      
      // Spotify event
      rive.on(EventType.RiveEvent || 'spotifyevent', (event) => {
        if (event.data.name === 'spotify') {
          console.log('Spotify event received');
          window.location.assign('https://open.spotify.com/artist/5UZEQzbK7ktedLBHvZ2wkJ?si=heZI_ZZFRO6ms4xBZURn7A', '_blank');
        }
      });

      // Instagram event
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


function updateGlitch(audioTime) {
  if (!glitch) return;
  
  // Every 15 seconds, turn on for 4 seconds
  const cycleTime = audioTime % 15; // Get position within 15-second cycle
  
  // Glitch is ON between 0-4 seconds of each cycle
  glitch.value = (cycleTime >= 0 && cycleTime < 4);
}


function updateLyrics(audioTime) {
  if (!lyrics || !lyricsData.length) return;
  
  // Find the appropriate lyric index for current time
  let targetIndex = -1;
  for (let i = lyricsData.length - 1; i >= 0; i--) {
    if (audioTime >= lyricsData[i].time) {
      targetIndex = i;
      break;
    }
  }
  
  // Only update if we've moved to a new lyric
  if (targetIndex !== currentLyricIndex) {
    currentLyricIndex = targetIndex;
    
    if (targetIndex >= 0) {
      lyrics.value = lyricsData[targetIndex].text;
      // Optional: log for debugging
      // console.log(`Lyrics updated at ${audioTime.toFixed(1)}s: "${lyricsData[targetIndex].text}"`);
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

function togglePlayPause() {
  if (!isSetupComplete) {
    return;
  }
  
  if (isAnimating) {
    pauseAnimation();
  } else {
    startAnimation();
  }
  
  // Update Rive playing boolean to match
  if (playingInput) {
    playingInput.value = isAnimating;
  }
  
  // Show controls when playing starts
  if (isAnimating && simpleControls) {
    simpleControls.show();
  }
}

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
  
  // Use default sky colors
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

  const material = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
  const plane = new THREE.PlaneGeometry(1000, 1000);
  const background = new THREE.Mesh(plane, material);
  background.position.set(0, 0, -200);
  // scene.add(background);

  cursorPlane.init(scene, camera);

  if (cursorPlane.plane) {
    cursorPlane.plane.layers.set(LAYERS.DOFIGNORE);
  }

  VegetationManager.createInitialVegetationWhenReady(scene);
  
  isSetupComplete = true;

  // Hide the loading screen in Rive
  if (loadedInput) {
    loadedInput.value = true;
  }
  
  // Don't show controls yet - wait for playing to be true
  // Controls will be shown when playing boolean becomes true in Rive
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
  

  updateLyrics(audioTime);


  updateGlitch(audioTime);


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
  
  // 5. Camera animations
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
  
  // Check if song finished
  const audioDuration = AudioController.getAudioDuration();
  if (audioDuration > 0) {
    const isFinished = audioTime >= audioDuration - 0.1;
    
    if (isFinished && isAnimating) {
      // Song just finished
      isAnimating = false;

      // Set finished to true
      if (finishedInput) {
        finishedInput.value = true;
      }
      
      // Set playing to false immediately when song finishes
      if (playingInput) {
        playingInput.value = false;
      }

      resetLyrics();
      resetGlitch();
      
      // Stop the animation loop
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      
      // Reset to beginning for next play
      AudioController.reset();
      
      // Update stopped state in Rive
      if (stoppedInput) {
        stoppedInput.value = true;
      }
      
      // Update controls
      if (simpleControls) {
        simpleControls.updatePlayButton(false);
      }
      
      return;
    }
  }

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
    resetLyrics();
  }
  
  AudioController.startAudio();
  lastTime = null;
  isAnimating = true;

  
  
  if (stoppedInput) {
    stoppedInput.value = false;
  }
  
  // Update controls
  if (simpleControls) {
    simpleControls.updatePlayButton(true);
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
  
  // Update controls
  if (simpleControls) {
    simpleControls.updatePlayButton(false);
  }
}

function resetGlitch() {
  if (glitch) {
    glitch.value = false;
  }
}

// Initialize after delay
setTimeout(() => {
  init();
}, 1000);

// Exports
export { scene, gltfModel, gltfMixer, gltfAnimationActions };
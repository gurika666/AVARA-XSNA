// app.js - Optimized main application
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
import * as AudioController from './audio-Controller.js';
import * as VegetationManager from './vegetation-manager.js';

// Globals
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass, displacementScenePass;
let isAnimating = false, animationId = null, lastTime = null, isSetupComplete = false;
let skyPlane, gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font, txthdr;
let cursorPlane = new CursorPlane();

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
    scale: new THREE.Vector3(10, 10, 10),
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

let resourcesLoaded = { hdri: false, font: false, displacement: false, glb: false, txthdr: false };

// Loading manager
const manager = new THREE.LoadingManager();
manager.onLoad = () => {
  completeSetup();
  VegetationManager.createInitialVegetationWhenReady(scene);
  setTimeout(() => GUI.enableControls(AudioController.getAudioDuration(), VegetationManager.getTreeCount()), 100);
};

// Initialize
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 30, 100);
  
  // Setup UI and controllers
  GUI.setupUI(startAnimation, pauseAnimation);
  GUI.setupScrubber(AudioController.handleScrubberInput, AudioController.handleScrubberChange);
  AudioController.init({ 
    onTimeUpdate: (t, dt) => displacementScenePass?.updateTextBasedOnAudioTime(t, dt, textAppearTimes),
    onScrubComplete: t => displacementScenePass?.resetTextDisplay(t, textAppearTimes)
  });
  VegetationManager.init(scene, manager);
  
  // Event listeners
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
  
  loadResources();
}

// Load resources
function loadResources() {
  // Load textures
  const txthdrLoader = new RGBELoader(manager);
  txthdrLoader.load('images/txt.hdr', t => {
    txthdr = t;
    txthdr.mapping = THREE.EquirectangularReflectionMapping;
    resourcesLoaded.txthdr = true;
  });
  
  const hdriLoader = new RGBELoader(manager);
  hdriLoader.load('images/01.hdr', t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    resourcesLoaded.hdri = true;
  });
  
  textureloader.load('images/displacement-map.png', t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    resourcesLoaded.displacement = true;
  });
  
  // Load font
  new FontLoader(manager).load('fonts/Monarch_Regular.json', f => {
    font = f;
    resourcesLoaded.font = true;
  });
  
  // Load GLB
  new GLTFLoader(manager).load(config.glb.path, gltf => {
    gltfModel = gltf.scene;
    
    // Apply txthdr to latex materials
    gltfModel.traverse(child => {
      if (child.isMesh && child.material?.name?.includes("latex_") && txthdr) {
        const mat = child.material.clone();
        mat.envMap = txthdr;
        mat.envMapIntensity = 1.0;
        mat.needsUpdate = true;
        child.material = mat;
      }
    });
    
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
        action.setLoop(THREE.LoopRepeat);
        action.timeScale = 0.7;
        gltfAnimationActions.push(action);
        if (config.glb.autoplay) action.play();
      });
    }
    
    resourcesLoaded.glb = true;
  });
  
  AudioController.loadAudio('audio/xsna.mp3');
}

// Complete setup
function completeSetup() {
  if (isSetupComplete) return;
  
  camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2, 0);
  if (AudioController.getAudioListener) camera.add(AudioController.getAudioListener());
  
  // Setup composer
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
  composer.addPass(displacementScenePass);
  
  // Chromatic aberration pass
  chromaticAberrationPass = new ChromaticAberrationPass(config.chromaticAberration.strength);
  chromaticAberrationPass.update(renderer, window.innerWidth, window.innerHeight);
  composer.addPass(bloomPass);
  
  // Lights
  scene.add(new THREE.DirectionalLight(0x111111, 5));
  
  spotlight = new THREE.SpotLight(0xff0000, 5);
  Object.assign(spotlight, { angle: Math.PI / 12, penumbra: 0.7, decay: 1, distance: 100 });
  spotlight.position.set(0, 2, 0);
  
  const spotlightTarget = new THREE.Object3D();
  spotlightTarget.position.set(0, 0, -100);
  scene.add(spotlightTarget);
  spotlight.target = spotlightTarget;
  scene.add(spotlight);
  
  // Sky plane
  skyPlane = createSkyPlane({
    width: 300, height: 300,
    position: new THREE.Vector3(0, 40, -50),
    rotation: new THREE.Euler(Math.PI / 2.1, 0, Math.PI / -2),
    colors: { cloudColor: '#000000', skyTopColor: '#151761', skyBottomColor: '#000000' }
  });
  scene.add(skyPlane);
  
  // Cursor plane
  cursorPlane.init(scene, camera);
  
  isSetupComplete = true;
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
  
  const audioTime = AudioController.getCurrentTime() * 0.03;
  updateCloudUniforms(skyPlane.material, audioTime, window.innerWidth, window.innerHeight);
  
  const vegetationCounts = VegetationManager.updateVegetation(scene, 0.5 * (deltaTime * 60));
  AudioController.update(deltaTime, vegetationCounts.trees);
  
  if (displacementScenePass) {
    displacementScenePass.update(renderer, time, AudioController.getCurrentTime(), 
      deltaTime, textAppearTimes, config.displacement.scale);
  }
  
  // Camera rotation
  const targetRotY = (mouseX / window.innerWidth) * 0.15;
  const targetRotX = (mouseY / window.innerHeight) * 0.15;
  camera.rotation.y += (targetRotY - camera.rotation.y) * 0.05;
  camera.rotation.x += (targetRotX - camera.rotation.x) * 0.05;
  camera.rotation.x = Math.max(-0.15, Math.min(0.15, camera.rotation.x));
  
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
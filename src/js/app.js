import * as THREE from "three";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as GUI from './gui.js';
import * as AudioController from './audio-Controller.js';
import * as VegetationManager from './vegetation-manager.js';
import { createSkyPlane, updateCloudUniforms } from './sky-material.js';
import { ChromaticAberrationPass } from './chromatic-aberration.js';
import { DisplacementScenePass } from './DisplacementScenePass.js';
import * as CursorPlane from './cursor-plane.js';

// Global variables
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass, displacementScenePass;
let isAnimating = false, animationId = null, lastTime = null, isSetupComplete = false;
let envMap, skyPlane, txthdr, gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, spotlightTarget, raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font, displacementTexture;

const textureloader = new THREE.TextureLoader();
const cameraBaseRotation = new THREE.Euler(0, 0, 0, 'YXZ');
const maxRotation = 0.15, rotationEasing = 0.05, moveSpeed = 0.5;

const config = {
  text: { size: 2, height: 0.1, depth: 1, z: -50 },
  bloom: { strength: 1, radius: 20, threshold: 0.4 },
  chromaticAberration: { strength: 0.1, audioResponsive: true },
  flashligh: { color: 0xff0000 },
  displacement: { scale: 0.5, audioResponsive: false, speed: 0.2 },
  camera: { fov: 40 },
  glb: {
    path: 'mesh/latex.glb',
    position: { x: 0, y: 0, z: -100 },
    scale: { x: 10, y: 10, z: 10 },
    rotation: { x: 0, y: 0, z: 0 },
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
  console.log('All resources loaded');
  completeSetup();
  VegetationManager.createInitialVegetationWhenReady(scene);
  setTimeout(enableControls, 100);
};

function initBasics() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  scene = new THREE.Scene();
  
  // Load txthdr
  const txthdrloader = new RGBELoader(manager);
  txthdrloader.load('images/txt.hdr', 
    texture => { txthdr = texture; txthdr.mapping = THREE.EquirectangularReflectionMapping; resourcesLoaded.txthdr = true; },
    undefined,
    error => { console.error('Error loading txthdr:', error); resourcesLoaded.txthdr = true; }
  );
  
  GUI.setupUI(startAnimation, pauseAnimation);
  AudioController.init({ onTimeUpdate: updateTimeBasedEvents, onScrubComplete: resetTextDisplay });
  VegetationManager.init(scene, manager);
  
  window.addEventListener('resize', onWindowResize);
}

function loadGLBModel() {
  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.load(config.glb.path,
    gltf => {
      gltfModel = gltf.scene;
      
      // Apply txthdr to latex materials
      gltfModel.traverse(child => {
        if (child.isMesh && child.material?.name?.includes("latex_")) {
          const updatedMaterial = child.material.clone();
          updatedMaterial.envMap = txthdr;
          updatedMaterial.envMapIntensity = 1.0;
          updatedMaterial.needsUpdate = true;
          child.material = updatedMaterial;
        }
      });
      
      const { position: p, scale: s, rotation: r } = config.glb;
      gltfModel.position.set(p.x, p.y, p.z);
      gltfModel.scale.set(s.x, s.y, s.z);
      gltfModel.rotation.set(r.x, r.y, r.z);
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
    },
    undefined,
    error => { console.error('Error loading GLB:', error); resourcesLoaded.glb = true; }
  );
}

function loadResources() {
  // Load displacement texture
  textureloader.load('images/displacement-map.png', 
    texture => { displacementTexture = texture; displacementTexture.wrapS = displacementTexture.wrapT = THREE.RepeatWrapping; resourcesLoaded.displacement = true; },
    undefined,
    error => { console.error('Error loading displacement:', error); resourcesLoaded.displacement = true; }
  );

  // Load HDRI
  const hdriLoader = new RGBELoader(manager);
  hdriLoader.load('images/01.hdr', texture => {
    envMap = texture; envMap.mapping = THREE.EquirectangularReflectionMapping; resourcesLoaded.hdri = true;
  });

  // Load font
  const fontLoader = new FontLoader(manager);
  fontLoader.load('fonts/Monarch_Regular.json',
    loadedFont => { font = loadedFont; resourcesLoaded.font = true; },
    undefined,
    error => { console.error('Error loading font:', error); resourcesLoaded.font = true; }
  );

  loadGLBModel();
  AudioController.loadAudio('audio/xsna.mp3');
}

function completeSetup() {
  if (isSetupComplete) return;
  
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 30, 100);

  camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2, 0);
  camera.rotation.copy(cameraBaseRotation);

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

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    config.bloom.strength, config.bloom.radius, config.bloom.threshold
  );

  displacementScenePass = new DisplacementScenePass(renderer, config.displacement.scale);
  displacementScenePass.initTextSupport(font);
  displacementScenePass.setTextConfig(config.text);
  displacementScenePass.setTextMoveSpeed(moveSpeed);
  displacementScenePass.setTextRemovalZ(5);
  composer.addPass(displacementScenePass);

  chromaticAberrationPass = new ChromaticAberrationPass(config.chromaticAberration.strength);
  chromaticAberrationPass.update(renderer, window.innerWidth, window.innerHeight);
  composer.addPass(bloomPass);

  scene.add(new THREE.DirectionalLight(0x111111, 5));

  spotlight = new THREE.SpotLight(config.flashligh.color, 5);
  Object.assign(spotlight, { angle: Math.PI / 12, penumbra: 0.7, decay: 1, distance: 100 });
  spotlight.position.set(0, 2, 0);

  spotlightTarget = new THREE.Object3D();
  spotlightTarget.position.set(0, 0, -100);
  scene.add(spotlightTarget);
  spotlight.target = spotlightTarget;
  scene.add(spotlight);

  CursorPlane.init(scene, camera);

  if (AudioController.getAudioListener) camera.add(AudioController.getAudioListener());

  skyPlane = createSkyPlane({
    width: 300, height: 300,
    position: new THREE.Vector3(0, 40, -50),
    rotation: new THREE.Euler(Math.PI / 2.1, 0, Math.PI / -2),
    colors: { cloudColor: '#000000', skyTopColor: '#151761', skyBottomColor: '#000000' }
  });
  scene.add(skyPlane);
  
  isSetupComplete = true;
}

function updateTimeBasedEvents(currentTime, deltaTime) {
  displacementScenePass?.updateTextBasedOnAudioTime(currentTime, deltaTime, textAppearTimes);
}

function resetTextDisplay(targetTime) {
  displacementScenePass?.resetTextDisplay(targetTime, textAppearTimes);
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

function enableControls() {
  const audioDuration = AudioController.getAudioDuration();
  const treeCount = VegetationManager.getTreeCount();
  GUI.enableControls(audioDuration, treeCount);
  GUI.setupScrubber(AudioController.handleScrubberInput, AudioController.handleScrubberChange);
}

function animate(time) {
  if (!isAnimating) return;
  animationId = requestAnimationFrame(animate);
  
  let deltaTime = 0;
  if (lastTime !== null) deltaTime = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  
  gltfMixer?.update(deltaTime);
  
  const audioTime = AudioController.getCurrentTime() * 0.03;
  updateCloudUniforms(skyPlane.material, audioTime, window.innerWidth, window.innerHeight);
  
  const deltaZ = moveSpeed * (deltaTime * 60);
  const vegetationCounts = VegetationManager.updateVegetation(scene, deltaZ);
  
  AudioController.update(deltaTime, vegetationCounts.trees);

  if (displacementScenePass) {
    displacementScenePass.update(renderer, time, AudioController.getCurrentTime(), 
      deltaTime, textAppearTimes, config.displacement.scale);
  }

  const targetRotationY = (mouseX / window.innerWidth) * maxRotation;
  const targetRotationX = (mouseY / window.innerHeight) * maxRotation;

  camera.rotation.y += (targetRotationY - camera.rotation.y) * rotationEasing;
  camera.rotation.x += (targetRotationX - camera.rotation.x) * rotationEasing;
  camera.rotation.x = Math.max(-maxRotation, Math.min(maxRotation, camera.rotation.x));
  camera.rotation.y = Math.max(-maxRotation, Math.min(maxRotation, camera.rotation.y));

  mouseNDC.x = (mouseX / window.innerWidth) * 2;
  mouseNDC.y = (mouseY / window.innerHeight) * -2;
  raycaster.setFromCamera(mouseNDC, camera);

  const targetPoint = new THREE.Vector3();
  raycaster.ray.at(50, targetPoint);
  spotlightTarget.position.copy(targetPoint);
  spotlight.position.copy(camera.position);
  
  CursorPlane.update(camera);

  if (scene && camera) composer.render();
}

function startAnimation() {
  GUI.updatePlaybackState(true);
  AudioController.startAudio();
  lastTime = null; isAnimating = true;
  animate(performance.now());
}

function pauseAnimation() {
  if (!isAnimating) return;
  AudioController.pauseAudio();
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  isAnimating = false;
  GUI.updatePlaybackState(false);
}

// GLB Animation Controls
const controlGLBAnimation = (method, index = 0) => {
  if (gltfAnimationActions?.[index]) {
    if (method === 'play') gltfAnimationActions[index].play();
    else if (method === 'pause') gltfAnimationActions[index].paused = true;
    else if (method === 'stop') gltfAnimationActions[index].stop();
  }
};

export const playGLBAnimation = (index = 0) => controlGLBAnimation('play', index);
export const pauseGLBAnimation = (index = 0) => controlGLBAnimation('pause', index);
export const stopGLBAnimation = (index = 0) => controlGLBAnimation('stop', index);
export const playAllGLBAnimations = () => gltfAnimationActions.forEach((_, i) => playGLBAnimation(i));
export const pauseAllGLBAnimations = () => gltfAnimationActions.forEach((_, i) => pauseGLBAnimation(i));
export const stopAllGLBAnimations = () => gltfAnimationActions.forEach((_, i) => stopGLBAnimation(i));

// Initialize
initBasics();
loadResources();

export { scene, resetTextDisplay, updateTimeBasedEvents, gltfModel, gltfMixer, gltfAnimationActions };
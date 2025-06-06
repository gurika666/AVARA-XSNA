import * as THREE from "three";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as GUI from './gui.js';
import * as AudioController from './audio-Controller.js';
import * as TreeManager from './tree-manager.js';
import * as GrassModule from './Grass.js';
import { createSkyPlane, updateCloudUniforms } from './sky-material.js';
import { ChromaticAberrationPass } from './chromatic-aberration.js';
import { DisplacementScenePass } from './DisplacementScenePass.js';
import * as CursorPlane from './cursor-plane.js';

// Global variables
let camera, scene, renderer, composer, bloomPass, chromaticAberrationPass;
let isAnimating = false, animationId = null, lastTime = null;
let envMap, skyPlane, txthdr, displacementScenePass;
let gltfMixer, gltfModel, gltfAnimationActions = [];
let spotlight, spotlightTarget, isSetupComplete = false;
let raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
let mouseX = 0, mouseY = 0, font, displacementTexture;


const textureloader = new THREE.TextureLoader();
const cameraBaseRotation = new THREE.Euler(0, 0, 0, 'YXZ');
const maxRotation = 0.15, rotationEasing = 0.05, moveSpeed = 0.5;
const fogColor = 0x000000, fogNear = 30, fogFar = 100;

const config = {
  text: { size: 2, height: 0.1, depth: 1, z: -50 },
  bloom: { strength: 1, radius: 20, threshold: 0.4 },
  chromaticAberration: { strength: 0.1, audioResponsive: true },
  flashligh: { color: 0xff0000 },
  displacement: { scale: 0.5, audioResponsive: false, speed: 0.2 },
  camera:{fov: 40},
  glb: {
    path: 'mesh/latex.glb',
    // position: { x: 0, y: 0, z: -80 },
    // scale: { x: 10, y: 10, z: 10 },
    // rotation: { x: 0, y: -1.5, z: 0 },
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
manager.onProgress = (url, loaded, total) => console.log(`Overall loading: ${Math.round((loaded / total) * 100)}%`);
manager.onLoad = () => {
  console.log('All resources loaded successfully');
  completeSetup();
  TreeManager.createInitialTrees(scene);
  setTimeout(enableControls, 100);
};
manager.onError = (url) => console.error('Error loading resource:', url);



function initBasics() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  scene = new THREE.Scene();

  // Load txthdr with proper resource tracking
  const txthdrloader = new RGBELoader(manager);
  txthdrloader.load('images/txt.hdr', 
    (texture) => {
      txthdr = texture;
      txthdr.mapping = THREE.EquirectangularReflectionMapping;
      resourcesLoaded.txthdr = true;
      console.log('txthdr texture loaded');
      checkAllResourcesLoaded();
    },
    (progress) => console.log('txthdr loading progress:', progress),
    (error) => {
      console.error('Error loading txthdr:', error);
      resourcesLoaded.txthdr = true; // Mark as complete even on error
      checkAllResourcesLoaded();
    }
  );
  
  GUI.setupUI(startAnimation, pauseAnimation);
  AudioController.init({ onTimeUpdate: updateTimeBasedEvents, onScrubComplete: resetTextDisplay });
  TreeManager.init(scene, manager);
  GrassModule.init(scene, manager);
  
  window.addEventListener('resize', () => {
    if (camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function loadGLBModel() {
  const gltfLoader = new GLTFLoader(manager);
  
  gltfLoader.load(
    config.glb.path,
    (gltf) => {
      console.log('GLB model loaded successfully');
      gltfModel = gltf.scene;
      
      // Store references to all latex materials for later processing
      let latexMeshes = [];
      
      // Find all meshes with "latex_" in their material names
      gltfModel.traverse((child) => {
        if (child.isMesh && child.material) {
          // Check if material name includes "latex_"
          if (child.material.name && child.material.name.includes("latex_")) {
            latexMeshes.push({
              mesh: child,
              originalMaterial: child.material,
              materialName: child.material.name
            });
            console.log('Found latex material:', child.material.name, 'on mesh:', child.name);
          }
        }
      });
      
      // Function to apply txthdr envMap to all latex materials
      const applyTxthdrToLatexMaterials = () => {
        if (latexMeshes.length > 0 && txthdr) {
          latexMeshes.forEach(({ mesh, originalMaterial, materialName }) => {
            // Create new material based on the original but with txthdr envMap
            const updatedMaterial = originalMaterial.clone();
            
            // Replace the envMap with txthdr
            updatedMaterial.envMap = txthdr;
            updatedMaterial.envMapIntensity = 1.0; // Adjust as needed
            
            // Ensure the material updates properly
            updatedMaterial.needsUpdate = true;
            
            // Apply the updated material to the mesh
            mesh.material = updatedMaterial;
            
            console.log(`Applied txthdr envMap to material: ${materialName}`);
          });
        }
      };
      
      // Apply materials immediately if txthdr is already loaded
      if (latexMeshes.length > 0) {
        if (txthdr) {
          // txthdr is already loaded, apply immediately
          applyTxthdrToLatexMaterials();
        } else {
          // txthdr not loaded yet, wait for it
          console.log('Waiting for txthdr to load before applying to latex materials');
          const checkTxthdr = setInterval(() => {
            if (txthdr) {
              clearInterval(checkTxthdr);
              applyTxthdrToLatexMaterials();
            }
          }, 100); // Check every 100ms
        }
      } else {
        console.warn('No materials with "latex_" found in the GLB model');
        // Log all material names for debugging
        gltfModel.traverse((child) => {
          if (child.isMesh && child.material) {
            console.log('Available material:', child.material.name || 'unnamed', 'on mesh:', child.name);
          }
        });
      }
      
      const { position: p, scale: s, rotation: r } = config.glb;
      gltfModel.position.set(p.x, p.y, p.z);
      gltfModel.scale.set(s.x, s.y, s.z);
      gltfModel.rotation.set(r.x, r.y, r.z);
      scene.add(gltfModel);
      
      // Handle animations (unchanged)
      if (gltf.animations?.length) {
        console.log(`Found ${gltf.animations.length} animations in GLB file`);
        gltfMixer = new THREE.AnimationMixer(gltfModel);
        
        gltf.animations.forEach((clip, index) => {
          console.log(`Animation ${index}: ${clip.name}, Duration: ${clip.duration}s`);
          const action = gltfMixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat);
          action.timeScale = 0.7;
          action.clampWhenFinished = false;
          gltfAnimationActions.push(action);
          
          if (config.glb.autoplay) {
            action.play();
            console.log(`Started animation: ${clip.name}`);
          }
        });
      }
      
      resourcesLoaded.glb = true;
      GUI.updateLoadingProgress('glb', 100);
      checkAllResourcesLoaded();
    },
    (progress) => GUI.updateLoadingProgress('glb', (progress.loaded / progress.total) * 100),
    (error) => {
      console.error('Error loading GLB model:', error);
      resourcesLoaded.glb = true;
      GUI.updateLoadingProgress('glb', 100);
      checkAllResourcesLoaded();
    }
  );
}

function loadResources() {
  // Load displacement texture
  textureloader.load('images/displacement-map.png', 
    (texture) => {
      displacementTexture = texture;
      displacementTexture.wrapS = displacementTexture.wrapT = THREE.RepeatWrapping;
      resourcesLoaded.displacement = true;
      GUI.updateLoadingProgress('displacement', 100);
      checkAllResourcesLoaded();
    },
    (xhr) => GUI.updateLoadingProgress('displacement', xhr.loaded / xhr.total * 100),
    (error) => {
      console.error('Error loading displacement texture:', error);
      resourcesLoaded.displacement = true;
      GUI.updateLoadingProgress('displacement', 100);
      checkAllResourcesLoaded();
    }
  );

  // Load HDRI environment map
  const hdriLoader = new RGBELoader(manager);
  hdriLoader.load('images/01.hdr', (texture) => {
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
    (xhr) => GUI.updateLoadingProgress('font', xhr.loaded / xhr.total * 100),
    (error) => {
      console.error('Error loading font:', error);
      resourcesLoaded.font = true;
      checkAllResourcesLoaded();
    }
  );

  loadGLBModel();
  AudioController.loadAudio('audio/xsna.mp3');
}

function checkAllResourcesLoaded() {
  const allLoaded = Object.values(resourcesLoaded).every(Boolean) && 
                    AudioController.isAudioLoaded() && TreeManager.isLoaded();
  
  console.log('Resource loading status:', { ...resourcesLoaded, 
    audio: AudioController.isAudioLoaded(), trees: TreeManager.isLoaded(), allLoaded, setupComplete: isSetupComplete });
  
  if (allLoaded && !isSetupComplete) {
    console.log("All resources loaded, setting up scene");
    manager.onLoad();
  }
}

function completeSetup() {
  if (isSetupComplete) {
    console.log('Setup already completed, skipping duplicate call');
    return;
  }
  
  console.log('Running completeSetup...');
  
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

  camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 2, 0);
  camera.rotation.set(cameraBaseRotation.x, cameraBaseRotation.y, cameraBaseRotation.z);

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('touchmove', onTouchMove, { passive: false });

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
  Object.assign(spotlight, {
    angle: Math.PI / 12, penumbra: 0.7, decay: 1, distance: 100, castShadow: false
  });
  spotlight.position.set(0, 2, 0);
  Object.assign(spotlight.shadow, {
    mapSize: { width: 1024, height: 1024 },
    camera: { near: 1, far: 200 }
  });

  spotlightTarget = new THREE.Object3D();
  spotlightTarget.position.set(0, 0, -100);
  scene.add(spotlightTarget);
  
  spotlight.target = spotlightTarget;
  scene.add(spotlight);

  CursorPlane.init(scene, camera);

  if (AudioController.getAudioListener) {
    camera.add(AudioController.getAudioListener());
  }

  skyPlane = createSkyPlane({
    width: 300, height: 300,
    position: new THREE.Vector3(0, 40, -50),
    rotation: new THREE.Euler(Math.PI / 2.1, 0, Math.PI / -2),
    colors: { cloudColor: '#000000', skyTopColor: '#151761', skyBottomColor: '#000000' }
  });
  scene.add(skyPlane);

  window.removeEventListener('resize', onWindowResize);
  window.addEventListener('resize', onWindowResize);
  
  isSetupComplete = true;
  console.log('Setup completed successfully');
}

function onMouseMove(event) {
  mouseX = event.clientX - window.innerWidth / 2;
  mouseY = event.clientY - window.innerHeight / 2;
}

function onTouchMove(event) {
  if (event.touches.length > 0) {
    event.preventDefault();
    mouseX = event.touches[0].clientX - window.innerWidth / 2;
    mouseY = event.touches[0].clientY - window.innerHeight / 2;
  }
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
  const treeCount = TreeManager.getTreeCount();
  
  GUI.enableControls(audioDuration, treeCount);
  GUI.setupScrubber(AudioController.handleScrubberInput, AudioController.handleScrubberChange);
}

// In your animate function, replace this section:

function animate(time) {
  if (!isAnimating) return;
  
  animationId = requestAnimationFrame(animate);
  
  let deltaTime = 0;
  if (lastTime !== null) {
    deltaTime = Math.min((time - lastTime) / 1000, 0.1);
  }
  lastTime = time;
  
  gltfMixer?.update(deltaTime);
  
  const audioTime = AudioController.getCurrentTime() * 0.03;
  updateCloudUniforms(skyPlane.material, audioTime, window.innerWidth, window.innerHeight);
  
  const deltaZ = moveSpeed * (deltaTime * 60);
  const updatedTreeCount = TreeManager.updateTrees(scene, deltaZ);
  
  GrassModule.updateGrass(scene, time);
  AudioController.update(deltaTime, updatedTreeCount);

  if (displacementScenePass) {
    displacementScenePass.update(renderer, time, AudioController.getCurrentTime(), 
      deltaTime, textAppearTimes, config.displacement.scale);
  }

  const targetRotationY = (mouseX / window.innerWidth) * maxRotation;
  // CHANGED: Removed the negative sign for Y rotation to uninvert it
  const targetRotationX = (mouseY / window.innerHeight) * maxRotation;

  camera.rotation.y += (targetRotationY - camera.rotation.y) * rotationEasing;
  camera.rotation.x += (targetRotationX - camera.rotation.x) * rotationEasing;

  camera.rotation.x = Math.max(-maxRotation, Math.min(maxRotation, camera.rotation.x));
  camera.rotation.y = Math.max(-maxRotation, Math.min(maxRotation, camera.rotation.y));

  // CHANGED: Updated mouseNDC calculation to match the camera rotation change
  mouseNDC.x = (mouseX / window.innerWidth) * 2;
  mouseNDC.y = (mouseY / window.innerHeight) * -2;  // Removed negative sign

  raycaster.setFromCamera(mouseNDC, camera);

  const targetPoint = new THREE.Vector3();
  raycaster.ray.at(50, targetPoint);

  spotlightTarget.position.copy(targetPoint);
  spotlight.position.copy(camera.position);
  
  CursorPlane.update(camera);

  // gltfModel.position.z += 0.1;

  if (scene && camera) composer.render();
}

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

// GLB Animation Control Functions
const controlGLBAnimation = (action, method, index = 0) => {
  if (gltfAnimationActions?.[index]) {
    if (method === 'play') gltfAnimationActions[index].play();
    else if (method === 'pause') gltfAnimationActions[index].paused = true;
    else if (method === 'stop') gltfAnimationActions[index].stop();
    console.log(`${method} GLB animation ${index}`);
  }
};

const playGLBAnimation = (index = 0) => controlGLBAnimation('play', 'play', index);
const pauseGLBAnimation = (index = 0) => controlGLBAnimation('pause', 'pause', index);
const stopGLBAnimation = (index = 0) => controlGLBAnimation('stop', 'stop', index);

const playAllGLBAnimations = () => gltfAnimationActions.forEach((action, i) => playGLBAnimation(i));
const pauseAllGLBAnimations = () => gltfAnimationActions.forEach((action, i) => pauseGLBAnimation(i));
const stopAllGLBAnimations = () => gltfAnimationActions.forEach((action, i) => stopGLBAnimation(i));

// Main Execution
initBasics();
loadResources();

// Exports
export {
  scene, resetTextDisplay, updateTimeBasedEvents,
  playGLBAnimation, pauseGLBAnimation, stopGLBAnimation,
  playAllGLBAnimations, pauseAllGLBAnimations, stopAllGLBAnimations,
  gltfModel, gltfMixer, gltfAnimationActions
};
// Import dependencies
// Note: These imports work with module bundlers like Webpack, Rollup, or Vite
import * as THREE from 'three';
import { WiggleBone } from "wiggle";
import { WiggleRigHelper } from "wiggle/helper";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { LoadingManager } from 'three';

// Global variables 
let scene, camera, renderer;
let manager = new LoadingManager();
let meshloader = new GLTFLoader(manager);
let nika;
let wiggleBones = [];
let rootBone; // Reference to the root bone for hand control

// Configuration constants - with simplified parameters
const CONFIG = {
  scaleFactorX: 75,    // Scale for X axis
  scaleFactorY: 75,    // Scale for Y axis
  flipX: true,         // Mirror the hand horizontally
  flipY: true,         // Flip the hand vertically
  offsetX: 0,          // Horizontal position offset
  offsetY: 0,          // Vertical position offset
  dampFactor: 0.3,     // Lower value = more dampening (0-1)
  fingerThreshold: 0.15, // Threshold for finger tracking (0-1)
  smoothing: {
    enabled: true,      // Enable position smoothing
    historySize: 10,    // Number of frames to keep in history
    positionWeight: 0.8, // Weight for position smoothing (0-1)
    velocityWeight: 0.2  // Weight for velocity prediction (0-1)
  },
  resetSpeed: 0.1      // Speed at which bones return to origin (0-1)
};

// DOM elements setup
const videoElement = document.createElement('video');
videoElement.setAttribute('playsinline', '');
videoElement.style.transform = 'scaleX(-1)';
videoElement.style.position = 'absolute';
videoElement.style.width = '320px';
videoElement.style.height = '240px';
videoElement.style.top = '0';
videoElement.style.left = '0';
videoElement.style.opacity = '0.7';
videoElement.style.zIndex = '9';
document.body.appendChild(videoElement);

// Debug info for coordinate mapping
const debugInfo = document.createElement('div');
debugInfo.style.position = 'absolute';
debugInfo.style.top = '10px';
debugInfo.style.left = '10px';
debugInfo.style.color = 'white';
debugInfo.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
debugInfo.style.padding = '10px';
debugInfo.style.fontFamily = 'Arial, sans-serif';
debugInfo.style.zIndex = '10';
debugInfo.innerHTML = 'Hand Tracking: Simplified Version';
document.body.appendChild(debugInfo);


// SHAPE KEY VARIABLES
let animSpeed = 0.005;
let meshWithShapeKeys = null;
let devilShapeKeyIndex = -1;
let isDevilAnimating = false;
let devilTargetValue = 0; // Target value for the devil shape key
let movementTracker = {
  lastPosition: { x: 0, y: 0, z: 0 },
  totalMovement: 0,
  threshold:
  20, // Amount of movement needed to trigger the devil shape key
  resetTimer: null,
  cooldownPeriod: 1000 // ms before resetting movement counter
};
let isTrackingMovement = true; // Whether to track movement for triggering shape key
let hasTriggeredDevil = false; // Whether devil mode has already been triggered


// Load the Nika model first
manager.onLoad = function() {
  initializeScene();
}

meshloader.load('mesh/Nika_01.glb', (glb) => {
  nika = glb.scene;

  // Find meshes with morph targets (shape keys)
  nika.traverse((object) => {
    if (object.isMesh && object.morphTargetInfluences && object.morphTargetInfluences.length > 0) {
      console.log('Found mesh with shape keys:', object.name);
      console.log('Number of shape keys:', object.morphTargetInfluences.length);
      console.log('Shape key names:', object.morphTargetDictionary);
      
      // Store reference to this mesh
      meshWithShapeKeys = object;
      
      // Find the "devil" shape key index
      if (object.morphTargetDictionary && 'devil' in object.morphTargetDictionary) {
        devilShapeKeyIndex = object.morphTargetDictionary['devil'];
        console.log('Found devil shape key at index:', devilShapeKeyIndex);
      } else {
        // If the dictionary is not available or the shape key is not named,
        // you might need to check each morph target by index
        for (let i = 0; i < object.morphTargetInfluences.length; i++) {
          // You might need a different way to identify the shape key if not by name
          console.log(`Shape key ${i} initial value: ${object.morphTargetInfluences[i]}`);
        }
      }
    }
  });
});

// Key finger landmarks for simplified tracking
// We'll only focus on key landmarks instead of all 21 points
const KEY_LANDMARKS = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20
};

// Arrays to store the visualization objects for key landmarks
const fingerMarkers = {};

// Main function to set up the scene and add Nika
function initializeScene() {
  // Initialize Three.js components
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x444444);

  const gridHelper = new THREE.GridHelper(100, 10);
  scene.add(gridHelper);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 50;
  camera.position.y = 10;
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  // Add lights to the scene
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(0, 1, 1);
  scene.add(directionalLight);
  
  // Add Nika model to the scene if it's loaded
  if (nika) {
    // Position and scale Nika as needed
    nika.position.set(0, -10, 0);
    nika.scale.set(20, 20, 20);
    scene.add(nika);
    console.log("Nika added to the scene");
    
    // WIGGLEBONES SETUP
    if (nika.children[0]?.children[0]?.skeleton) {
      const helper = new WiggleRigHelper({
        skeleton: nika.children[0].children[0].skeleton,
        dotSize: 0.2,
        lineWidth: 0.02,
      });
      scene.add(helper);

      // Get reference to the root bone for hand control
      rootBone = nika.children[0].children[0].skeleton.bones[0];
      const b1 = nika.children[0].children[0].skeleton.bones[1];
      const b2 = nika.children[0].children[0].skeleton.bones[2];
      
      wiggleBones.push(new WiggleBone(b1, { stiffness: 700, damping: 28 }));
      wiggleBones.push(new WiggleBone(b2, { stiffness: 700, damping: 28 }));
    } else {
      console.warn("Skeleton not found in Nika model");
    }
  } else {
    console.warn("Nika model not loaded yet");
  }

  // Create simple visual markers for key finger landmarks
  Object.values(KEY_LANDMARKS).forEach(index => {
    const marker = createFingerMarker(index);
    fingerMarkers[index] = marker;
  });

  // Initialize MediaPipe Hands with simplified settings
  setupHandTracking();
  
  // Start animation loop
  animate();
}

// Create simplified visual markers for fingers
function createFingerMarker(index) {
  // Use different colors for different landmarks for easier identification
  let color;
  let size = 1.2;
  
  switch(index) {
    case KEY_LANDMARKS.WRIST:
      color = 0xffff00; // Yellow for wrist
      size = 1.5;
      break;
    case KEY_LANDMARKS.THUMB_TIP:
      color = 0xff0000; // Red for thumb
      break;
    case KEY_LANDMARKS.INDEX_TIP:
      color = 0x00ff00; // Green for index
      break;
    case KEY_LANDMARKS.MIDDLE_TIP:
      color = 0x0000ff; // Blue for middle
      break;
    case KEY_LANDMARKS.RING_TIP:
      color = 0xff00ff; // Magenta for ring
      break;
    case KEY_LANDMARKS.PINKY_TIP:
      color = 0x00ffff; // Cyan for pinky
      break;
    default:
      color = 0xffffff; // White for others
  }
  
  const sphereGeometry = new THREE.SphereGeometry(size, 16, 16);
  const sphereMaterial = new THREE.MeshStandardMaterial({ 
    color: color,
    emissive: new THREE.Color(color).multiplyScalar(0.3),
    roughness: 0.3,
    metalness: 0.5,
    opacity: 0.7,
    transparent: true
  });
  
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.visible = false;
  scene.add(sphere);
  return sphere;
}

// Simplified coordinate mapping function with smoothing
function mapCoordinates(landmark) {
  // Calculate the mapped coordinates with flipping options
  const x = (CONFIG.flipX ? -1 : 1) * (landmark.x - 0.5) * CONFIG.scaleFactorX + CONFIG.offsetX;
  const y = (CONFIG.flipY ? -1 : 1) * (landmark.y - 0.5) * CONFIG.scaleFactorY + CONFIG.offsetY;
  // We're ignoring Z/depth as requested
  return { x, y, z: 0 };
}

// Simplified finger gesture detection
function detectFingerGesture(landmarks) {
  // Get positions of the tips
  const thumbTip = landmarks[KEY_LANDMARKS.THUMB_TIP];
  const indexTip = landmarks[KEY_LANDMARKS.INDEX_TIP];
  
  // Calculate distance between thumb and index finger
  const distance = Math.sqrt(
    Math.pow(thumbTip.x - indexTip.x, 2) + 
    Math.pow(thumbTip.y - indexTip.y, 2) + 
    Math.pow(thumbTip.z - indexTip.z, 2)
  );
  
  // Simple pinch detection - just check thumb to index distance
  // This is more reliable than checking all fingers
  return {
    isPinching: distance < CONFIG.fingerThreshold
  };
}

// Setup MediaPipe hand tracking with improved smoothing
function setupHandTracking() {
  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
  });

  hands.setOptions({
    maxNumHands: 1,          // Only track one hand
    modelComplexity: 0,      // Use simpler model for better performance
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  // Simplified error handling
  hands.onError = (error) => {
    console.error('MediaPipe Hands error:', error);
    debugInfo.innerHTML = `Error: ${error}`;
  };

  // ===== Advanced Smoothing System =====
  // Create position history for each key landmark to enable smoothing
  const positionHistory = {};
  
  // Initialize history for each landmark
  Object.values(KEY_LANDMARKS).forEach(index => {
    positionHistory[index] = {
      positions: Array(CONFIG.smoothing.historySize).fill().map(() => ({ x: 0, y: 0, z: 0 })),
      lastVelocity: { x: 0, y: 0, z: 0 },
      isInitialized: false
    };
  });
  
  // Apply one-euro filter smoothing to coordinates
  function smoothPosition(landmarkIndex, newPosition) {
    const history = positionHistory[landmarkIndex];
    
    // If smoothing is disabled, just return the raw position
    if (!CONFIG.smoothing.enabled) {
      return newPosition;
    }
    
    // If this is the first valid position, initialize the history
    if (!history.isInitialized) {
      history.positions.fill(newPosition);
      history.lastVelocity = { x: 0, y: 0, z: 0 };
      history.isInitialized = true;
      return newPosition;
    }
    
    // Calculate current velocity
    const lastPos = history.positions[0];
    const velocity = {
      x: newPosition.x - lastPos.x,
      y: newPosition.y - lastPos.y,
      z: newPosition.z - lastPos.z
    };
    
    // Apply velocity smoothing
    const smoothedVelocity = {
      x: history.lastVelocity.x * (1 - CONFIG.smoothing.velocityWeight) + velocity.x * CONFIG.smoothing.velocityWeight,
      y: history.lastVelocity.y * (1 - CONFIG.smoothing.velocityWeight) + velocity.y * CONFIG.smoothing.velocityWeight,
      z: history.lastVelocity.z * (1 - CONFIG.smoothing.velocityWeight) + velocity.z * CONFIG.smoothing.velocityWeight
    };
    
    // Predict position using smoothed velocity
    const predictedPosition = {
      x: lastPos.x + smoothedVelocity.x,
      y: lastPos.y + smoothedVelocity.y,
      z: lastPos.z + smoothedVelocity.z
    };
    
    // Blend between the predicted position and the new position based on weights
    const smoothedPosition = {
      x: predictedPosition.x * CONFIG.smoothing.velocityWeight + newPosition.x * CONFIG.smoothing.positionWeight,
      y: predictedPosition.y * CONFIG.smoothing.velocityWeight + newPosition.y * CONFIG.smoothing.positionWeight,
      z: predictedPosition.z * CONFIG.smoothing.velocityWeight + newPosition.z * CONFIG.smoothing.positionWeight
    };
    
    // Update history
    history.positions.pop(); // Remove oldest
    history.positions.unshift(smoothedPosition); // Add new at beginning
    history.lastVelocity = smoothedVelocity;
    
    return smoothedPosition;
  }
  
  // Process hand tracking results
  hands.onResults(results => {
    // Hide all markers initially
    Object.values(fingerMarkers).forEach(marker => {
      marker.visible = false;
    });
    
    // Update when hand is detected
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0]; // Just use the first hand
      const handedness = results.multiHandedness[0].label; // "Left" or "Right"
      
      // Detect gestures
      const gesture = detectFingerGesture(landmarks);
      
      // Update debug info with simplified data
      debugInfo.innerHTML = `
        Hand Detected (${handedness})<br>
        Pinching: ${gesture.isPinching ? 'YES' : 'NO'}<br>
        Smoothing: ${CONFIG.smoothing.enabled ? 'ON' : 'OFF'}<br>
        Position Weight: ${CONFIG.smoothing.positionWeight.toFixed(2)}<br>
        Velocity Weight: ${CONFIG.smoothing.velocityWeight.toFixed(2)}
      `;
      
      // Update only the key landmarks with smoothing
      Object.entries(KEY_LANDMARKS).forEach(([name, index]) => {
        const landmark = landmarks[index];
        const rawMappedCoords = mapCoordinates(landmark);
        
        // Apply advanced smoothing to the position
        const smoothedCoords = smoothPosition(index, rawMappedCoords);
        
        // Update marker position
        const marker = fingerMarkers[index];
        marker.position.x = smoothedCoords.x;
        marker.position.y = smoothedCoords.y;
        marker.position.z = smoothedCoords.z;
        marker.visible = true;
      });
      
      // Move the root bone when pinching (with improved smoothing)
      if (rootBone && gesture.isPinching) {
        // Get smoothed thumb position
        const thumbPos = positionHistory[KEY_LANDMARKS.THUMB_TIP].positions[0];
        
        // Apply additional dampening for even smoother movement
        rootBone.position.x += (thumbPos.x * 0.05 - rootBone.position.x) * CONFIG.dampFactor;
        rootBone.position.y += (thumbPos.y * 0.05 - rootBone.position.y) * CONFIG.dampFactor;
        
        // Update debug to show controlled status
        debugInfo.innerHTML += `<br><span style="color: #00ff00;">Controlling bone ✓</span>`;
      } else if (rootBone) {
        // Reset bone position when not pinching or tracking is lost
        // Gradually return to origin for smooth transition
        rootBone.position.x += (0 - rootBone.position.x) * CONFIG.resetSpeed;
        rootBone.position.y += (0 - rootBone.position.y) * CONFIG.resetSpeed;
        
        // If very close to zero, just set to exactly zero
        if (Math.abs(rootBone.position.x) < 0.01) rootBone.position.x = 0;
        if (Math.abs(rootBone.position.y) < 0.01) rootBone.position.y = 0;
        
        // Update debug to show reset status
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          debugInfo.innerHTML += `<br><span style="color: #ffaa00;">Not pinching - resetting position</span>`;
        } else {
          debugInfo.innerHTML += `<br><span style="color: #ff0000;">Tracking lost - resetting position</span>`;
        }
      }
    } else {
      debugInfo.innerHTML = 'No hands detected';
      
      // Reset bone position when tracking is completely lost
      if (rootBone) {
        // Gradually return to origin for smooth transition
        rootBone.position.x += (0 - rootBone.position.x) * CONFIG.resetSpeed;
        rootBone.position.y += (0 - rootBone.position.y) * CONFIG.resetSpeed;
        
        // If very close to zero, just set to exactly zero
        if (Math.abs(rootBone.position.x) < 0.01) rootBone.position.x = 0;
        if (Math.abs(rootBone.position.y) < 0.01) rootBone.position.y = 0;
      }
    }
  });

  // Setup camera for hand tracking
  const camera_utils = new Camera(videoElement, {
    onFrame: async () => {
      await hands.send({image: videoElement});
    },
    width: 640,  // Reduced resolution for better performance
    height: 480
  });

  // Start camera
  camera_utils.start()
    .then(() => {
      console.log('Camera started successfully');
    })
    .catch(err => {
      console.error('Error starting camera: ', err);
      debugInfo.innerHTML = `Camera error: ${err.message}`;
    });

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Enhanced keyboard controls with smoothing options
  window.addEventListener('keydown', (event) => {
    switch(event.key) {
      // Scale adjustments
      case '1': CONFIG.scaleFactorX = Math.max(10, CONFIG.scaleFactorX - 5); break;
      case '2': CONFIG.scaleFactorX = CONFIG.scaleFactorX + 5; break;
      case '3': CONFIG.scaleFactorY = Math.max(10, CONFIG.scaleFactorY - 5); break;
      case '4': CONFIG.scaleFactorY = CONFIG.scaleFactorY + 5; break;
      
      // Dampening adjustment
      case 's': CONFIG.dampFactor = Math.max(0.1, CONFIG.dampFactor - 0.05); break;
      case 'd': CONFIG.dampFactor = Math.min(0.9, CONFIG.dampFactor + 0.05); break;
      
      // Threshold adjustment
      case 't': CONFIG.fingerThreshold = Math.max(0.05, CONFIG.fingerThreshold - 0.01); break;
      case 'g': CONFIG.fingerThreshold = Math.min(0.2, CONFIG.fingerThreshold + 0.01); break;
      
      // Smoothing adjustments
      case 'm': CONFIG.smoothing.enabled = !CONFIG.smoothing.enabled; break; // Toggle smoothing
      case 'p': CONFIG.smoothing.positionWeight = Math.max(0.1, Math.min(0.9, CONFIG.smoothing.positionWeight + 0.05)); break; // Increase position weight
      case 'o': CONFIG.smoothing.positionWeight = Math.max(0.1, Math.min(0.9, CONFIG.smoothing.positionWeight - 0.05)); break; // Decrease position weight
      case 'v': CONFIG.smoothing.velocityWeight = Math.max(0.1, Math.min(0.5, CONFIG.smoothing.velocityWeight + 0.05)); break; // Increase velocity weight
      case 'c': CONFIG.smoothing.velocityWeight = Math.max(0.0, Math.min(0.5, CONFIG.smoothing.velocityWeight - 0.05)); break; // Decrease velocity weight
      case 'h': CONFIG.smoothing.historySize = Math.max(2, CONFIG.smoothing.historySize - 1); break; // Decrease history size
      case 'j': CONFIG.smoothing.historySize = Math.min(20, CONFIG.smoothing.historySize + 1); break; // Increase history size
      
      // Reset speed adjustment
      case 'f': CONFIG.resetSpeed = Math.max(0.01, CONFIG.resetSpeed - 0.01); break; // Slower reset
      case 'g': CONFIG.resetSpeed = Math.min(0.3, CONFIG.resetSpeed + 0.01); break; // Faster reset
      
      // Offset adjustments
      case 'ArrowLeft': CONFIG.offsetX -= 5; break;
      case 'ArrowRight': CONFIG.offsetX += 5; break;
      case 'ArrowUp': CONFIG.offsetY += 5; break;
      case 'ArrowDown': CONFIG.offsetY -= 5; break;
      
      // Toggle flipping
      case 'x': CONFIG.flipX = !CONFIG.flipX; break;
      case 'y': CONFIG.flipY = !CONFIG.flipY; break;
      
      // Reset to defaults
      case 'r': 
        CONFIG.smoothing.enabled = true;
        CONFIG.smoothing.historySize = 10;
        CONFIG.smoothing.positionWeight = 0.8;
        CONFIG.smoothing.velocityWeight = 0.2;
        CONFIG.dampFactor = 0.3;
        CONFIG.resetSpeed = 0.1;
        break;

        // Toggle devil shape key animation
    case 'l':
      if (meshWithShapeKeys && devilShapeKeyIndex >= 0) {
        isDevilAnimating = true;
        devilTargetValue = meshWithShapeKeys.morphTargetInfluences[devilShapeKeyIndex] > 0.5 ? 0 : 1;
        debugInfo.innerHTML += `<br><span style="color: #ff0000;">Devil mode: ${devilTargetValue > 0.5 ? 'ON' : 'OFF'}</span>`;
      } else {
        debugInfo.innerHTML += `<br><span style="color: #ff0000;">Devil shape key not found!</span>`;
      }
      break;
  
    }
    
    // Update debug display with current settings
    debugInfo.innerHTML = `
      Scale X: ${CONFIG.scaleFactorX.toFixed(1)}, Y: ${CONFIG.scaleFactorY.toFixed(1)}<br>
      Dampening: ${CONFIG.dampFactor.toFixed(2)}<br>
      Threshold: ${CONFIG.fingerThreshold.toFixed(2)}<br>
      Reset Speed: ${CONFIG.resetSpeed.toFixed(2)}<br>
      Smoothing: ${CONFIG.smoothing.enabled ? 'ON' : 'OFF'}<br>
      - Position Weight: ${CONFIG.smoothing.positionWeight.toFixed(2)}<br>
      - Velocity Weight: ${CONFIG.smoothing.velocityWeight.toFixed(2)}<br>
      - History Size: ${CONFIG.smoothing.historySize}<br>
      Offset: (${CONFIG.offsetX},${CONFIG.offsetY})<br>
      Flip: X=${CONFIG.flipX}, Y=${CONFIG.flipY}<br>
      <span style="color: #aaffaa;">Press 'r' to reset all settings</span>
    `;
  });
  
  // Export for external access if needed
  window.handTrackingConfig = CONFIG;
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Update wiggle bones
  wiggleBones.forEach((wb) => wb.update());

 // Track movement of the root bone if tracking is enabled
 if (rootBone && isTrackingMovement) {
  const currentPos = {
    x: rootBone.position.x,
    y: rootBone.position.y,
    z: rootBone.position.z
  };
  
  // Calculate movement delta since last frame
  const movementDelta = Math.sqrt(
    Math.pow(currentPos.x - movementTracker.lastPosition.x, 2) +
    Math.pow(currentPos.y - movementTracker.lastPosition.y, 2) +
    Math.pow(currentPos.z - movementTracker.lastPosition.z, 2)
  );
  
  // Add to total movement
  movementTracker.totalMovement += movementDelta;
  
  // Update last position
  movementTracker.lastPosition = { ...currentPos };
  
  // Check if we've moved enough to trigger the shape key
  if (movementTracker.totalMovement > movementTracker.threshold && !isDevilAnimating && !hasTriggeredDevil) {
    // Trigger the devil shape key
    if (meshWithShapeKeys && devilShapeKeyIndex >= 0) {
      isDevilAnimating = true;
      devilTargetValue = 1; // Activate devil mode
      console.log("Movement triggered devil mode!");
      
      // Stop tracking movement after triggering
      hasTriggeredDevil = true;
      
      // Reset movement counter
      movementTracker.totalMovement = 0;
    }
  }
  
  // Add movement amount to debug display
  if (debugInfo.innerHTML.indexOf('Movement:') === -1) {
    debugInfo.innerHTML += `<br>Movement: ${movementTracker.totalMovement.toFixed(1)} / ${movementTracker.threshold}`;
  } else {
    const movementText = `Movement: ${movementTracker.totalMovement.toFixed(1)} / ${movementTracker.threshold}`;
    debugInfo.innerHTML = debugInfo.innerHTML.replace(/Movement: [^<]+/, movementText);
  }
}

// Animate devil shape key if active
if (isDevilAnimating && meshWithShapeKeys && devilShapeKeyIndex >= 0) {
  // Get current value
  const currentValue = meshWithShapeKeys.morphTargetInfluences[devilShapeKeyIndex];
  
  // Smoothly animate toward target value
  if (Math.abs(currentValue - devilTargetValue) > 0.01) {
    // Update value
    if (currentValue < devilTargetValue) {
      meshWithShapeKeys.morphTargetInfluences[devilShapeKeyIndex] += animSpeed;
    } else {
      meshWithShapeKeys.morphTargetInfluences[devilShapeKeyIndex] -= animSpeed;
    }
  } else {
    // Set exact target value when we're close enough
    meshWithShapeKeys.morphTargetInfluences[devilShapeKeyIndex] = devilTargetValue;
    isDevilAnimating = false;
    
    // If we've reached the devil state (value = 1), stop tracking movement
    if (devilTargetValue >= 0.99) {
      isTrackingMovement = false;
      console.log("Devil mode activated, stopping movement tracking");
      // Remove the movement tracking from debug display
      debugInfo.innerHTML = debugInfo.innerHTML.replace(/<br>Movement: [^<]+/, '');
      debugInfo.innerHTML += `<br><span style="color: #ff0000;">Devil mode permanent</span>`;
    }
  }
}

renderer.render(scene, camera);
}

// Export functions if needed for external access
export { scene, camera, renderer };
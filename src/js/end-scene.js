// end-scene.js - Responsive Three.js scene with improved VHS collection logic
import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

class EndScene {
  constructor(hdriTexture = null, onVersionSelect = null, versionManager = null) {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.canvas = null;
    this.isActive = false;
    this.animationId = null;
    this.hdriTexture = hdriTexture;
    this.onVersionSelect = onVersionSelect;
    this.versionManager = versionManager;
    
    // VHS objects
    this.vhsObjects = {};
    this.vhsGroup = null;
    
    // Hover tracking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredObject = null;
    this.hoverStates = new Map();
    
    // Responsive settings
    this.baseSpacing = 7; // Base spacing for desktop
    this.baseScale = 2; // Base scale for desktop
    this.baseCameraZ = 12; // Base camera distance for desktop
    
    // DEBUG MODE - Set to false for production
    this.debugMode = false;
  }

  async init() {
    // Create a new canvas for the end scene
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'end-scene-canvas';
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 10;
      pointer-events: none;
      opacity: 1;
      transition: opacity 1s ease-in-out;
    `;
    document.body.appendChild(this.canvas);

    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas, 
      alpha: true,
      antialias: true 
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    // Setup scene
    this.scene = new THREE.Scene();
    
    // Apply HDRI to scene environment
    if (this.hdriTexture) {
      this.scene.environment = this.hdriTexture;
    }

    // Setup camera with responsive FOV
    const fov = this.getResponsiveFOV();
    this.camera = new THREE.PerspectiveCamera(
      fov,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.updateCameraPosition();

    // Create a group to hold all VHS objects
    this.vhsGroup = new THREE.Group();
    this.scene.add(this.vhsGroup);

    // Load VHS objects
    await this.loadVHSObjects();

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7.5);
    this.scene.add(light);

    // Add event listeners
    window.addEventListener('mousemove', (event) => this.onMouseMove(event));
    window.addEventListener('click', (event) => this.onMouseClick(event));
    window.addEventListener('resize', () => this.onWindowResize());
  }

  getResponsiveFOV() {
    const width = window.innerWidth;
    // Increase FOV on smaller screens to fit content better
    if (width < 480) return 90;
    if (width < 768) return 85;
    if (width < 1024) return 80;
    return 75;
  }

  getResponsiveScale() {
    const width = window.innerWidth;
    // Scale down objects on smaller screens
    if (width < 480) return this.baseScale * 0.5;
    if (width < 768) return this.baseScale * 0.6;
    if (width < 1024) return this.baseScale * 0.8;
    return this.baseScale;
  }

  getResponsiveSpacing() {
    const width = window.innerWidth;
    // Adjust spacing based on screen width
    if (width < 480) return this.baseSpacing * 0.4;
    if (width < 768) return this.baseSpacing * 0.5;
    if (width < 1024) return this.baseSpacing * 0.7;
    if (width < 1440) return this.baseSpacing * 0.85;
    return this.baseSpacing;
  }

  updateCameraPosition() {
    const width = window.innerWidth;
    // Move camera closer on smaller screens
    let cameraZ = this.baseCameraZ;
    
    if (width < 480) {
      cameraZ = this.baseCameraZ * 1.5;
    } else if (width < 768) {
      cameraZ = this.baseCameraZ * 1.3;
    } else if (width < 1024) {
      cameraZ = this.baseCameraZ * 1.1;
    }
    
    this.camera.position.z = cameraZ;
    this.camera.position.y = 0;
  }

  async loadVHSObjects() {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        'mesh/vhs.glb',
        (gltf) => {
          // Get collection states (or use debug mode)
          const collectionStates = this.debugMode ? 
            { vhs1: true, vhs2: true, vhs3: true } : // DEBUG: All collected
            (this.versionManager ? 
              this.versionManager.getCollectionStates() : 
              { vhs1: false, vhs2: false, vhs3: false });
          
          console.log('DEBUG MODE:', this.debugMode ? 'ON' : 'OFF');
          console.log('Collection states:', collectionStates);
          
          const responsiveScale = this.getResponsiveScale();
          
          // Find and setup the three VHS objects
          gltf.scene.traverse((child) => {
            if (child.name === 'death') {
              this.vhsObjects[1] = this.setupVHSObject(child.clone(), 1, responsiveScale);
              // VHS 1 is ALWAYS visible in end scene
              this.vhsGroup.add(this.vhsObjects[1]);
            } 
            else if (child.name === 'lovers') {
              this.vhsObjects[2] = this.setupVHSObject(child.clone(), 2, responsiveScale);
              // Only show VHS 2 if collected (or debug mode)
              if (collectionStates.vhs2) {
                this.vhsGroup.add(this.vhsObjects[2]);
              }
            } 
            else if (child.name === 'magician') {
              this.vhsObjects[3] = this.setupVHSObject(child.clone(), 3, responsiveScale);
              // Only show VHS 3 if collected (or debug mode)
              if (collectionStates.vhs3) {
                this.vhsGroup.add(this.vhsObjects[3]);
              }
            }
          });

          // Initialize hover states for visible objects
          Object.values(this.vhsObjects).forEach(obj => {
            if (obj && obj.parent === this.vhsGroup) {
              this.hoverStates.set(obj, {
                scale: 1,
                rotationX: 0,
                rotationY: 0,
                rotationZ: 0,
                targetScale: 1,
                targetRotationX: 0,
                targetRotationY: 0,
                targetRotationZ: 0
              });
            }
          });

          // Apply materials with HDRI
          this.vhsGroup.traverse((child) => {
            if (child.isMesh) {
              const originalMaterial = child.material;

              child.material = new THREE.MeshPhysicalMaterial({
                color: originalMaterial.color, 
                metalness: originalMaterial.metalness,
                envMap: this.hdriTexture,
                envMapIntensity: 2,
              });
              
              // Copy texture if it exists
              if (originalMaterial.map) {
                child.material.map = originalMaterial.map;
              }
            }
          });

          // Adjust positions based on what's visible
          this.adjustPositionsForVisible();
          
          console.log('VHS objects loaded for end scene');
          resolve();
        },
        undefined,
        (error) => {
          console.error('Failed to load VHS model for end scene:', error);
          reject(error);
        }
      );
    });
  }

  setupVHSObject(obj, vhsNumber, scale) {
    obj.position.set(0, 0, 0); // Will be set in adjustPositionsForVisible
    obj.scale.set(scale, scale, scale);
    obj.rotation.set(1.5, 0, 0);
    obj.userData.baseScale = scale;
    obj.userData.vhsNumber = vhsNumber;
    obj.userData.baseRotation = { x: 1.5, y: 0, z: 0 };
    return obj;
  }

  adjustPositionsForVisible() {
    const visibleObjects = [];
    
    // VHS 1 is always visible
    if (this.vhsObjects[1] && this.vhsObjects[1].parent === this.vhsGroup) {
      visibleObjects.push(this.vhsObjects[1]);
    }
    
    // Add other VHS if they're collected (or debug mode)
    const collectionStates = this.debugMode ?
      { vhs1: true, vhs2: true, vhs3: true } : // DEBUG: All collected
      (this.versionManager ? this.versionManager.getCollectionStates() : {});
    
    if ((this.debugMode || collectionStates.vhs2) && this.vhsObjects[2] && this.vhsObjects[2].parent === this.vhsGroup) {
      visibleObjects.push(this.vhsObjects[2]);
    }
    if ((this.debugMode || collectionStates.vhs3) && this.vhsObjects[3] && this.vhsObjects[3].parent === this.vhsGroup) {
      visibleObjects.push(this.vhsObjects[3]);
    }
    
    // Get responsive spacing
    const spacing = this.getResponsiveSpacing();
    
    // Calculate positions based on visible count
    if (visibleObjects.length === 1) {
      // Center single object
      visibleObjects[0].position.x = 0;
    } else if (visibleObjects.length === 2) {
      // Two objects: balanced spacing
      visibleObjects[0].position.x = -spacing / 2;
      visibleObjects[1].position.x = spacing / 2;
    } else if (visibleObjects.length === 3) {
      // Three objects: evenly distributed
      visibleObjects[0].position.x = -spacing;
      visibleObjects[1].position.x = 0;
      visibleObjects[2].position.x = spacing;
    }
    
    // Set Y and Z for all
    visibleObjects.forEach(obj => {
      obj.position.y = 0;
      obj.position.z = 0;
    });
    
    console.log(`End scene showing ${visibleObjects.length} VHS object(s) with spacing: ${spacing}`);
  }

  onMouseClick(event) {
    if (!this.isActive || !this.hoveredObject) return;
    
    const vhsNumber = this.hoveredObject.userData.vhsNumber;
    if (vhsNumber && this.onVersionSelect) {
      console.log(`VHS ${vhsNumber} clicked - selecting version ${vhsNumber}`);
      this.onVersionSelect(vhsNumber);
    }
  }

  onMouseMove(event) {
    if (!this.isActive) return;

    // Calculate mouse position in normalized device coordinates
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check for intersections with visible VHS objects
    const visibleObjects = Object.values(this.vhsObjects).filter(obj => 
      obj && obj.parent === this.vhsGroup
    );
    const intersects = this.raycaster.intersectObjects(visibleObjects, true);

    // Find the parent VHS object
    let newHoveredObject = null;
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      // Find the root VHS object
      while (obj && obj.parent && obj.parent !== this.vhsGroup) {
        obj = obj.parent;
      }
      if (visibleObjects.includes(obj)) {
        newHoveredObject = obj;
      }
    }

    // Update hover states
    if (newHoveredObject !== this.hoveredObject) {
      // Remove hover from previous object
      if (this.hoveredObject) {
        const state = this.hoverStates.get(this.hoveredObject);
        if (state) {
          state.targetScale = 1;
          state.targetRotationX = 0;
          state.targetRotationY = 0;
          state.targetRotationZ = 0.3;
        }
        this.canvas.style.cursor = 'default';
      }

      // Add hover to new object
      this.hoveredObject = newHoveredObject;
      if (this.hoveredObject) {
        const state = this.hoverStates.get(this.hoveredObject);
        if (state) {
          state.targetScale = 1.15;
          state.targetRotationX = 0.1;
          state.targetRotationY = 0.2;
          state.targetRotationZ = -0.6;
        }
        this.canvas.style.cursor = 'pointer';
      }
    }
  }

  show() {
    if (this.isActive) return;
    
    this.isActive = true;
    
    // Refresh object visibility based on current collection state
    this.refreshVisibility();
    
    // Reset animations
    this.resetAnimations();
    
    // Fade in the canvas
    setTimeout(() => {
      if (this.canvas) {
        this.canvas.style.opacity = '1';
        this.canvas.style.pointerEvents = 'auto';
      }
    }, 100);

    // Start animation
    this.animate();
  }

  hide() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    // Fade out the canvas
    if (this.canvas) {
      this.canvas.style.opacity = '0';
      this.canvas.style.pointerEvents = 'none';
    }

    // Stop animation
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  refreshVisibility() {
    if (!this.versionManager && !this.debugMode) return;
    
    const collectionStates = this.debugMode ?
      { vhs1: true, vhs2: true, vhs3: true } : // DEBUG: All collected
      this.versionManager.getCollectionStates();
    
    const responsiveScale = this.getResponsiveScale();
    
    // VHS 1 is always visible
    if (this.vhsObjects[1] && !this.vhsObjects[1].parent) {
      this.vhsGroup.add(this.vhsObjects[1]);
    }
    
    // Update scale for VHS 1
    if (this.vhsObjects[1]) {
      this.vhsObjects[1].userData.baseScale = responsiveScale;
      this.vhsObjects[1].scale.setScalar(responsiveScale);
    }
    
    // VHS 2 - add or remove based on collection
    if (this.vhsObjects[2]) {
      if (collectionStates.vhs2 && !this.vhsObjects[2].parent) {
        this.vhsGroup.add(this.vhsObjects[2]);
        // Initialize hover state if needed
        if (!this.hoverStates.has(this.vhsObjects[2])) {
          this.hoverStates.set(this.vhsObjects[2], {
            scale: 1,
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            targetScale: 1,
            targetRotationX: 0,
            targetRotationY: 0,
            targetRotationZ: 0
          });
        }
      } else if (!collectionStates.vhs2 && this.vhsObjects[2].parent) {
        this.vhsGroup.remove(this.vhsObjects[2]);
        this.hoverStates.delete(this.vhsObjects[2]);
      }
      
      // Update scale
      if (this.vhsObjects[2] && this.vhsObjects[2].parent) {
        this.vhsObjects[2].userData.baseScale = responsiveScale;
        this.vhsObjects[2].scale.setScalar(responsiveScale);
      }
    }
    
    // VHS 3 - add or remove based on collection
    if (this.vhsObjects[3]) {
      if (collectionStates.vhs3 && !this.vhsObjects[3].parent) {
        this.vhsGroup.add(this.vhsObjects[3]);
        // Initialize hover state if needed
        if (!this.hoverStates.has(this.vhsObjects[3])) {
          this.hoverStates.set(this.vhsObjects[3], {
            scale: 1,
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            targetScale: 1,
            targetRotationX: 0,
            targetRotationY: 0,
            targetRotationZ: 0
          });
        }
      } else if (!collectionStates.vhs3 && this.vhsObjects[3].parent) {
        this.vhsGroup.remove(this.vhsObjects[3]);
        this.hoverStates.delete(this.vhsObjects[3]);
      }
      
      // Update scale
      if (this.vhsObjects[3] && this.vhsObjects[3].parent) {
        this.vhsObjects[3].userData.baseScale = responsiveScale;
        this.vhsObjects[3].scale.setScalar(responsiveScale);
      }
    }
    
    // Adjust positions after visibility changes
    this.adjustPositionsForVisible();
  }

  resetAnimations() {
    // Reset hover states
    this.hoverStates.forEach(state => {
      state.scale = 1;
      state.rotationX = 0;
      state.rotationY = 0;
      state.rotationZ = 0;
      state.targetScale = 1;
      state.targetRotationX = 0;
      state.targetRotationY = 0;
      state.targetRotationZ = 0;
    });
    
    // Reset object transforms
    Object.values(this.vhsObjects).forEach(obj => {
      if (obj && obj.parent === this.vhsGroup) {
        const baseRotation = obj.userData.baseRotation || { x: 1.5, y: 0, z: 0 };
        obj.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
        const baseScale = obj.userData.baseScale || this.getResponsiveScale();
        obj.scale.setScalar(baseScale);
      }
    });
  }

  animate() {
    if (!this.isActive) return;
    
    this.animationId = requestAnimationFrame(() => this.animate());

    const time = Date.now() * 0.001;
    const lerpFactor = 0.1;

    // Animate each visible VHS object
    Object.values(this.vhsObjects).forEach((obj, index) => {
      if (!obj || obj.parent !== this.vhsGroup) return;

      const state = this.hoverStates.get(obj);
      if (state) {
        // Smooth transitions for hover effects
        state.scale += (state.targetScale - state.scale) * lerpFactor;
        state.rotationX += (state.targetRotationX - state.rotationX) * lerpFactor;
        state.rotationY += (state.targetRotationY - state.rotationY) * lerpFactor;
        state.rotationZ += (state.targetRotationZ - state.rotationZ) * lerpFactor;

        // Apply scale
        const baseScale = obj.userData.baseScale || this.getResponsiveScale();
        obj.scale.setScalar(baseScale * state.scale);

        // Apply rotation
        const baseRotation = obj.userData.baseRotation || { x: 1.5, y: 0, z: 0 };
        const floatOffset = obj.userData.vhsNumber * (Math.PI * 2 / 3);
        obj.rotation.x = baseRotation.x + state.rotationX;
        obj.rotation.y = baseRotation.y + state.rotationY;
        obj.rotation.z = baseRotation.z + state.rotationZ;

        // Floating animation
        obj.position.y = Math.sin(time * 2 + floatOffset) * 0.1;
      }
    });

    // Render
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  onWindowResize() {
    if (this.camera) {
      // Update FOV based on new window size
      this.camera.fov = this.getResponsiveFOV();
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      
      // Update camera position
      this.updateCameraPosition();
    }

    if (this.renderer) {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    // Update all VHS object scales and positions
    const responsiveScale = this.getResponsiveScale();
    Object.values(this.vhsObjects).forEach(obj => {
      if (obj && obj.parent === this.vhsGroup) {
        obj.userData.baseScale = responsiveScale;
        // Don't immediately set scale - let animation handle it
      }
    });
    
    // Reposition objects with new spacing
    this.adjustPositionsForVisible();
  }

  // Method to toggle debug mode
  setDebugMode(enabled) {
    this.debugMode = enabled;
    console.log('Debug mode:', enabled ? 'ENABLED' : 'DISABLED');
    this.refreshVisibility();
  }

  dispose() {
    this.hide();
    
    // Remove event listeners
    window.removeEventListener('mousemove', (event) => this.onMouseMove(event));
    window.removeEventListener('click', (event) => this.onMouseClick(event));
    window.removeEventListener('resize', () => this.onWindowResize());
    
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    // Clean up Three.js objects
    if (this.vhsGroup) {
      this.vhsGroup.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.vhsObjects = {};
    this.vhsGroup = null;
    this.canvas = null;
    this.raycaster = null;
    this.mouse = null;
    this.hoveredObject = null;
    this.hoverStates.clear();
  }
}

export default EndScene;
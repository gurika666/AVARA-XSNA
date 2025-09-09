// end-scene.js - A separate Three.js scene with improved VHS collection logic
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
    this.versionManager = versionManager; // Use version manager for collection states
    
    // VHS objects
    this.vhsObjects = {}; // Store by number: 1, 2, 3
    this.vhsGroup = null;
    
    // Hover tracking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredObject = null;
    this.hoverStates = new Map(); // Track hover animation states
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
    this.renderer.setClearColor(0x000000, 0); // Transparent background

    // Setup scene
    this.scene = new THREE.Scene();
    
    // Apply HDRI to scene environment for global reflections
    if (this.hdriTexture) {
      this.scene.environment = this.hdriTexture;
    }

    // Setup camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 12;
    this.camera.position.y = 0;

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

    // Add mouse move listener
    window.addEventListener('mousemove', (event) => this.onMouseMove(event));
    
    // Add click listener
    window.addEventListener('click', (event) => this.onMouseClick(event));

    // Add resize listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  async loadVHSObjects() {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        'mesh/vhs.glb',
        (gltf) => {
          // Get current collection states from version manager
          const collectionStates = this.versionManager ? 
            this.versionManager.getCollectionStates() : 
            { vhs1: false, vhs2: false, vhs3: false };
          
          // Find and setup the three VHS objects
          gltf.scene.traverse((child) => {
            if (child.name === 'death') {
              this.vhsObjects[1] = this.setupVHSObject(child.clone(), 1, -5, 0, 0);
              // VHS 1 is ALWAYS visible in end scene, regardless of collection
              this.vhsGroup.add(this.vhsObjects[1]);
            } 
            else if (child.name === 'lovers') {
              this.vhsObjects[2] = this.setupVHSObject(child.clone(), 2, 0, 0, 0);
              // Only show VHS 2 if it's been collected
              if (collectionStates.vhs2) {
                this.vhsGroup.add(this.vhsObjects[2]);
              }
            } 
            else if (child.name === 'magician') {
              this.vhsObjects[3] = this.setupVHSObject(child.clone(), 3, 5, 0, 0);
              // Only show VHS 3 if it's been collected
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
                // emissiveMap: originalMaterial.color,
                // emissiveIntensity: 1,
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

  setupVHSObject(obj, vhsNumber, x, y, z) {
    obj.position.set(x, y, z);
    obj.scale.set(2, 2, 2);
    obj.rotation.set(1.5, 0, 0);
    obj.userData.baseScale = 2;
    obj.userData.vhsNumber = vhsNumber;
    obj.userData.baseRotation = { x: 1.5, y: 0, z: 0 };
    return obj;
  }

  adjustPositionsForVisible() {
    const visibleObjects = [];
    
    // VHS 1 is always visible
    if (this.vhsObjects[1]) {
      visibleObjects.push(this.vhsObjects[1]);
    }
    
    // Add other VHS if they're collected
    if (this.versionManager) {
      if (this.versionManager.isVHSCollected(2) && this.vhsObjects[2]) {
        visibleObjects.push(this.vhsObjects[2]);
      }
      if (this.versionManager.isVHSCollected(3) && this.vhsObjects[3]) {
        visibleObjects.push(this.vhsObjects[3]);
      }
    }
    
    // Redistribute positions evenly based on visible count
    const spacing = 7;
    const totalWidth = (visibleObjects.length - 1) * spacing;
    const startX = -totalWidth / 2;
    
    visibleObjects.forEach((obj, index) => {
      if (obj) {
        obj.position.x = startX + (index * spacing);
        obj.position.y = 0;
        obj.position.z = 0;
        obj.rotation.set(1.5, 0, 0);
      }
    });
    
    console.log(`End scene showing ${visibleObjects.length} VHS object(s)`);
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
          state.targetScale = 1.15; // Scale up by 15%
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
    if (!this.versionManager) return;
    
    const collectionStates = this.versionManager.getCollectionStates();
    
    // VHS 1 is always visible
    if (this.vhsObjects[1] && !this.vhsObjects[1].parent) {
      this.vhsGroup.add(this.vhsObjects[1]);
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
        const baseScale = obj.userData.baseScale || 2;
        obj.scale.setScalar(baseScale);
      }
    });
  }

  animate() {
    if (!this.isActive) return;
    
    this.animationId = requestAnimationFrame(() => this.animate());

    const time = Date.now() * 0.001;
    const lerpFactor = 0.1; // Smooth transition speed

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
        const baseScale = obj.userData.baseScale || 2;
        obj.scale.setScalar(baseScale * state.scale);

        // Apply rotation (combine with floating animation)
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
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }

    if (this.renderer) {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
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
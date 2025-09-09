// end-scene.js - A separate Three.js scene that appears at the end
import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

class EndScene {
constructor(hdriTexture = null, onVersionSelect = null, collectedStates = null) {  // ADD: Accept collected states
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.canvas = null;
    this.isActive = false;
    this.animationId = null;
    this.hdriTexture = hdriTexture;  // ADD: Store the HDRI texture
    this.onVersionSelect = onVersionSelect;
    this.collectedStates = collectedStates || { vhs1: false, vhs2: false, vhs3: false };  // ADD: Store collected states
    
    // VHS objects
    this.deathObject = null;
    this.loversObject = null;
    this.magicianObject = null;
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
    
    // ADD: Apply HDRI to scene environment for global reflections
    if (this.hdriTexture) {
      this.scene.environment = this.hdriTexture;
      // Optional: use as background too
      // this.scene.background = this.hdriTexture;
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
    const ambientLight = new THREE.AmbientLight(0x111111, 0);
    this.scene.add(ambientLight);

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
          // Find the three objects in the loaded model
          gltf.scene.traverse((child) => {
            if (child.name === 'death') {
              this.deathObject = child.clone();
              // Position death object to the left
              this.deathObject.position.set(-5, 0, 0);
              this.deathObject.scale.set(2, 2, 2);
              this.deathObject.userData.baseScale = 2;
              this.deathObject.userData.baseRotation = { x: 0, y: 0, z: 0 };
              // Only add if vhs1 was collected
              if (this.collectedStates.vhs1) {
                this.vhsGroup.add(this.deathObject);
              }
            } else if (child.name === 'lovers') {
              this.loversObject = child.clone();
              // Position lovers object in the center
              this.loversObject.position.set(0, 0, 0);
              this.loversObject.scale.set(2, 2, 2);
              this.loversObject.userData.baseScale = 2;
              this.loversObject.userData.baseRotation = { x: 0, y: 0, z: 0 };
              // Only add if vhs2 was collected
              if (this.collectedStates.vhs2) {
                this.vhsGroup.add(this.loversObject);
              }
            } else if (child.name === 'magician') {
              this.magicianObject = child.clone();
              // Position magician object to the right
              this.magicianObject.position.set(5, 0, 0);
              this.magicianObject.scale.set(2, 2, 2);
              this.magicianObject.userData.baseScale = 2;
              this.magicianObject.userData.baseRotation = { x: 0, y: 0, z: 0 };
              // Only add if vhs3 was collected
              if (this.collectedStates.vhs3) {
                this.vhsGroup.add(this.magicianObject);
              }
            }
        });

          // Initialize hover states for each object
        // Initialize hover states only for collected objects
          [this.deathObject, this.loversObject, this.magicianObject].forEach((obj, index) => {
            const isCollected = (index === 0 && this.collectedStates.vhs1) ||
                               (index === 1 && this.collectedStates.vhs2) ||
                               (index === 2 && this.collectedStates.vhs3);
            if (obj && isCollected) {
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
                roughness: originalMaterial.roughness,
                envMap: this.hdriTexture,  // CHANGE: Use this.hdriTexture instead of resources.txthdr
                // emissive: originalMaterial.color || 0xffffff,
                // emissiveIntensity: 0.3,
                envMapIntensity: 2,
              });
              
              // Copy texture if it exists
              if (originalMaterial.map) {
                child.material.map = originalMaterial.map;
              }
            }
          });

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

  onMouseClick(event) {
    if (!this.isActive || !this.hoveredObject) return;
    
    // Determine which object was clicked and trigger version change
    if (this.hoveredObject === this.deathObject) {
      console.log('Death object clicked - selecting version 1');
      if (this.onVersionSelect) {
        this.onVersionSelect(1);
      }
    } else if (this.hoveredObject === this.loversObject) {
      console.log('Lovers object clicked - selecting version 2');
      if (this.onVersionSelect) {
        this.onVersionSelect(2);
      }
    } else if (this.hoveredObject === this.magicianObject) {
      console.log('Magician object clicked - selecting version 3');
      if (this.onVersionSelect) {
        this.onVersionSelect(3);
      }
    }
  }

  onMouseMove(event) {
    if (!this.isActive) return;

    // Calculate mouse position in normalized device coordinates
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check for intersections with VHS objects
    const objects = [this.deathObject, this.loversObject, this.magicianObject].filter(obj => obj !== null);
    const intersects = this.raycaster.intersectObjects(objects, true);

    // Find the parent VHS object
    let newHoveredObject = null;
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      // Find the root VHS object (death, lovers, or magician)
      while (obj && obj.parent && obj.parent !== this.vhsGroup) {
        obj = obj.parent;
      }
      if (objects.includes(obj)) {
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
          state.targetRotationZ = 0;
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
          state.targetRotationZ = -0.5;
        }
        this.canvas.style.cursor = 'pointer';
      }
    }
  }

  show() {
    if (this.isActive) return;
    
    this.isActive = true;
    
    // Reset animations
    this.resetAnimations();
    this.adjustPositionsForCollected();
    
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

  resetAnimations() {
    // Reset positions and rotations for a fresh start
    if (this.deathObject) {
      this.deathObject.position.set(-7, 0, 0);
      this.deathObject.rotation.set(1.5, 0, 0);
    }
    if (this.loversObject) {
      this.loversObject.position.set(0, 0, 0);
      this.loversObject.rotation.set(1.5, 0, 0);
    }
    if (this.magicianObject) {
      this.magicianObject.position.set(7, 0, 0);
      this.magicianObject.rotation.set(1.5, 0, 0);
    }

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
  }

adjustPositionsForCollected() {
    // Reposition objects based on which ones are collected
    const collectedObjects = [];
    
    if (this.collectedStates.vhs1 && this.deathObject) {
      collectedObjects.push(this.deathObject);
    }
    if (this.collectedStates.vhs2 && this.loversObject) {
      collectedObjects.push(this.loversObject);
    }
    if (this.collectedStates.vhs3 && this.magicianObject) {
      collectedObjects.push(this.magicianObject);
    }
    
    // Redistribute positions based on how many objects are shown
    const spacing = 7; // Distance between objects
    const totalWidth = (collectedObjects.length - 1) * spacing;
    const startX = -totalWidth / 2;
    
    collectedObjects.forEach((obj, index) => {
      obj.position.x = startX + (index * spacing);
      obj.rotation.set(1.5, 0, 0);
    });
    
    console.log(`Showing ${collectedObjects.length} collected VHS objects`);
  }

  animate() {
    if (!this.isActive) return;
    
    this.animationId = requestAnimationFrame(() => this.animate());

    const time = Date.now() * 0.001;
    const lerpFactor = 0.1; // Smooth transition speed

    // Animate each VHS object
    [this.deathObject, this.loversObject, this.magicianObject].forEach((obj, index) => {
      if (!obj) return;

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
        const floatOffset = index * (Math.PI * 2 / 3);
        obj.rotation.x = 1.5 + state.rotationX;
        obj.rotation.y = state.rotationY;
        obj.rotation.z = state.rotationZ;

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
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.deathObject = null;
    this.loversObject = null;
    this.magicianObject = null;
    this.vhsGroup = null;
    this.canvas = null;
    this.raycaster = null;
    this.mouse = null;
    this.hoveredObject = null;
    this.hoverStates.clear();
  }
}

export default EndScene;
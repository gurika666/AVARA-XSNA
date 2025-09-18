// end-scene.js - Responsive Three.js scene with swipe carousel for mobile
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
    this.baseSpacing = 10; // Base spacing for horizontal layout
    this.baseScale = 3; // Base scale for objects
    this.baseCameraZ = 15; // Base camera distance
    
    // Layout breakpoint
    this.verticalBreakpoint = 768; // Switch to carousel below this width
    
    // Carousel/swipe properties
    this.currentIndex = 0;
    this.targetRotation = 0;
    this.currentRotation = 0;
    this.touchStartX = 0;
    this.touchStartRotation = 0;
    this.isDragging = false;
    this.carouselRadius = 8; // Distance of items from center in carousel
    
    // Swipe velocity tracking
    this.lastTouchX = 0;
    this.lastTouchTime = 0;
    this.swipeVelocity = 0;
    
    // DEBUG MODE - Set to false for production
    this.debugMode = false;
  }

  isCarouselLayout() {
    return window.innerWidth <= this.verticalBreakpoint;
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
    z-index: 3;
    pointer-events: none;  /* Canvas doesn't block clicks */
    opacity: 1;
    transition: opacity 1s ease-in-out;
    touch-action: pan-y;
  `;
  document.body.appendChild(this.canvas);

  // Setup renderer with transparent background
  this.renderer = new THREE.WebGLRenderer({ 
    canvas: this.canvas, 
    alpha: true,  /* Enable transparency */
    antialias: true 
  });
  this.renderer.setPixelRatio(window.devicePixelRatio);
  this.renderer.setSize(window.innerWidth, window.innerHeight);
  this.renderer.setClearColor(0x000000, 0);  /* Fully transparent background */

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
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Mouse events
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('click', (e) => this.onMouseClick(e));
    
    // Touch events for swipe
    this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    
    // Mouse drag for desktop testing of swipe
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseDrag(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    
    // Resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  getResponsiveFOV() {
    const width = window.innerWidth;
    
    if (this.isCarouselLayout()) {
      // Narrower FOV for carousel to focus on single item
      return 60;
    }
    
    // Horizontal layout FOVs
    if (width < 1024) return 80;
    return 75;
  }

  getResponsiveScale() {
    const width = window.innerWidth;
    
    if (this.isCarouselLayout()) {
      // Larger scale for single focused item
      const minDimension = Math.min(width, window.innerHeight);
      if (minDimension < 400) return this.baseScale * 0.6;
      if (minDimension < 600) return this.baseScale * 0.8;
      return this.baseScale * 1.0;
    }
    
    // Horizontal layout scaling
    if (width < 1024) return this.baseScale * 0.8;
    return this.baseScale;
  }

  getResponsiveSpacing() {
    const width = window.innerWidth;
    
    // Only used for horizontal layout
    if (width < 1024) return this.baseSpacing * 0.7;
    if (width < 1440) return this.baseSpacing * 0.85;
    return this.baseSpacing;
  }

  updateCameraPosition() {
    const width = window.innerWidth;
    
    let cameraZ = this.baseCameraZ;
    let cameraY = 0;
    
    if (this.isCarouselLayout()) {
      // Camera closer for carousel view
      cameraZ = this.baseCameraZ * 1.7;
    } else {
      // Horizontal layout camera positions
      if (width < 1024) {
        cameraZ = this.baseCameraZ * 1.1;
      }
    }
    
    this.camera.position.set(0, cameraY, cameraZ);
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
    obj.userData.carouselIndex = null; // Will be set for carousel items
    return obj;
  }

  getVisibleObjects() {
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
    
    return visibleObjects;
  }

  adjustPositionsForVisible() {
    const visibleObjects = this.getVisibleObjects();
    
    // Check layout type based on window width
    const useCarouselLayout = this.isCarouselLayout();
    
    if (useCarouselLayout) {
      // CAROUSEL ARRANGEMENT (narrow screens)
      // Arrange items in a circle around the origin
      visibleObjects.forEach((obj, index) => {
        obj.userData.carouselIndex = index;
        // Items will be positioned dynamically in animate()
      });
      
      // Reset to first item
      this.currentIndex = 0;
      this.targetRotation = 0;
      this.currentRotation = 0;
      
    } else {
      // HORIZONTAL ARRANGEMENT (wide screens)
      const spacing = this.getResponsiveSpacing();
      
      if (visibleObjects.length === 1) {
        // Center single object
        visibleObjects[0].position.set(0, 0, 0);
      } else if (visibleObjects.length === 2) {
        // Two objects: balanced spacing
        visibleObjects[0].position.set(-spacing / 2, 0, 0);
        visibleObjects[1].position.set(spacing / 2, 0, 0);
      } else if (visibleObjects.length === 3) {
        // Three objects: evenly distributed
        visibleObjects[0].position.set(-spacing, 0, 0);
        visibleObjects[1].position.set(0, 0, 0);
        visibleObjects[2].position.set(spacing, 0, 0);
      }
      
      // Clear Y and Z for horizontal layout
      visibleObjects.forEach(obj => {
        obj.position.y = 0;
        obj.position.z = 0;
        obj.userData.carouselIndex = null;
      });
    }
    
    const layoutType = useCarouselLayout ? 'carousel' : 'horizontal';
    console.log(`End scene showing ${visibleObjects.length} VHS object(s) in ${layoutType} layout`);
  }

  // Touch/swipe handlers
  onTouchStart(event) {
    if (!this.isActive || !this.isCarouselLayout()) return;
    
    event.preventDefault();
    
    if (event.touches.length > 0) {
      this.isDragging = true;
      this.touchStartX = event.touches[0].clientX;
      this.touchStartRotation = this.targetRotation;
      this.lastTouchX = event.touches[0].clientX;
      this.lastTouchTime = Date.now();
      this.swipeVelocity = 0;
    }
  }

  onTouchMove(event) {
    if (!this.isDragging || !this.isCarouselLayout()) return;
    
    event.preventDefault();
    
    if (event.touches.length > 0) {
      const currentX = event.touches[0].clientX;
      const deltaX = currentX - this.touchStartX;
      const rotationSpeed = 0.005;
      
      // Calculate velocity
      const currentTime = Date.now();
      const deltaTime = currentTime - this.lastTouchTime;
      if (deltaTime > 0) {
        this.swipeVelocity = (currentX - this.lastTouchX) / deltaTime;
      }
      
      this.lastTouchX = currentX;
      this.lastTouchTime = currentTime;
      
      // Update rotation based on drag - positive for inverted swipe direction
      this.targetRotation = this.touchStartRotation + (deltaX * rotationSpeed);
    }
  }

  onTouchEnd(event) {
    if (!this.isDragging || !this.isCarouselLayout()) return;
    
    event.preventDefault();
    
    this.isDragging = false;
    
    const visibleObjects = this.getVisibleObjects();
    if (visibleObjects.length === 0) return;
    
    // Add velocity to final position - positive for inverted
    const velocityInfluence = this.swipeVelocity * 0.3;
    this.targetRotation += velocityInfluence;
    
    // Snap to nearest item
    const itemAngle = (Math.PI * 2) / visibleObjects.length;
    const nearestIndex = Math.round(this.targetRotation / itemAngle);
    this.targetRotation = nearestIndex * itemAngle;
    this.currentIndex = ((nearestIndex % visibleObjects.length) + visibleObjects.length) % visibleObjects.length;
    
    // Check if tap on current item (no significant movement)
    const deltaX = Math.abs(this.lastTouchX - this.touchStartX);
    if (deltaX < 10) {
      // This is a tap, not a swipe
      const currentObject = visibleObjects[this.currentIndex];
      if (currentObject && this.onVersionSelect) {
        const vhsNumber = currentObject.userData.vhsNumber;
        console.log(`VHS ${vhsNumber} tapped - selecting version ${vhsNumber}`);
        this.onVersionSelect(vhsNumber);
      }
    }
  }

  // Mouse drag handlers (for desktop testing)
  onMouseDown(event) {
    if (!this.isActive || !this.isCarouselLayout()) return;
    
    this.isDragging = true;
    this.touchStartX = event.clientX;
    this.touchStartRotation = this.targetRotation;
    this.lastTouchX = event.clientX;
    this.lastTouchTime = Date.now();
    this.swipeVelocity = 0;
  }

  onMouseDrag(event) {
    if (!this.isDragging || !this.isCarouselLayout()) return;
    
    const currentX = event.clientX;
    const deltaX = currentX - this.touchStartX;
    const rotationSpeed = 0.005;
    
    // Calculate velocity
    const currentTime = Date.now();
    const deltaTime = currentTime - this.lastTouchTime;
    if (deltaTime > 0) {
      this.swipeVelocity = (currentX - this.lastTouchX) / deltaTime;
    }
    
    this.lastTouchX = currentX;
    this.lastTouchTime = currentTime;
    
    // Update rotation - positive for inverted swipe
    this.targetRotation = this.touchStartRotation + (deltaX * rotationSpeed);
  }

  onMouseUp(event) {
    if (!this.isDragging || !this.isCarouselLayout()) return;
    
    this.isDragging = false;
    
    const visibleObjects = this.getVisibleObjects();
    if (visibleObjects.length === 0) return;
    
    // Add velocity to final position - positive for inverted
    const velocityInfluence = this.swipeVelocity * 0.3;
    this.targetRotation += velocityInfluence;
    
    // Snap to nearest item
    const itemAngle = (Math.PI * 2) / visibleObjects.length;
    const nearestIndex = Math.round(this.targetRotation / itemAngle);
    this.targetRotation = nearestIndex * itemAngle;
    this.currentIndex = ((nearestIndex % visibleObjects.length) + visibleObjects.length) % visibleObjects.length;
    
    // Check for click on current item
    const deltaX = Math.abs(event.clientX - this.touchStartX);
    if (deltaX < 10) {
      const currentObject = visibleObjects[this.currentIndex];
      if (currentObject && this.onVersionSelect) {
        const vhsNumber = currentObject.userData.vhsNumber;
        console.log(`VHS ${vhsNumber} clicked - selecting version ${vhsNumber}`);
        this.onVersionSelect(vhsNumber);
      }
    }
  }

  onMouseClick(event) {
    if (!this.isActive || this.isCarouselLayout()) return;
    
    // Only handle clicks in horizontal layout
    if (!this.hoveredObject) return;
    
    const vhsNumber = this.hoveredObject.userData.vhsNumber;
    if (vhsNumber && this.onVersionSelect) {
      console.log(`VHS ${vhsNumber} clicked - selecting version ${vhsNumber}`);
      this.onVersionSelect(vhsNumber);
    }
  }

  onMouseMove(event) {
    if (!this.isActive) return;

    // Only handle hover in horizontal layout
    if (this.isCarouselLayout()) return;

    // Calculate mouse position in normalized device coordinates
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check for intersections with visible VHS objects
    const visibleObjects = this.getVisibleObjects();
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
  
  // Enable pointer events when showing
  setTimeout(() => {
    if (this.canvas) {
      this.canvas.style.opacity = '1';
      // Still keep pointer-events as 'none' - we'll handle clicks differently
      this.canvas.style.pointerEvents = 'none';
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
    
    // Reset carousel
    this.currentIndex = 0;
    this.targetRotation = 0;
    this.currentRotation = 0;
    
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
    
    const isCarousel = this.isCarouselLayout();
    const visibleObjects = this.getVisibleObjects();

    if (isCarousel && visibleObjects.length > 0) {
      // CAROUSEL ANIMATION
      
      // Smooth rotation interpolation
      if (!this.isDragging) {
        this.currentRotation += (this.targetRotation - this.currentRotation) * lerpFactor;
      } else {
        this.currentRotation = this.targetRotation;
      }
      
      // Position objects in a circle
      const itemAngle = (Math.PI * 2) / visibleObjects.length;
      
      visibleObjects.forEach((obj, index) => {
        // Calculate angle based on index and current rotation
        const angle = this.currentRotation + (index * itemAngle);
        const x = Math.sin(angle) * this.carouselRadius;
        const z = Math.cos(angle) * this.carouselRadius - this.carouselRadius;
        
        obj.position.set(x, 0, z);
        
        // Scale based on distance from front
        const distanceFromFront = Math.abs(Math.sin(angle));
        const scale = 1 - (distanceFromFront * 0.3); // Objects at sides are 30% smaller
        const baseScale = obj.userData.baseScale || this.getResponsiveScale();
        obj.scale.setScalar(baseScale * scale);
        
        // Fade objects that are behind
        const opacity = Math.cos(angle) > -0.3 ? 1 : 0.3;
        obj.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.opacity = opacity;
            child.material.transparent = opacity < 1;
          }
        });
        
        // Apply base rotation only - no additional rotation
        const baseRotation = obj.userData.baseRotation || { x: 1.5, y: 0, z: 0 };
        obj.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
      });
      
    } else {
      // HORIZONTAL LAYOUT ANIMATION
      
      // Animate each visible VHS object
      visibleObjects.forEach((obj) => {
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

          // Floating animation for horizontal layout
          obj.position.y = Math.sin(time * 2 + floatOffset) * 0.1;
          
          // Reset opacity for horizontal layout
          obj.traverse((child) => {
            if (child.isMesh && child.material) {
              child.material.opacity = 1;
              child.material.transparent = false;
            }
          });
        }
      });
    }

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
    
    // Reposition objects with new layout (carousel vs horizontal)
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
    window.removeEventListener('mousemove', (e) => this.onMouseMove(e));
    window.removeEventListener('click', (e) => this.onMouseClick(e));
    this.canvas.removeEventListener('touchstart', (e) => this.onTouchStart(e));
    this.canvas.removeEventListener('touchmove', (e) => this.onTouchMove(e));
    this.canvas.removeEventListener('touchend', (e) => this.onTouchEnd(e));
    this.canvas.removeEventListener('mousedown', (e) => this.onMouseDown(e));
    window.removeEventListener('mousemove', (e) => this.onMouseDrag(e));
    window.removeEventListener('mouseup', (e) => this.onMouseUp(e));
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
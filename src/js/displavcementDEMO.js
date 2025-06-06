import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Custom shader pass for texture-based displacement effect with rotation animation
 */
class DisplacementPass extends ShaderPass {
  /**
   * @param {THREE.Texture} displacementMap - The displacement map texture
   * @param {number} displacementScale - Scale of the displacement effect (default: 0.1)
   * @param {Object} options - Additional options
   * @param {number} options.rotationChangeFPS - How many rotation changes per second (default: 20)
   * @param {number} options.transitionSpeed - How quickly to transition between rotations (default: 0.5)
   * @param {number} options.rotationSpeed - Base rotation speed (default: 0.2)
   */
  constructor(displacementMap, displacementScale = 0.1, options = {}) {
    // Default options
    const defaultOptions = {
      rotationChangeFPS: 3,  // Changes per second (default: change every 3 frames at 60fps)
      transitionSpeed: 0.5,   // Transition speed between rotations
      rotationSpeed: 0.2      // Base rotation speed
    };
    
    // Merge with provided options
    const mergedOptions = { ...defaultOptions, ...options };
    
    // Define the shader
    const shader = {
      uniforms: {
        'tDiffuse': { value: null },
        'tDisplacement': { value: null },
        'scale': { value: displacementScale },
        'time': { value: 0 },
        'rotation': { value: 0 },
        'randomSeed': { value: Math.random() * 100 },
        'rotationSpeed': { value: mergedOptions.rotationSpeed },
        'randomRotation': { value: true },
        'resolution': { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDisplacement;
        uniform float scale;
        uniform float time;
        uniform float rotation;
        uniform float randomSeed;
        uniform vec2 resolution;
        varying vec2 vUv;

        // Function to rotate UV coordinates
        vec2 rotateUV(vec2 uv, float rotation, vec2 center) {
          float cosAngle = cos(rotation);
          float sinAngle = sin(rotation);
          vec2 texCoord = uv - center;
          vec2 rotatedCoord = vec2(
            texCoord.x * cosAngle - texCoord.y * sinAngle,
            texCoord.x * sinAngle + texCoord.y * cosAngle
          );
          return rotatedCoord + center;
        }

        void main() {
          // Calculate rotation center (middle of texture)
          vec2 center = vec2(0.5, 0.5);
          
          // Apply rotation to the displacement map UVs
          vec2 rotatedUv = rotateUV(vUv, rotation, center);
          
          // Sample the displacement map with rotated UVs
          vec4 displacement = texture2D(tDisplacement, rotatedUv);
          
          // Calculate displacement vector (using the red and green channels)
          vec2 displacementVector = (displacement.rg - 0.5) * 2.0 * scale;
          
          // Apply displacement to original UV coordinates
          vec2 distortedUv = vUv + displacementVector;
          
          // Sample the scene texture with distorted UVs
          vec4 color = texture2D(tDiffuse, distortedUv);
          
          // Output the color
          gl_FragColor = color;
        }
      `
    };

    super(shader);

    // Set the displacement map if provided
    if (displacementMap) {
      this.uniforms.tDisplacement.value = displacementMap;
    }

    // Store options after super() call
    this.options = mergedOptions;
    
    // Store last update time for animation
    this.lastUpdateTime = 0;
    this.randomTargetRotation = 0;
    this.currentRotation = 0;
    this.frameCounter = 0;
    
    // Calculate frame interval based on rotationChangeFPS
    this.calculateFrameInterval();
  }
  
  /**
   * Calculate how many frames to wait before changing rotation
   * based on the rotationChangeFPS setting
   */
  calculateFrameInterval() {
    // Assuming 60fps as base rendering speed
    const baseFrameRate = 60;
    
    // Calculate frames to wait (round to nearest integer)
    this.frameInterval = Math.round(baseFrameRate / this.options.rotationChangeFPS);
    
    // Ensure at least 1 frame interval
    this.frameInterval = Math.max(1, this.frameInterval);
    
    console.log(`Rotation will change every ${this.frameInterval} frames (${this.options.rotationChangeFPS} FPS)`);
  }

  // Update method to animate the displacement
  update(renderer, time, displacementScale) {
    // Update time and scale uniforms
    this.uniforms.time.value = time * 0.001; // Convert to seconds
    
    if (displacementScale !== undefined) {
      this.uniforms.scale.value = displacementScale;
    }
    
    // Increment frame counter
    this.frameCounter++;
    
    // Calculate delta time for animation
    const deltaTime = this.lastUpdateTime === 0 ? 0.016 : (time - this.lastUpdateTime) * 0.001;
    this.lastUpdateTime = time;

    // Random rotation based on frameInterval
    if (this.frameCounter % this.frameInterval === 0) {
      // Set a new random target rotation
      this.randomTargetRotation = Math.random() * Math.PI * 2; // 0 to 2π
    }

    // Apply rotation with configurable transition speed
    this.currentRotation += (this.randomTargetRotation - this.currentRotation) * 
                           this.options.transitionSpeed;

    // Apply continuous rotation plus the random current rotation
    const baseRotation = this.uniforms.time.value * this.uniforms.rotationSpeed.value;
    this.uniforms.rotation.value = baseRotation + this.currentRotation;

    // Update resolution if needed
    if (renderer) {
      const size = renderer.getSize(new THREE.Vector2());
      this.uniforms.resolution.value.set(size.width, size.height);
    }
  }

  // Method to set rotation speed
  setRotationSpeed(speed) {
    this.uniforms.rotationSpeed.value = speed;
  }

  // Method to enable/disable random rotation
  setRandomRotation(enabled) {
    this.uniforms.randomRotation.value = enabled;
  }
  
  /**
   * Sets the rotation change frequency in changes per second
   * @param {number} fps - Changes per second
   */
  setRotationChangeFPS(fps) {
    this.options.rotationChangeFPS = fps;
    this.calculateFrameInterval();
  }
  
  /**
   * Sets the transition speed between rotations
   * @param {number} speed - Transition speed (0-1, higher = faster)
   */
  setTransitionSpeed(speed) {
    this.options.transitionSpeed = Math.max(0, Math.min(1, speed));
  }
}

export { DisplacementPass };
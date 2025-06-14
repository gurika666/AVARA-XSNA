// basic-blur-pass.js - Simple full-scene blur
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Step 1: Basic blur that affects the whole scene
export class BasicBlurPass extends ShaderPass {
  constructor(blurSize = 1.0) {
    // Define the shader
    const shader = {
      uniforms: {
        tDiffuse: { value: null },  // The input texture from previous pass
        blurSize: { value: blurSize },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
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
        uniform float blurSize;
        uniform vec2 resolution;
        varying vec2 vUv;
        
        void main() {
          vec2 texelSize = 1.0 / resolution;
          vec4 result = vec4(0.0);
          
          // 9-sample box blur
          for(float x = -1.0; x <= 1.0; x += 1.0) {
            for(float y = -1.0; y <= 1.0; y += 1.0) {
              vec2 offset = vec2(x, y) * texelSize * blurSize;
              result += texture2D(tDiffuse, vUv + offset);
            }
          }
          
          // Divide by 9 to get average
          result /= 9.0;
          
          gl_FragColor = result;
        }
      `
    };
    
    // Call parent constructor with our shader
    super(shader);
  }
  
  // Method to change blur size
  setBlurSize(size) {
    this.uniforms.blurSize.value = size;
  }
  
  // Update resolution if window resizes
  setSize(width, height) {
    this.uniforms.resolution.value.set(width, height);
  }
}

// Usage in your app.js:
/*
import { BasicBlurPass } from './basic-blur-pass.js';

// In setupPostProcessing():
const blurPass = new BasicBlurPass(2.0); // 2.0 is the blur size
composer.addPass(blurPass);
composer.addPass(bloomPass); // Add bloom after blur

// In onWindowResize():
blurPass.setSize(window.innerWidth, window.innerHeight);

// In animate() - you can change blur dynamically:
const audioTime = AudioController.getCurrentTime();
blurPass.setBlurSize(1.0 + Math.sin(audioTime) * 0.5); // Pulsing blur
*/
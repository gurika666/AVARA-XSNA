// depth-driven-blur-pass.js - Simple depth-based blur
import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export class DepthDrivenBlurPass extends Pass {
  constructor(scene, camera, maxBlurSize = 5.0) {
    super();
    
    this.scene = scene;
    this.camera = camera;
    this.maxBlurSize = maxBlurSize;
    
    // Layer exclusion properties
    this.excludedLayers = new Set();
    this.originalVisibility = new Map();
    
    // Create depth render target
    this.depthRenderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat
      }
    );
    
    // Create depth material
    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    });
    
    // Create blur shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: this.depthRenderTarget.texture },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        maxBlurSize: { value: maxBlurSize },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        debugDepth: { value: false }
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
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float maxBlurSize;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform bool debugDepth;
        varying vec2 vUv;
        
        // Get depth value (0 = near, 1 = far)
        float readDepth(vec2 coord) {
          float fragCoordZ = texture2D(tDepth, coord).x;
          float viewZ = (cameraNear * cameraFar) / ((cameraFar - cameraNear) * fragCoordZ - cameraFar);
          return (-viewZ - cameraNear) / (cameraFar - cameraNear);
        }
        
        void main() {
          float depth = readDepth(vUv);
          
          // Debug mode - show depth
          if (debugDepth) {
            gl_FragColor = vec4(vec3(depth), 1.0);
            return;
          }
          
          // Use depth directly as blur amount
          // depth is 0 (near) to 1 (far)
          float blurSize = depth * maxBlurSize;
          
          // Simple box blur
          vec2 texelSize = 1.0 / resolution;
          vec4 result = vec4(0.0);
          float total = 0.0;
          
          // Variable sample count based on blur size
          int sampleCount = int(mix(1.0, 9.0, depth));
          
          if (sampleCount == 1) {
            gl_FragColor = texture2D(tDiffuse, vUv);
            return;
          }
          
          // Box blur with variable size
          for(int x = -4; x <= 4; x++) {
            for(int y = -4; y <= 4; y++) {
              // Skip samples outside our sample count
              if (abs(x) > sampleCount/2 || abs(y) > sampleCount/2) continue;
              
              vec2 offset = vec2(float(x), float(y)) * texelSize * blurSize;
              result += texture2D(tDiffuse, vUv + offset);
              total += 1.0;
            }
          }
          
          gl_FragColor = result / total;
        }
      `
    });
    
    // Create fullscreen quad
    this.fsQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.material
    );
    
    this.fsScene = new THREE.Scene();
    this.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene.add(this.fsQuad);
  }
  
  excludeLayer(layer) {
    this.excludedLayers.add(layer);
  }
  
  setMaxBlurSize(size) {
    this.maxBlurSize = size;
    this.material.uniforms.maxBlurSize.value = size;
  }
  
  toggleDebugDepth() {
    this.material.uniforms.debugDepth.value = !this.material.uniforms.debugDepth.value;
  }
  
  render(renderer, writeBuffer, readBuffer) {
    // Hide excluded layers for depth rendering
    if (this.excludedLayers.size > 0) {
      this.scene.traverse(object => {
        if (object.layers) {
          for (let layer of this.excludedLayers) {
            if (object.layers.test({mask: 1 << layer})) {
              this.originalVisibility.set(object, object.visible);
              object.visible = false;
              break;
            }
          }
        }
      });
    }
    
    // 1. Render depth
    renderer.setRenderTarget(this.depthRenderTarget);
    const oldOverrideMaterial = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.depthMaterial;
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = oldOverrideMaterial;
    
    // Restore visibility
    if (this.originalVisibility.size > 0) {
      this.originalVisibility.forEach((visible, object) => {
        object.visible = visible;
      });
      this.originalVisibility.clear();
    }
    
    // 2. Apply blur based on depth
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    
    renderer.render(this.fsScene, this.fsCamera);
  }
  
  setSize(width, height) {
    this.depthRenderTarget.setSize(width, height);
    this.material.uniforms.resolution.value.set(width, height);
  }
  
  dispose() {
    this.depthRenderTarget.dispose();
    this.depthMaterial.dispose();
    this.material.dispose();
    this.fsQuad.geometry.dispose();
  }
}

// Usage in app.js:
/*
import { DepthDrivenBlurPass } from './depth-driven-blur-pass.js';

// In setupPostProcessing():
const depthBlurPass = new DepthDrivenBlurPass(scene, camera, 5.0); // 5.0 = max blur size
depthBlurPass.excludeLayer(LAYERS.DOFIGNORE);
composer.addPass(depthBlurPass);
composer.addPass(bloomPass);

// Press 'D' to toggle depth visualization:
document.addEventListener('keydown', (e) => {
  if (e.key === 'd') {
    depthBlurPass.toggleDebugDepth();
  }
});

// Change blur amount dynamically:
depthBlurPass.setMaxBlurSize(10.0);

// In onWindowResize():
depthBlurPass.setSize(window.innerWidth, window.innerHeight);
*/
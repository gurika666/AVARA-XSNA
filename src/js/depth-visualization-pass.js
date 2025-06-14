// depth-visualization-pass.js - Complete file with layer exclusion
import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export class SimpleDepthPass extends Pass {
  constructor(scene, camera) {
    super();
    
    this.scene = scene;
    this.camera = camera;
    
    // Layer exclusion properties
    this.excludedLayers = new Set();
    this.originalVisibility = new Map();
    
    // Create shader material for visualization
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        showDepth: { value: true },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far }
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
        uniform bool showDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        varying vec2 vUv;
        
        // Declare functions before using them
        float perspectiveDepthToViewZ(float invClipZ, float near, float far) {
          return (near * far) / ((far - near) * invClipZ - far);
        }
        
        float viewZToOrthographicDepth(float viewZ, float near, float far) {
          return (viewZ + near) / (near - far);
        }
        
        float readDepth(sampler2D depthSampler, vec2 coord) {
          float fragCoordZ = texture2D(depthSampler, coord).x;
          float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
          return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
        }
        
        void main() {
          if (showDepth) {
            float depth = readDepth(tDepth, vUv);
            // Invert and apply gamma for better visualization
            depth = 1.0 - depth;
            depth = pow(depth, 0.5);
            gl_FragColor = vec4(vec3(depth), 1.0);
          } else {
            gl_FragColor = texture2D(tDiffuse, vUv);
          }
        }
      `
    });
    
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
    
    // Set depth texture
    this.material.uniforms.tDepth.value = this.depthRenderTarget.texture;
    
    // Create a simple quad to render to
    this.fsQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.material
    );
    
    this.fsScene = new THREE.Scene();
    this.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene.add(this.fsQuad);
  }
  
  // Method to exclude a layer from depth rendering
  excludeLayer(layer) {
    this.excludedLayers.add(layer);
  }
  
  // Method to include a layer back in depth rendering
  includeLayer(layer) {
    this.excludedLayers.delete(layer);
  }
  
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    // Hide objects on excluded layers before rendering
    if (this.excludedLayers.size > 0) {
      this.scene.traverse(object => {
        if (object.layers) {
          // Check if object is on any excluded layer
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
    
    // 1. Render depth to texture
    renderer.setRenderTarget(this.depthRenderTarget);
    
    const oldOverrideMaterial = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.depthMaterial;
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = oldOverrideMaterial;
    
    // 2. Set input texture
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    
    // 3. Render to output
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    
    renderer.render(this.fsScene, this.fsCamera);
    
    // Restore visibility after rendering
    if (this.originalVisibility.size > 0) {
      this.originalVisibility.forEach((visible, object) => {
        object.visible = visible;
      });
      this.originalVisibility.clear();
    }
  }
  
  setSize(width, height) {
    this.depthRenderTarget.setSize(width, height);
  }
  
  toggleDepthView() {
    this.material.uniforms.showDepth.value = !this.material.uniforms.showDepth.value;
  }
  
  dispose() {
    this.depthRenderTarget.dispose();
    this.depthMaterial.dispose();
    this.material.dispose();
    this.fsQuad.geometry.dispose();
  }
}

// Even simpler version - just for testing
export class BasicDepthPass extends Pass {
  constructor(scene, camera) {
    super();
    
    this.scene = scene;
    this.camera = camera;
    this.showDepth = true;
    
    // Simple depth material
    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    });
    
    // Layer exclusion properties
    this.excludedLayers = new Set();
    this.originalVisibility = new Map();
  }
  
  // Method to exclude a layer from depth rendering
  excludeLayer(layer) {
    this.excludedLayers.add(layer);
  }
  
  // Method to include a layer back in depth rendering
  includeLayer(layer) {
    this.excludedLayers.delete(layer);
  }
  
  render(renderer, writeBuffer, readBuffer) {
    if (this.showDepth) {
      // Hide objects on excluded layers before rendering
      if (this.excludedLayers.size > 0) {
        this.scene.traverse(object => {
          if (object.layers) {
            // Check if object is on any excluded layer
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
      
      // Render depth directly
      const oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.depthMaterial;
      
      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
      } else {
        renderer.setRenderTarget(writeBuffer);
      }
      
      renderer.render(this.scene, this.camera);
      this.scene.overrideMaterial = oldOverrideMaterial;
      
      // Restore visibility after rendering
      if (this.originalVisibility.size > 0) {
        this.originalVisibility.forEach((visible, object) => {
          object.visible = visible;
        });
        this.originalVisibility.clear();
      }
    } else {
      // Pass through
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      renderer.render(this.scene, this.camera);
    }
  }
  
  toggleDepthView() {
    this.showDepth = !this.showDepth;
  }
}

// Usage:
/*
import { BasicDepthPass, SimpleDepthPass } from './depth-visualization-pass.js';

// Define layers
const LAYERS = {
  DOFIGNORE: 2
};

// In setupPostProcessing():
const depthPass = new SimpleDepthPass(scene, camera);
depthPass.excludeLayer(LAYERS.DOFIGNORE);
composer.addPass(depthPass);

// Set layers on objects:
skyPlane.layers.set(LAYERS.DOFIGNORE);

// Press 'D' to toggle
document.addEventListener('keydown', (e) => {
  if (e.key === 'd') {
    depthPass.toggleDepthView();
  }
});
*/
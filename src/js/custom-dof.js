// depth-driven-blur-pass.js - Enhanced depth-based blur with smooth transitions
import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export class DepthDrivenBlurPass extends Pass {
  constructor(scene, camera, maxBlurSize = 10.0) {
    super();
    
    this.scene = scene;
    this.camera = camera;
    this.maxBlurSize = maxBlurSize;
    
    // Blur quality settings
    this.directions = 16.0;
    this.quality = 3.0;
    
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
    
    // Create blur shader material with radial gaussian blur
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: this.depthRenderTarget.texture },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        maxBlurSize: { value: maxBlurSize },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        directions: { value: this.directions },
        quality: { value: this.quality },
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
        uniform float directions;
        uniform float quality;
        uniform bool debugDepth;
        varying vec2 vUv;
        
        const float Pi = 6.28318530718; // Pi*2
        
        // Get depth value with smooth transitions
        float readDepth(vec2 coord) {
          float fragCoordZ = texture2D(tDepth, coord).x;
          float viewZ = (cameraNear * cameraFar) / ((cameraFar - cameraNear) * fragCoordZ - cameraFar);
          
          // Linear depth (0 = near, 1 = far)
          float linearDepth = (- viewZ - cameraNear ) / (cameraFar  - cameraNear);
          
          // Simple smooth transition using smoothstep
          // return smoothstep(0.1, 0.9, linearDepth);
          return pow(linearDepth * 10.0, 0.5);
        }
        
        void main() {
          float depth = readDepth(vUv);
          
          // Debug mode - show depth
          if (debugDepth) {
            gl_FragColor = vec4(vec3(depth), 1.0);
            return;
          }
          
          // Calculate blur radius based on depth
          // depth is 0 (near) to 1 (far) but now smoothed
          float blurSize = depth * maxBlurSize;
          vec2 radius = blurSize / resolution;
          
          // Start with center sample
          vec4 color = texture2D(tDiffuse, vUv);
          
          // Early exit for no blur
          if (blurSize < 0.1) {
            gl_FragColor = color;
            return;
          }
          
          // Radial gaussian blur
          for(float d = 0.0; d < Pi; d += Pi / directions) {
            for(float i = 1.0 / quality; i <= 1.0; i += 1.0 / quality) {
              vec2 offset = vec2(cos(d), sin(d)) * radius * i;
              color += texture2D(tDiffuse, vUv + offset);
            }
          }
          
          // Normalize (accounting for all samples including center)
          color /= quality * directions - 15.0;
          gl_FragColor = color;
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
  
  setBlurQuality(directions, quality) {
    this.directions = directions;
    this.quality = quality;
    this.material.uniforms.directions.value = directions;
    this.material.uniforms.quality.value = quality;
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
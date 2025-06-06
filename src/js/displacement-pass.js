import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Custom shader pass for texture-based displacement effect
 */
class DisplacementPass extends ShaderPass {
  constructor(displacementMap, displacementScale = 0.1) {
    // Define the shader
    const shader = {
      uniforms: {
        'tDiffuse': { value: null },
        'tDisplacement': { value: null },
        'scale': { value: displacementScale },
        'time': { value: 0 },
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
        uniform vec2 resolution;
        varying vec2 vUv;

        void main() {
          // Sample the displacement map
          vec4 displacement = texture2D(tDisplacement, vUv);
          
          // Calculate displacement vector (using the red and green channels)
          vec2 displacementVector = (displacement.rg - 0.5) * 2.0 * scale;
          
          // Apply displacement to UV coordinates
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
  }

  // Update method to animate the displacement
  update(renderer, time, displacementScale) {
    // Update uniforms
    this.uniforms.time.value = time * 0.001; // Convert to seconds
    if (displacementScale !== undefined) {
      this.uniforms.scale.value = displacementScale;
    }
    
    // Update resolution if needed
    if (renderer) {
      const size = renderer.getSize(new THREE.Vector2());
      this.uniforms.resolution.value.set(size.width, size.height);
    }
  }
}

export { DisplacementPass };
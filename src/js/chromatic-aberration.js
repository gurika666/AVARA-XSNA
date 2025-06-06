import { ShaderMaterial, Vector2, UniformsUtils } from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Chromatic aberration shader that only affects bright areas
const ChromaticAberrationShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'resolution': { value: new Vector2(128, 128) },
    'aberrationStrength': { value: 10.1 },
    'brightnessThreshold': { value: 0.001 } // Threshold to determine "bright" pixels
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float aberrationStrength;
    uniform float brightnessThreshold;
    varying vec2 vUv;

    // Function to calculate perceived brightness
    float luminarc(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 uv = vUv;
      vec2 distFromCenter = uv - 0.5;
      float distSquared = dot(distFromCenter, distFromCenter);
      
      // Sample the center pixel's color
      vec4 centerColor = texture2D(tDiffuse, uv);
      float brightness = luminarc(centerColor.rgb);
      
      // Calculate how much aberration to apply based on brightness
      float aberrationMask = smoothstep(brightnessThreshold, brightnessThreshold + 0.2, brightness);
      
      // We also want to apply aberration to edges of bright areas
      vec2 pixelSize = 1.0 / resolution;
      vec4 north = texture2D(tDiffuse, uv + vec2(0.0, pixelSize.y));
      vec4 east = texture2D(tDiffuse, uv + vec2(pixelSize.x, 0.0));
      vec4 south = texture2D(tDiffuse, uv - vec2(0.0, pixelSize.y));
      vec4 west = texture2D(tDiffuse, uv - vec2(pixelSize.x, 0.0));
      
      float northBrightness = luminarc(north.rgb);
      float eastBrightness = luminarc(east.rgb);
      float southBrightness = luminarc(south.rgb);
      float westBrightness = luminarc(west.rgb);
      
      // Calculate brightness gradient
      float dx = eastBrightness - westBrightness;
      float dy = northBrightness - southBrightness;
      float gradient = sqrt(dx * dx + dy * dy)*2.;
      
      // Edge detection - apply aberration to high contrast edges
      float edgeMask = smoothstep(0.05, 0.2, gradient);
      
      // Combine both masks: brightness and edge
      float finalMask = max(aberrationMask, edgeMask * 0.75);
      
      // Apply strength modulation based on distance from center and our mask
      float strength = aberrationStrength * (1.0 + distSquared * 2.0) * finalMask;
      
      if (strength > 0.001) {
        // Sample each color channel with offset
        float red = texture2D(tDiffuse, uv - distFromCenter * strength).r*2.;
        float green = texture2D(tDiffuse, uv).g;
        float blue = texture2D(tDiffuse, uv + distFromCenter * strength).b*2.;
        gl_FragColor = vec4(red, green, blue, 1.0);
      } else {
        // No aberration for darker areas
        gl_FragColor = centerColor;
      }
    }
  `
};

// ChromaticAberrationPass class
class ChromaticAberrationPass extends ShaderPass {
  constructor(strength = 0.01, brightnessThreshold = 0.5) {
    super(ChromaticAberrationShader);
    this.uniforms['aberrationStrength'].value = strength;
    this.uniforms['brightnessThreshold'].value = brightnessThreshold;
  }
  
  // Update method to set resolution, strength and threshold
  update(renderer, width, height, strength, threshold) {
    if (width && height) {
      this.uniforms['resolution'].value.set(width, height);
    }
    if (strength !== undefined) {
      this.uniforms['aberrationStrength'].value = strength;
    }
    if (threshold !== undefined) {
      this.uniforms['brightnessThreshold'].value = threshold;
    }
  }
}

export { ChromaticAberrationPass };
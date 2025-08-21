// shader-manager.js - Simplified star shader with colored dots
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// SIMPLE QUALITY CONTROL
export const SHADER_QUALITY = 1.0; // Increased back to normal since we simplified the shader

// Shader definitions
const shaders = {
  // Chromatic Aberration Shader (unchanged)
  chromaticAberration: {
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2(128 * SHADER_QUALITY, 128 * SHADER_QUALITY) },
      aberrationStrength: { value: 10.1 },
      brightnessThreshold: { value: 0.001 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      uniform float aberrationStrength;
      uniform float brightnessThreshold;
      varying vec2 vUv;
      
      float luminarc(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      
      void main() {
        vec2 uv = vUv;
        vec2 distFromCenter = uv - 0.5;
        float distSquared = dot(distFromCenter, distFromCenter);
        vec4 centerColor = texture2D(tDiffuse, uv);
        float brightness = luminarc(centerColor.rgb);
        float aberrationMask = smoothstep(brightnessThreshold, brightnessThreshold + 0.2, brightness);
        
        vec2 pixelSize = 1.0 / resolution;
        float dx = luminarc(texture2D(tDiffuse, uv + vec2(pixelSize.x, 0.0)).rgb) - 
                   luminarc(texture2D(tDiffuse, uv - vec2(pixelSize.x, 0.0)).rgb);
        float dy = luminarc(texture2D(tDiffuse, uv + vec2(0.0, pixelSize.y)).rgb) - 
                   luminarc(texture2D(tDiffuse, uv - vec2(0.0, pixelSize.y)).rgb);
        float gradient = sqrt(dx * dx + dy * dy) * 2.0;
        float edgeMask = smoothstep(0.05, 0.2, gradient);
        float finalMask = max(aberrationMask, edgeMask * 0.75);
        float strength = aberrationStrength * (1.0 + distSquared * 2.0) * finalMask;
        
        if (strength > 0.001) {
          float r = texture2D(tDiffuse, uv - distFromCenter * strength).r * 2.0;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv + distFromCenter * strength).b * 2.0;
          gl_FragColor = vec4(r, g, b, 1.0);
        } else {
          gl_FragColor = centerColor;
        }
      }`
  },

  // Cursor Plane Shader (unchanged)
  cursorPlane: {
    uniforms: {
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uViewportSize: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0.0 },
      uRgbSpacingMin: { value: 0.10 },
      uRgbSpacingMax: { value: 0.25 },
      uRgbSpacingSpeed: { value: 0.5 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(pos.x, pos.y, pos.w * 0.999999, pos.w);
      }`,
    fragmentShader: `
      uniform vec2 uMouse;
      uniform vec2 uViewportSize;
      uniform float uTime;
      uniform float uRgbSpacingMin;
      uniform float uRgbSpacingMax;
      uniform float uRgbSpacingSpeed;
      varying vec2 vUv;
      
      void main() {
        vec2 uv = vUv;
        vec2 center = uMouse;
        float ellipseRadius = 0.02;
        float blurAmount = 0.08;
        
        float radiusAnimation = (sin(uTime * 0.9) + 1.0) * 0.5;
        float circleRadius = mix(0.45, 0.55, radiusAnimation);
        
        vec2 mouseFromCenter = uMouse - vec2(0.5, 0.5);
        float mouseDistance = length(mouseFromCenter);
        float globalOpacity = mix(0.0, 0.2, smoothstep(0.0, 0.8, mouseDistance));
        
        float spacingAnimation = (sin(uTime * uRgbSpacingSpeed) + 1.0) * 0.5;
        float rgbSpacing = mix(uRgbSpacingMin, uRgbSpacingMax, spacingAnimation);
        float globalRotation = atan(mouseFromCenter.y, mouseFromCenter.x) * 2.0;
        
        vec3 finalColor = vec3(0.0);
        float totalAlpha = 0.0;
        
        for(int group = 0; group < 8; group++) {
          float groupAngle = float(group) * 3.14159 * 2.0 / 8.0 + globalRotation / 2.0;
          vec2 groupCenter = center + circleRadius * vec2(cos(groupAngle), sin(groupAngle));
          
          for(int colorIndex = 0; colorIndex < 3; colorIndex++) {
            float offset = (float(colorIndex) - 1.0) * rgbSpacing;
            vec2 ellipsePos = groupCenter + offset * vec2(cos(groupAngle), sin(groupAngle));
            vec2 ellipseScale = vec2(2.5, 0.5);
            
            vec2 diff = uv - ellipsePos;
            float rotAngle = atan(ellipsePos.y - center.y, ellipsePos.x - center.x);
            float cosR = cos(-rotAngle);
            float sinR = sin(-rotAngle);
            vec2 rotatedDiff = vec2(diff.x * cosR - diff.y * sinR, diff.x * sinR + diff.y * cosR);
            float dist = length(rotatedDiff / ellipseScale);
            float intensity = 1.0 - smoothstep(ellipseRadius - blurAmount, ellipseRadius + blurAmount, dist);
            
            vec3 color = colorIndex == 0 ? vec3(1.0, 0.2, 0.2) : 
                        (colorIndex == 1 ? vec3(0.2, 1.0, 0.2) : vec3(0.2, 0.2, 1.0));
            finalColor += color * intensity;
            totalAlpha = max(totalAlpha, intensity);
          }
        }
        gl_FragColor = vec4(finalColor * globalOpacity, totalAlpha * globalOpacity);
      }`
  },

  // Sky/Cloud Shader (unchanged)
  skyCloud: {
    uniforms: {
      time: { value: 0.0 },
      resolution: { value: new THREE.Vector2(window.innerWidth * SHADER_QUALITY, window.innerHeight * SHADER_QUALITY) },
      cloudColor: { value: new THREE.Vector3(1, 1, 1) },
      skyTopColor: { value: new THREE.Vector3(0.09, 0.45, 0.9) },
      skyBottomColor: { value: new THREE.Vector3(0, 0.45, 0.7) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      uniform vec2 resolution;
      uniform vec3 cloudColor;
      uniform vec3 skyTopColor;
      uniform vec3 skyBottomColor;
      varying vec2 vUv;
      
      float cloudyNoise(vec2 uv) {
        float sx = cos(500.0 * uv.x);
        float sy = sin(500.0 * uv.y);
        sx = mix(sx, cos(uv.y * 1000.0), 0.5);
        sy = mix(sy, sin(uv.x * 1000.0), 0.5);
        vec2 b = vec2(sx, sy);
        vec2 bn = normalize(b);
        vec2 l = uv - vec2(sin(b.x), cos(b.y));
        return length(l - b) - 0.5;
      }
      
      float cloudyFbm(vec2 uv) {
        float f = 0.0;
        vec2 rotator = vec2(0.91, 1.5);
        for (int i = 0; i < 5; ++i) {
          vec2 tmp = uv;
          uv.x = tmp.x * rotator.x - tmp.y * rotator.y;
          uv.y = tmp.x * rotator.y + tmp.y * rotator.x;
          f += 0.5 * cloudyNoise(uv) * pow(0.5, float(i + 1));
        }
        return f;
      }
      
      float clouds(vec2 uv) {
        float T = time * 0.1;
        float x = 0.0;
        x += cloudyFbm(0.5 * uv + vec2(0.1, -0.01) * T) * 0.5;
        x += cloudyFbm(1.0 * uv + vec2(0.12, 0.03) * T) * 0.25;
        x += cloudyFbm(2.0 * uv + vec2(0.15, -0.02) * T) * 0.125;
        x += cloudyFbm(4.0 * uv + vec2(0.2, 0.01) * T) * 0.0625;
        x += cloudyFbm(8.0 * uv + vec2(0.15, -0.01) * T) * 0.03125;
        x = smoothstep(0.0, 0.6, x);
        float f = 0.6;
        x = (x - f) / (1.0 - f);
        float _x = x;
        x = smoothstep(0.4, 0.55, x);
        return x * _x;
      }
      
      void main() {
        vec2 uv = vUv;
        vec2 ouv = uv;
        uv -= vec2(0.5);
        uv.y *= resolution.x / resolution.y;
        vec2 _uv = uv * 0.007;
        
        float x = clouds(_uv);
        vec3 skyColor = mix(skyTopColor, skyBottomColor, smoothstep(0.5, 1.0, ouv.x));
        vec3 color = skyColor;
        color += x * cloudColor;
        color = mix(x * cloudColor, color, 1.0 - x);
        
        vec2 ld = 0.005 * normalize(vec2(1.0, 1.0)) * 0.01;
        float f = 0.0;
        for (int i = 1; i <= 4; ++i) {
          float c = clouds(_uv - float(i * i) * ld) * pow(0.55, float(i));
          f += max(c, 0.0);
        }
        f = clamp(f, 0.0, 1.0);
        f = 1.0 - f;
        f = pow(f, 1.2);
        color += f * x * 0.5 * cloudColor;
        
        gl_FragColor = vec4(color, 1.0);
      }`
  }
};

// Shader Pass Classes (unchanged)
class ChromaticAberrationPass extends ShaderPass {
  constructor(strength = 0.01, threshold = 0.5) {
    super(shaders.chromaticAberration);
    this.uniforms.aberrationStrength.value = strength;
    this.uniforms.brightnessThreshold.value = threshold;
  }
  
  update(renderer, width, height, strength, threshold) {
    if (width && height) this.uniforms.resolution.value.set(width * SHADER_QUALITY, height * SHADER_QUALITY);
    if (strength !== undefined) this.uniforms.aberrationStrength.value = strength;
    if (threshold !== undefined) this.uniforms.brightnessThreshold.value = threshold;
  }
}

// Cursor Plane Manager (unchanged)
class CursorPlane {
  constructor() {
    this.plane = null;
    this.material = null;
    this.mousePosition = new THREE.Vector2(0.5, 0.5);
  }

  init(scene, camera) {
    this.material = new THREE.ShaderMaterial({
      ...shaders.cursorPlane,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.plane.renderOrder = Number.MAX_SAFE_INTEGER;
    scene.add(this.plane);

    document.addEventListener('mousemove', e => this.updateMouse(e.clientX, e.clientY));
    document.addEventListener('touchmove', e => {
      if (e.touches.length > 0) {
        e.preventDefault();
        this.updateMouse(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    
    window.addEventListener('resize', () => this.updateViewport());
    this.updateViewport();
    this.updatePosition(camera);
  }

  updateMouse(x, y) {
    this.mousePosition.set(x / window.innerWidth, 1.0 - (y / window.innerHeight));
    if (this.material) this.material.uniforms.uMouse.value = this.mousePosition;
  }

  updateViewport() {
    if (this.material) {
      this.material.uniforms.uViewportSize.value.set(window.innerWidth * SHADER_QUALITY, window.innerHeight * SHADER_QUALITY);
    }
  }

  updatePosition(camera) {
    if (!this.plane) return;
    const dist = 0.5;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(dist);
    this.plane.position.copy(camera.position).add(forward);
    this.plane.quaternion.copy(camera.quaternion);
    const scale = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
    this.plane.scale.set(scale * camera.aspect, scale, 1);
  }

  update(camera, dt = 1/60) {
    if (!this.plane || !this.material) return;
    this.material.uniforms.uTime.value += dt;
    this.updatePosition(camera);
  }
}

// Sky/Cloud Plane Factory (unchanged)
function createSkyPlane(options = {}) {
  const { width = 10, height = 10, position = new THREE.Vector3(0, 0, -5), 
          rotation = new THREE.Euler(0, 0, 0), colors = {} } = options;
  
  const material = new THREE.ShaderMaterial({
    ...shaders.skyCloud,
    transparent: true
  });
  
  ['cloudColor', 'skyTopColor', 'skyBottomColor'].forEach(key => {
    if (colors[key]) {
      const c = colors[key] instanceof THREE.Color ? colors[key] : new THREE.Color(colors[key]);
      material.uniforms[key].value.set(c.r, c.g, c.b);
    }
  });
  
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.copy(position);
  mesh.rotation.copy(rotation);
  return mesh;
}

// Update cloud uniforms helper (unchanged)
function updateCloudUniforms(material, time, width, height) {
  if (material?.uniforms) {
    material.uniforms.time.value = time;
    material.uniforms.resolution.value.set(width * SHADER_QUALITY, height * SHADER_QUALITY);
  }
}





// ENHANCED Star Nest Material Class with VIBRANT COLORFUL NEBULA
class StarNestMaterial extends THREE.MeshPhysicalMaterial {
  constructor(options = {}) {
    const {
      metalness = 1.0,
      roughness = 0.5,
      envMapIntensity = 0.15,
      velocity = 0.025,
      numStars = 80.0,
      starSize = 0.02,
      glowIntensity = 1.0,
      glowRadius = 3.0,
      enableSpikes = true,
      spikeTwinkleSpeed = 3.0,
      maskTexture = null,
      // MORE VIBRANT DEFAULT COLORS
      nebulaColor1 = new THREE.Vector3(0.9, 0.3, 0.6),  // Bright pink-magenta
      nebulaColor2 = new THREE.Vector3(0.2, 0.6, 1.0),  // Bright cyan-blue
      nebulaColor3 = new THREE.Vector3(1.0, 0.5, 0.2),  // Orange-gold (NEW)
      nebulaIntensity = 0.8,  // NEW: Overall nebula brightness (0.3 to 1.5)
      nebulaSaturation = 1.5, // NEW: Color saturation boost (1.0 to 2.0)
    } = options;

    super({
      color: new THREE.Color(0x000000),
      metalness,
      roughness,
      envMapIntensity,
    });

    // Store options
    this.starNestOptions = {
      velocity,
      numStars,
      starSize,
      glowIntensity,
      glowRadius,
      enableSpikes,
      spikeTwinkleSpeed,
      maskTexture,
      nebulaColor1,
      nebulaColor2,
      nebulaColor3,
      nebulaIntensity,
      nebulaSaturation
    };

    // Create default white texture for when no mask is provided
    this.defaultMaskTex = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]), 
      1, 
      1, 
      THREE.RGBAFormat
    );
    this.defaultMaskTex.needsUpdate = true;

    // Load mask texture if provided
    if (typeof maskTexture === 'string') {
      const textureLoader = new THREE.TextureLoader();
      this.starNestOptions.maskTexture = textureLoader.load(maskTexture);
    }

    this.setupShader();
  }

  setupShader() {
    const options = this.starNestOptions;
    const maskTex = options.maskTexture || this.defaultMaskTex;

    this.onBeforeCompile = (shader) => {
      // Add uniforms
      shader.uniforms.time = { value: 0 };
      shader.uniforms.resolution = { value: new THREE.Vector2(window.innerWidth, window.innerHeight) };
      shader.uniforms.mouse = { value: new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5) };
      shader.uniforms.velocity = { value: options.velocity };
      shader.uniforms.numStars = { value: options.numStars };
      shader.uniforms.starSize = { value: options.starSize };
      shader.uniforms.glowIntensity = { value: options.glowIntensity };
      shader.uniforms.glowRadius = { value: options.glowRadius };
      shader.uniforms.enableSpikes = { value: options.enableSpikes ? 1.0 : 0.0 };
      shader.uniforms.spikeTwinkleSpeed = { value: options.spikeTwinkleSpeed };
      shader.uniforms.swirlAmount = { value: 2.5 };
      shader.uniforms.swirlSpeed = { value: 1.3 };
      shader.uniforms.maskTexture = { value: maskTex };
      shader.uniforms.nebulaColor1 = { value: options.nebulaColor1 };
      shader.uniforms.nebulaColor2 = { value: options.nebulaColor2 };
      shader.uniforms.nebulaColor3 = { value: options.nebulaColor3 };
      shader.uniforms.nebulaIntensity = { value: options.nebulaIntensity };
      shader.uniforms.nebulaSaturation = { value: options.nebulaSaturation };

      // Store uniforms reference
      this.userData.uniforms = shader.uniforms;

      // Add vertex shader modifications
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec2 vScreenPosition;
        varying vec2 vUv;`
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 clipPos = projectionMatrix * mvPosition;
        vScreenPosition = clipPos.xy / clipPos.w;
        vUv = uv;`
      );

      // Enhanced star fragment shader with COLORFUL NEBULA
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        
        uniform float time;
        uniform vec2 resolution;
        uniform vec2 mouse;
        uniform float velocity;
        uniform float numStars;
        uniform float starSize;
        uniform float glowIntensity;
        uniform float glowRadius;
        uniform float enableSpikes;
        uniform float spikeTwinkleSpeed;
        uniform float swirlAmount;
        uniform float swirlSpeed;
        uniform sampler2D maskTexture;
        uniform vec3 nebulaColor1;
        uniform vec3 nebulaColor2;
        uniform vec3 nebulaColor3;
        uniform float nebulaIntensity;
        uniform float nebulaSaturation;
        
        varying vec2 vScreenPosition;
        varying vec2 vUv;
        
        // Simple hash function for randomness
        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        
        // Simple 2D rotation
        vec2 rotate2D(vec2 p, float angle) {
            float s = sin(angle);
            float c = cos(angle);
            return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
        }
        
        // Simplified 2D noise for nebula (much faster than 3D simplex)
        float simpleNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            
            // Four corners
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            
            // Smooth interpolation
            vec2 u = f * f * (3.0 - 2.0 * f);
            
            return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        
        // Simple fractal noise (2 octaves only for performance)
        float simpleFBM(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            
            value += simpleNoise(p) * amplitude;
            p *= 5.0;
            amplitude *= 0.2;
            
            value += simpleNoise(p) * amplitude;
            
            return value;
        }
        
        // Enhanced glow function with PROPERLY TWINKLING SPIKES
        float calculateStarGlow(vec2 pos, float coreSize, float glowSize, float spikeLength, float twinkle, float animTime) {
            float dist = length(pos);
            
            // Softer core with smoother falloff
            float core = 1.0 - smoothstep(0.0, coreSize * 1.5, dist);
            core = pow(core, 1.5); // Softer power curve
            
            // Much softer, more gradual glow
            float glow = 1.0 - smoothstep(coreSize * 0.5, glowSize * 2.0, dist);
            glow = pow(glow, 3.5); // Higher power for softer falloff
            
            // Additional soft outer halo
            float outerHalo = 1.0 - smoothstep(glowSize * 0.5, glowSize * 3.0, dist);
            outerHalo = pow(outerHalo, 5.0); // Very soft outer edge
            
            // PROPERLY ANIMATED TWINKLING 4-SIDED SPIKES
            float spikes = 0.0;
            
            // Calculate twinkle animation (moved here for proper animation)
            float twinklePhase = sin(animTime + twinkle * 6.28) * 0.5 + 0.5; // 0 to 1 range
            float spikeBrightness = 0.1 + twinklePhase * 0.9; // 30% to 100% brightness
            
            // Horizontal spike (along X axis) - length varies by spikeLength parameter
            if(abs(pos.y) < coreSize * 3.0) {
                float hSpike = exp(-abs(pos.x) / (glowSize * spikeLength)) * exp(-abs(pos.y) * 3.0 / coreSize);
                hSpike *= 1.0 - smoothstep(0.0, glowSize * spikeLength * 4.0, abs(pos.x));
                spikes += hSpike * spikeBrightness; // Apply animated brightness
            }
            
            // Vertical spike (along Y axis)
            if(abs(pos.x) < coreSize * 3.0) {
                float vSpike = exp(-abs(pos.y) / (glowSize * spikeLength)) * exp(-abs(pos.x) * 3.0 / coreSize);
                vSpike *= 1.0 - smoothstep(0.0, glowSize * spikeLength * 4.0, abs(pos.y));
                spikes += vSpike * spikeBrightness; // Apply animated brightness
            }
            
            // Combine all components with softer blending
            return core * 0.8 + glow * 0.3 + outerHalo * 0.2 + spikes * 0.4;
        }
        
        // Saturation adjustment function
        vec3 adjustSaturation(vec3 color, float saturation) {
            float gray = dot(color, vec3(0.299, 0.587, 0.114));
            return mix(vec3(gray), color, saturation);
        }
        
        vec3 getSimpleStarField() {
            vec2 fragCoord = (vScreenPosition * 0.5 + 0.5) * resolution;
            vec2 uv = (fragCoord - 0.5 * resolution.xy) / resolution.y;
            
            // Simple mouse influence
            vec2 M = (mouse.xy - resolution.xy * 0.5) / resolution.y * 0.2;
            
            float t = time * velocity;
            vec3 col = vec3(0);
            
            // ENHANCED COLORFUL NEBULA LAYERS
            // Layer 1: Main nebula cloud with color variation
            vec2 nebulaUV1 = uv * 2.5 + M * 0.3;
            float nebula1 = simpleFBM(nebulaUV1 + vec2(t * 0.05, t * 0.03));
            float nebula1Raw = nebula1; // Keep raw value for color mixing
            nebula1 = smoothstep(0.15, 0.85, nebula1); // Wider range for more variation
            
            // Layer 2: Secondary nebula with different movement
            vec2 nebulaUV2 = uv * 3.0 - M * 0.2;
            float nebula2 = simpleFBM(nebulaUV2 + vec2(-t * 0.04, t * 0.06));
            float nebula2Raw = nebula2;
            nebula2 = smoothstep(0.25, 0.75, nebula2);
            
            // Layer 3: Fine detail nebula for color variation
            vec2 nebulaUV3 = uv * 5.0 + M * 0.1;
            float nebula3 = simpleFBM(nebulaUV3 + vec2(t * 0.02, -t * 0.08));
            nebula3 = smoothstep(0.3, 0.7, nebula3);
            
            // Create complex color variations
            // Use three colors for more variety
            vec3 nebulaCol = vec3(0.0);
            
            // Mix colors based on different noise patterns
            float colorMix1 = sin(nebula1Raw * 3.14159 + t * 0.1) * 0.5 + 0.5;
            float colorMix2 = cos(nebula2Raw * 3.14159 * 1.5 - t * 0.15) * 0.5 + 0.5;
            
            // Create primary nebula color with smooth gradients
            vec3 primaryColor = mix(nebulaColor1, nebulaColor2, colorMix1);
            vec3 secondaryColor = mix(nebulaColor2, nebulaColor3, colorMix2);
            
            // Blend the colors based on nebula density
            nebulaCol = mix(primaryColor, secondaryColor, nebula3 * 0.7);
            
            // Add color variations based on position for more organic look
            float positionVariation = sin(length(uv) * 2.0 + t * 0.05) * 0.5 + 0.5;
            nebulaCol = mix(nebulaCol, nebulaColor3, positionVariation * 0.3);
            
            // Boost saturation
            nebulaCol = adjustSaturation(nebulaCol, nebulaSaturation);
            
            // Combine nebula layers with enhanced intensity
            float nebulaCombined = (nebula1 * 0.7 + nebula2 * 0.5 + nebula3 * 0.3);
            
            // Add bright colored spots in the nebula
            float brightSpots = pow(max(0.0, nebula1 - 0.5), 2.0) * 4.0;
            vec3 brightSpotColor = mix(vec3(1.0, 0.7, 0.4), vec3(0.4, 0.7, 1.0), colorMix1);
            nebulaCol += brightSpotColor * brightSpots * 0.5;
            
            // Add subtle color bands for more variation
            float bands = sin(uv.y * 10.0 + nebula1 * 5.0 + t * 0.1) * 0.5 + 0.5;
            vec3 bandColor = mix(nebulaColor1, nebulaColor3, bands);
            nebulaCol = mix(nebulaCol, bandColor, 0.15);
            
            // Apply nebula to background with increased intensity
            col += nebulaCol * nebulaCombined * nebulaIntensity;
            
            // Add subtle dark gradient for depth (reduced to preserve color)
            float vignette = 1.0 - length(uv + M) * 0.2; // Reduced from 0.3
            col *= vignette;
            
            // Add a subtle color glow to dark areas
            vec3 ambientGlow = mix(nebulaColor1, nebulaColor2, 0.5) * 0.05;
            col += ambientGlow * (1.0 - nebulaCombined);
            
            // Create simple star dots in layers with SWIRL and ENHANCED GLOW
            for(float layer = 0.0; layer < 4.0; layer++) {
                // Add swirl motion based on distance from center
                float distFromCenter = length(uv);
                float swirlAngle = t * swirlSpeed + distFromCenter * swirlAmount;
                vec2 swirlUV = rotate2D(uv, swirlAngle);
                
                // Grid-based star positions with swirl
                vec2 layerUV = swirlUV + M * (layer + 1.0) * 0.3;
                
                // Add layer-specific rotation for more variety
                float layerRotation = t * 0.1 * (layer + 1.0) + layer * 1.57;
                layerUV = rotate2D(layerUV, layerRotation);
                
                // Vary scale more dramatically per layer
                float scale = 8.0 + layer * 7.0 + sin(layer * 2.0) * 3.0;
                vec2 gridUV = layerUV * scale;
                
                vec2 gridID = floor(gridUV);
                vec2 gridPos = fract(gridUV) - 0.5;
                
                // Multiple random values for more variation
                float rand1 = hash(gridID + layer * 100.0);
                float rand2 = hash(gridID + vec2(23.4, 56.7) + layer * 50.0);
                float rand3 = hash(gridID + vec2(98.7, 65.4));
                float rand4 = hash(gridID + vec2(45.6, 78.9));
                float rand5 = hash(gridID + vec2(12.3, 45.6)); // Extra random for spike phase
                
                // More random offset for less uniform positioning
                vec2 offset = vec2(
                    hash(gridID + vec2(13.0, 7.0)) - 0.5,
                    hash(gridID + vec2(7.0, 13.0)) - 0.5
                );
                offset *= 0.4 + rand3 * 0.2; // Vary offset amount per star
                
                // Vector to star center (keep for spike calculation)
                vec2 starVec = gridPos - offset;
                float starDist = length(starVec);
                
                // SIMPLIFIED SIZE CALCULATION
                // Base size directly from starSize parameter
                float baseSize = starSize; // Now starSize is the actual visible size
                
                // Random size variation per star (0.5x to 2x)
                float sizeVariation = 0.5 + rand2 * 1.5;
                
                // Layer depth effect (closer layers = bigger stars)
                float layerScale = 1.0 - layer * 0.15; // Subtle layer scaling
                
                // Final star core size
                float adjustedSize = baseSize * sizeVariation * layerScale;
                
                // Glow extends beyond the core
                float glowSize = adjustedSize * glowRadius;
                
                // Density control (what percentage of grid cells have stars)
                float densityMod = numStars / 100.0;
                
                // Calculate star intensity with glow
                float star;
                
                // FIXED: Check if this star should have spikes
                bool shouldHaveSpikes = (rand4 < 0.3) && (enableSpikes > 0.5);
                
                if(shouldHaveSpikes) {
                    // INVERSE SIZE RELATIONSHIP: smaller stars = longer spikes
                    float spikeLength = 1.0 + (2.0 - sizeVariation) * 2.0; // Range: 1-5, smaller stars get longer
                    
                    // FIXED: Properly animated spike twinkling
                    float animatedTime = time * spikeTwinkleSpeed;
                    
                    // Full star-shaped glow with properly animated twinkling spikes
                    star = calculateStarGlow(starVec, adjustedSize, glowSize, spikeLength, rand5, animatedTime) * glowIntensity;
                } else {
                    // Soft circular glow without spikes (most stars)
                    float core = 1.0 - smoothstep(0.0, adjustedSize * 1.5, starDist);
                    core = pow(core, 1.5); // Softer core
                    
                    float glow = 1.0 - smoothstep(adjustedSize * 0.5, glowSize * 1.5, starDist);
                    glow = pow(glow, 3.5); // Much softer glow falloff
                    
                    star = (core * 0.8 + glow * 0.3) * glowIntensity;
                }
                
                // Extra bright core for very large stars
                if(sizeVariation > 1.5) {
                    float extraCore = 1.0 - smoothstep(0.0, adjustedSize * 0.5, starDist);
                    star += extraCore * 1.5;
                }
                
                // More dynamic twinkle for the star itself (not the spikes)
                float twinkleSpeed = 2.0 + rand3 * 4.0;
                float twinkle = sin(t * twinkleSpeed + rand1 * 6.28) * 0.4 + 0.6;
                
                // Vary twinkle intensity based on star size
                if(sizeVariation > 1.2) {
                    // Larger stars have more subtle twinkle
                    twinkle = sin(t * twinkleSpeed * 0.5 + rand1 * 6.28) * 0.4 + 0.6;
                }
                
                star *= twinkle;
                
                // More color variations with glow-specific colors
                vec3 starColor;
                vec3 glowColor;
                float colorRand = rand1;
                
                if(colorRand < 0.15) {
                    // Red giants
                    starColor = vec3(1.0, 0.3, 0.1);
                    glowColor = vec3(1.0, 0.2, 0.05);
                } else if(colorRand < 0.25) {
                    // Orange stars
                    starColor = vec3(1.0, 0.6, 0.2);
                    glowColor = vec3(1.0, 0.5, 0.1);
                } else if(colorRand < 0.35) {
                    // Yellow stars (like our sun)
                    starColor = vec3(1.0, 1.0, 0.6);
                    glowColor = vec3(1.0, 0.9, 0.3);
                } else if(colorRand < 0.5) {
                    // White-yellow stars
                    starColor = vec3(1.0, 1.0, 0.85);
                    glowColor = vec3(1.0, 1.0, 0.7);
                } else if(colorRand < 0.7) {
                    // Pure white stars
                    starColor = vec3(1.0, 1.0, 1.0);
                    glowColor = vec3(0.9, 0.95, 1.0);
                } else if(colorRand < 0.85) {
                    // Blue-white stars
                    starColor = vec3(0.8, 0.9, 1.0);
                    glowColor = vec3(0.6, 0.8, 1.0);
                } else {
                    // Blue giants
                    starColor = vec3(0.6, 0.7, 1.0);
                    glowColor = vec3(0.4, 0.6, 1.0);
                }
                
                // Mix star core and glow colors based on distance
                float glowMix = smoothstep(adjustedSize, glowSize, starDist);
                starColor = mix(starColor, glowColor, glowMix * 0.5);
                
                // Add subtle color variation within each star
                starColor *= 0.8 + rand2 * 0.4;
                
                // Stars pick up some nebula color (enhanced)
                if(rand3 > 0.7) {
                    starColor = mix(starColor, nebulaColor1, 0.4);
                } else if(rand3 < 0.3) {
                    starColor = mix(starColor, nebulaColor2, 0.4);
                }
                
                // Layer fade for depth
                float layerFade = 1.0 / (layer * 0.7 + 1.0);
                
                // Only show star if random value passes threshold
                if(rand1 < densityMod) {
                    // Stars shine through nebula
                    float starIntensity = star * layerFade;
                    
                    // Apply HDR-like bloom for bright stars
                    if(starIntensity > 1.0) {
                        // Super bright cores
                        vec3 bloom = starColor * pow(starIntensity - 1.0, 0.5) * 0.5;
                        col += bloom;
                        col = mix(col, starColor, min(starIntensity, 1.0));
                    } else if(starIntensity > 0.5) {
                        // Bright stars punch through nebula
                        col = mix(col, starColor, starIntensity);
                    } else {
                        // Dim stars add to the color
                        col += starColor * starIntensity;
                    }
                }
            }
            
            // Apply mask texture
            vec4 maskColor = texture2D(maskTexture, vUv);
            col *= maskColor.rgb;
            
            // // Enhanced tone mapping that preserves colors better
            col = col / (1.0 + col * 0.3); // Reduced compression to preserve color
            col = pow(col, vec3(0.65)); // Lower gamma for brighter colors
            
            // // Boost saturation in final output
            col = adjustSaturation(col, 1.2);
            
            // // Subtle boost to bright areas for more glow
            float brightness = dot(col, vec3(0.299, 0.587, 0.114));
            if(brightness > 0.4) { // Lower threshold
                col *= 1.0 + (brightness - 0.4) * 0.5; // More boost
            }

              // Contrast enhancement
          col = col * col * 2.0;
          
     // Tonemap
          col = tanh(col * 1.5);
            
            return col;
        }`
      );

      // Modify color output
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 starColor = getSimpleStarField();
        diffuseColor.rgb += starColor;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 starEmissive = getSimpleStarField() * 0.2;
        totalEmissiveRadiance += starEmissive;`
      );
    };

    this.needsUpdate = true;
  }

  // Update methods
  update(deltaTime, audioTime = 0) {
    if (this.userData.uniforms) {
      this.userData.uniforms.time.value += deltaTime;
    }
  }

  updateResolution(width, height) {
    if (this.userData.uniforms) {
      this.userData.uniforms.resolution.value.set(width, height);
    }
  }

  updateMouse(x, y) {
    if (this.userData.uniforms) {
      this.userData.uniforms.mouse.value.set(x, y);
    }
  }

  setNumStars(stars) {
    if (this.userData.uniforms) {
      this.userData.uniforms.numStars.value = stars;
    }
  }
  
  setStarSize(size) {
    if (this.userData.uniforms) {
      this.userData.uniforms.starSize.value = size;
    }
  }

  setGlowIntensity(intensity) {
    if (this.userData.uniforms) {
      this.userData.uniforms.glowIntensity.value = intensity;
    }
  }

  setGlowRadius(radius) {
    if (this.userData.uniforms) {
      this.userData.uniforms.glowRadius.value = radius;
    }
  }

  setEnableSpikes(enable) {
    if (this.userData.uniforms) {
      this.userData.uniforms.enableSpikes.value = enable ? 1.0 : 0.0;
    }
  }

  setSpikeTwinkleSpeed(speed) {
    if (this.userData.uniforms) {
      this.userData.uniforms.spikeTwinkleSpeed.value = speed;
    }
  }
  
  setNebulaIntensity(intensity) {
    if (this.userData.uniforms) {
      this.userData.uniforms.nebulaIntensity.value = intensity;
    }
  }
  
  setNebulaSaturation(saturation) {
    if (this.userData.uniforms) {
      this.userData.uniforms.nebulaSaturation.value = saturation;
    }
  }
}

// Helper function to apply star nest to a model with VIBRANT NEBULA
function applyStarNestToModel(gltfModel, resources = {}) {
  const materials = new Map();
  
  // Load the gradient texture
  const textureLoader = new THREE.TextureLoader();
  const gradientTexture = textureLoader.load('images/gradient.jpg');
  
  gltfModel.traverse(child => {
    if (child.isMesh && child.material?.name?.includes("latex_")) {
      const originalMaterial = child.material;
      
      const starNestMat = new StarNestMaterial({
        maskTexture: gradientTexture,
        numStars: 80.0,
        starSize: 0.01,
        glowIntensity: 1.2,
        glowRadius: 2.5,
        enableSpikes: true,
        spikeTwinkleSpeed: 4.0,
        // VIBRANT NEBULA COLORS
        nebulaColor1: new THREE.Vector3(1.0, 0.2, 0.5),  // Hot pink
        nebulaColor2: new THREE.Vector3(0.1, 0.5, 1.0),  // Electric blue
        nebulaColor3: new THREE.Vector3(1.0, 0.6, 0.1),  // Golden orange
        nebulaIntensity: 0.8,     // Bright nebula (0.3 to 1.5)
        nebulaSaturation: 2.8,    // High saturation (1.0 to 2.5)
      });
      
      // Copy environment map if available
      if (resources.txthdr) {
        starNestMat.envMap = resources.txthdr;
      }
      
      // Copy other properties from original material
      starNestMat.depthWrite = originalMaterial.depthWrite !== undefined ? originalMaterial.depthWrite : true;
      starNestMat.depthTest = originalMaterial.depthTest !== undefined ? originalMaterial.depthTest : true;
      
      // For SkinnedMesh support
      if (child.isSkinnedMesh) {
        starNestMat.skinning = true;
      }
      
      child.material = starNestMat;
      materials.set(child.uuid, starNestMat);
      
      // Force update
      child.material.needsUpdate = true;
    }
  });
  
  return materials;
}


function updateStarNestMaterials(materials, deltaTime, mouseX, mouseY, audioTime) {
  materials.forEach(material => {
    if (material.update) {
      material.update(deltaTime, audioTime);
    }
    if (material.updateResolution) {
      material.updateResolution(window.innerWidth, window.innerHeight);
    }
    if (material.updateMouse) {
      material.updateMouse(mouseX, mouseY);
    }
  });
}





// Exports
export { 
  // Classes
  ChromaticAberrationPass, 
  CursorPlane,
  StarNestMaterial,
  
  // Factory functions
  createSkyPlane,
  applyStarNestToModel,
  
  // Update functions
  updateCloudUniforms,
  updateStarNestMaterials,
  
  // Raw shaders for custom usage
  shaders
};
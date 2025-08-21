// shader-manager.js - Consolidated shader utilities with all shaders
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Shader definitions
const shaders = {
  // Chromatic Aberration Shader
  chromaticAberration: {
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2(128, 128) },
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

  // Cursor Plane Shader
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

  // Sky/Cloud Shader
  skyCloud: {
    uniforms: {
      time: { value: 0.0 },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
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

// Shader Pass Classes
class ChromaticAberrationPass extends ShaderPass {
  constructor(strength = 0.01, threshold = 0.5) {
    super(shaders.chromaticAberration);
    this.uniforms.aberrationStrength.value = strength;
    this.uniforms.brightnessThreshold.value = threshold;
  }
  
  update(renderer, width, height, strength, threshold) {
    if (width && height) this.uniforms.resolution.value.set(width, height);
    if (strength !== undefined) this.uniforms.aberrationStrength.value = strength;
    if (threshold !== undefined) this.uniforms.brightnessThreshold.value = threshold;
  }
}

// Cursor Plane Manager
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
      this.material.uniforms.uViewportSize.value.set(window.innerWidth, window.innerHeight);
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

// Sky/Cloud Plane Factory
function createSkyPlane(options = {}) {
  const { width = 10, height = 10, position = new THREE.Vector3(0, 0, -5), 
          rotation = new THREE.Euler(0, 0, 0), colors = {} } = options;
  
  const material = new THREE.ShaderMaterial({
    ...shaders.skyCloud,
    transparent: true
  });
  
  // Set colors if provided
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

// Update cloud uniforms helper
function updateCloudUniforms(material, time, width, height) {
  if (material?.uniforms) {
    material.uniforms.time.value = time;
    material.uniforms.resolution.value.set(width, height);
  }
}

// Star Nest Material Class
class StarNestMaterial extends THREE.MeshPhysicalMaterial {
  constructor(options = {}) {
    const {
      metalness = 1.0,
      roughness = 0.5,
      envMapIntensity = 0.15,
      velocity = 0.025,
      starGlow = 1.055,
      starSize = 10.0,
      canvasView = 10.0,
      numStars = 50.0,
      numLayers = 8.0,
      swirlSpeed = 1.1,
      swirlAmount = 1.0,
      maskTexture = null,
      maskIntensity = 1.0,
      nebulaIntensity = 0.4,
      nebulaScale = 2.5,
      nebulaColor1 = new THREE.Vector3(0.5, 0.2, 0.8),
      nebulaColor2 = new THREE.Vector3(0.2, 0.4, 0.9),
      nebulaSpeed = 0.15
    } = options;

    super({
      color: new THREE.Color(0x000000),
      metalness,
      roughness,
      envMapIntensity,
      side: THREE.DoubleSide
    });

    // Store options
    this.starNestOptions = {
      velocity,
      starGlow,
      starSize,
      canvasView,
      numStars,
      numLayers,
      swirlSpeed,
      swirlAmount,
      maskTexture,
      maskIntensity,
      nebulaIntensity,
      nebulaScale,
      nebulaColor1,
      nebulaColor2,
      nebulaSpeed
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
      shader.uniforms.starGlow = { value: options.starGlow };
      shader.uniforms.starSize = { value: options.starSize };
      shader.uniforms.canvasView = { value: options.canvasView };
      shader.uniforms.numStars = { value: options.numStars };
      shader.uniforms.numLayers = { value: options.numLayers };
      shader.uniforms.swirlSpeed = { value: options.swirlSpeed };
      shader.uniforms.swirlAmount = { value: options.swirlAmount };
      shader.uniforms.maskTexture = { value: maskTex };
      shader.uniforms.maskIntensity = { value: options.maskIntensity };
      shader.uniforms.nebulaIntensity = { value: options.nebulaIntensity };
      shader.uniforms.nebulaScale = { value: options.nebulaScale };
      shader.uniforms.nebulaColor1 = { value: options.nebulaColor1 };
      shader.uniforms.nebulaColor2 = { value: options.nebulaColor2 };
      shader.uniforms.nebulaSpeed = { value: options.nebulaSpeed };

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

      // Add star nest fragment shader code
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        
        uniform float time;
        uniform vec2 resolution;
        uniform vec2 mouse;
        uniform float velocity;
        uniform float starGlow;
        uniform float starSize;
        uniform float canvasView;
        uniform float numStars;
        uniform float numLayers;
        uniform float swirlSpeed;
        uniform float swirlAmount;
        uniform sampler2D maskTexture;
        uniform float maskIntensity;
        uniform float nebulaIntensity;
        uniform float nebulaScale;
        uniform vec3 nebulaColor1;
        uniform vec3 nebulaColor2;
        uniform float nebulaSpeed;
        
        varying vec2 vScreenPosition;
        varying vec2 vUv;
        
        #define TAU 6.28318
        
        // 3D Noise functions for nebula
        vec3 mod289(vec3 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }
        
        vec4 mod289(vec4 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }
        
        vec4 permute(vec4 x) {
            return mod289(((x*34.0)+1.0)*x);
        }
        
        vec4 taylorInvSqrt(vec4 r) {
            return 1.79284291400159 - 0.85373472095314 * r;
        }
        
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            
            vec3 i = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            
            i = mod289(i);
            vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            
            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);
            
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
        
        float fbm(vec3 p, int octaves, float lacunarity, float gain) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            
            for(int i = 0; i < octaves; i++) {
                value += amplitude * snoise(p * frequency);
                frequency *= lacunarity;
                amplitude *= gain;
            }
            
            return value;
        }
        
        vec3 nebulaLayer(vec2 uv, float depth, float layerTime, vec3 color1, vec3 color2) {
            float scale = mix(nebulaScale, nebulaScale * 0.3, depth);
            vec3 pos = vec3(uv * scale, layerTime);
            
            float noise1 = fbm(pos, 4, 2.0, 0.5);
            float noise2 = fbm(pos * 2.3 + vec3(100.0), 3, 2.5, 0.6);
            
            float nebulaDensity = noise1 * 0.7 + noise2 * 0.3;
            nebulaDensity = smoothstep(-0.5, 0.8, nebulaDensity);
            
            vec3 nebulaColor = mix(color1, color2, noise2 * 0.5 + 0.5);
            
            float brightSpots = pow(max(0.0, noise1), 3.0) * 2.0;
            nebulaColor += vec3(brightSpots) * 0.3;
            
            float depthFade = 1.0 - depth * 0.5;
            
            return nebulaColor * nebulaDensity * depthFade * nebulaIntensity;
        }
        
        float Star(vec2 uv, float flare, float size) {
            float d = length(uv);
            float m = sin(starGlow * 1.2) / d * 0.5 * size;
            float rays = max(0., 0.5 - abs(uv.x * uv.y * 1000.)) * 0.3;
            m += (rays * flare) * 2. * size;
            m *= smoothstep(1., 0.1 * size, d);
            return m;
        }
        
        float Hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        
        mat2 rot2D(float angle) {
            float s = sin(angle);
            float c = cos(angle);
            return mat2(c, -s, s, c);
        }
        
        vec3 StarLayer(vec2 uv, float density) {
            vec3 col = vec3(0);
            
            float gridScale = 100.0 / max(1.0, density);
            uv *= gridScale;
            
            vec2 gv = fract(uv);
            vec2 id = floor(uv);
            
            float starProbability = density / 100.0;
            
            for(int y = -1; y <= 1; y++) {
                for(int x = -1; x <= 1; x++) {
                    vec2 offs = vec2(float(x), float(y));
                    float n = Hash21(id + offs);
                    
                    if(n > starProbability) continue;
                    
                    float size = fract(n * 43.758) * 0.5 + 0.5;
                    float starScale = starSize / 10.0;
                    
                    float star = Star(
                        gv - offs - vec2(n, fract(n * 34.)) + 0.5, 
                        smoothstep(0.1, 0.9, size) * 0.46,
                        starScale
                    );
                    
                    float w = n * 1000.0;
                    vec3 color = (cos(w + vec3(0.0, 1.0, 2.0)) + 1.0) * 0.5;
                    
                    float brightness = exp(cos(w * 0.1) * 0.6);
                    color *= brightness * 1.2;
                    
                    star *= sin(time * 0.6 + n * TAU) * 0.5 + 0.5;
                    star *= 0.5;
                    col += star * size * color;
                }
            }
            return col;
        }
        
        vec3 getStarField() {
            vec2 fragCoord = (vScreenPosition * 0.5 + 0.5) * resolution;
            vec2 uv = (fragCoord - 0.5 * resolution.xy) / resolution.y;
            
            vec2 M = vec2(0);
            M -= vec2(M.x + sin(time * 0.022), M.y - cos(time * 0.022));
            M += (mouse.xy - resolution.xy * 0.5) / resolution.y;
            
            float t = time * velocity;
            vec3 col = vec3(0);
            
            // Add nebula layers
            vec2 nebula1UV = uv + M * 0.1;
            vec3 nebula1 = nebulaLayer(nebula1UV, 0.9, t * nebulaSpeed * 0.7, nebulaColor1, nebulaColor2);
            
            vec2 nebula2UV = uv + M * 0.2;
            vec3 nebula2 = nebulaLayer(nebula2UV, 0.6, t * nebulaSpeed, nebulaColor2 * 0.8, nebulaColor1 * 1.2);
            
            col += (nebula1 * 4.0) + (nebula2 * 4.0) * 0.7;
            
            // Add star layers
            float maxLayers = min(10.0, max(1.0, numLayers));
            float layerStep = 1.0 / maxLayers;
            
            for(float i = 0.; i < 1.0; i += 0.1) {
                if(i >= maxLayers * layerStep) break;
                
                float depth = fract(i + t);
                float scale = mix(canvasView, 0.1, depth);
                float fade = depth * smoothstep(1., 0.9, depth);
                
                float dist = length(uv);
                float rotAngle = time * swirlSpeed + dist * swirlAmount;
                vec2 swirlUV = rot2D(rotAngle) * uv;
                
                float layerRotation = rotAngle * (1.0 + i * 0.2);
                swirlUV = rot2D(layerRotation) * uv;
                
                float layerIndex = i / layerStep;
                float fadeInOut = min(100.0 - layerIndex * 0.1 + 9.0, layerIndex) / 20.0;
                
                col += StarLayer(swirlUV * scale + i * 453.2 - time * 0.05 + M, numStars) 
                       * fade * fadeInOut;
            }
            
            vec4 maskColor = texture2D(maskTexture, vUv);
            col *= maskColor.rgb;
            
            col = col * col * 1.5;
            col = tanh(col * 1.5);
            
            return col;
        }`
      );

      // Modify color output
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 starColor = getStarField();
        diffuseColor.rgb += starColor;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 starEmissive = getStarField() * 0.2;
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

  setNumLayers(layers) {
    if (this.userData.uniforms) {
      this.userData.uniforms.numLayers.value = layers;
    }
  }

  setMaskTexture(texture) {
    if (this.userData.uniforms) {
      const tex = texture || this.defaultMaskTex;
      this.userData.uniforms.maskTexture.value = tex;
    }
  }

  setMaskIntensity(intensity) {
    if (this.userData.uniforms) {
      this.userData.uniforms.maskIntensity.value = intensity;
    }
  }

  setNebulaIntensity(intensity) {
    if (this.userData.uniforms) {
      this.userData.uniforms.nebulaIntensity.value = intensity;
    }
  }

  setNebulaScale(scale) {
    if (this.userData.uniforms) {
      this.userData.uniforms.nebulaScale.value = scale;
    }
  }

  setNebulaColors(color1, color2) {
    if (this.userData.uniforms) {
      this.userData.uniforms.nebulaColor1.value = color1;
      this.userData.uniforms.nebulaColor2.value = color2;
    }
  }

  setNebulaSpeed(speed) {
    if (this.userData.uniforms) {
      this.userData.uniforms.nebulaSpeed.value = speed;
    }
  }
}

// Helper function to apply star nest to a model
function applyStarNestToModel(gltfModel, resources = {}) {
  const materials = new Map();
  
  // Load the gradient texture
  const textureLoader = new THREE.TextureLoader();
  const gradientTexture = textureLoader.load('images/gradient.jpg');
  
  gltfModel.traverse(child => {
    if (child.isMesh && child.material?.name?.includes("latex_")) {
      const originalMaterial = child.material;
      
      // Create a new star nest material
      const starNestMat = new StarNestMaterial({
        maskTexture: gradientTexture,
        maskIntensity: 1.0
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

// Update function for star nest materials
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
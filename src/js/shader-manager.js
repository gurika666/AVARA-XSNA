// shader-manager.js - Consolidated shader utilities
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

// Exports
export { 
  ChromaticAberrationPass, 
  CursorPlane, 
  createSkyPlane, 
  updateCloudUniforms,
  shaders // Export raw shaders for custom usage
};
// star-nest-shader-nebula.js - Star field effect with nebula background and simplified texture mask
import * as THREE from 'three';

export function createStarNestMaterial(options = {}) {
  const {
    velocity = 0.025,
    starGlow = 1.055,
    starSize = 10.0,
    canvasView = 10.0,
    numStars = 50.0,
    numLayers = 8.0,
    zoomSpeed = 0.3,
    zoomAmount = 0.5,
    metalness = 1.0,
    roughness = 0.5,
    envMapIntensity = 0.15,
    swirlSpeed = 0.1,
    swirlTightness = 0.01,
    swirlAmount = 0.0,
    maskTexture = null,
    maskIntensity = 1.0,
    // New nebula parameters
    nebulaIntensity = 0.4,
    nebulaScale = 2.5,
    nebulaColor1 = new THREE.Vector3(0.5, 0.2, 0.8), // Purple
    nebulaColor2 = new THREE.Vector3(0.2, 0.4, 0.9), // Blue
    nebulaSpeed = 0.15
  } = options;

  // Load the mask texture if path provided
  let maskTex = maskTexture;
  if (typeof maskTexture === 'string') {
    const textureLoader = new THREE.TextureLoader();
    maskTex = textureLoader.load(maskTexture);
  }

  // Create a default white texture for when no mask is provided
  const defaultMaskTex = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]), 
    1, 
    1, 
    THREE.RGBAFormat
  );
  defaultMaskTex.needsUpdate = true;

  // Create base physical material
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x000000),
    metalness: metalness,
    roughness: roughness,
    envMapIntensity: envMapIntensity,
    side: THREE.DoubleSide
  });

  // Store original onBeforeCompile
  const originalOnBeforeCompile = material.onBeforeCompile;

  // Inject custom shader code
  material.onBeforeCompile = function(shader) {
    // Call original if it exists
    if (originalOnBeforeCompile) {
      originalOnBeforeCompile(shader);
    }

    // Add uniforms
    shader.uniforms.time = { value: 0 };
    shader.uniforms.resolution = { value: new THREE.Vector2(window.innerWidth, window.innerHeight) };
    shader.uniforms.mouse = { value: new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5) };
    shader.uniforms.velocity = { value: velocity };
    shader.uniforms.starGlow = { value: starGlow };
    shader.uniforms.starSize = { value: starSize };
    shader.uniforms.canvasView = { value: canvasView };
    shader.uniforms.numStars = { value: numStars };
    shader.uniforms.numLayers = { value: numLayers };
    shader.uniforms.swirlSpeed = { value: swirlSpeed || 0.2 };
    shader.uniforms.swirlAmount = { value: swirlAmount || 1.0 };
    shader.uniforms.maskTexture = { value: maskTex || defaultMaskTex };
    shader.uniforms.maskIntensity = { value: maskIntensity };
    // Nebula uniforms
    shader.uniforms.nebulaIntensity = { value: nebulaIntensity };
    shader.uniforms.nebulaScale = { value: nebulaScale };
    shader.uniforms.nebulaColor1 = { value: nebulaColor1 };
    shader.uniforms.nebulaColor2 = { value: nebulaColor2 };
    shader.uniforms.nebulaSpeed = { value: nebulaSpeed };

    // Store uniforms reference for updates
    material.userData.uniforms = shader.uniforms;

    // Add to vertex shader - pass screen position AND UV coordinates
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

    // Add star and nebula functions to fragment shader
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
      
      // Fractal brownian motion for nebula
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
      
      // Nebula layer function with parallax
      vec3 nebulaLayer(vec2 uv, float depth, float layerTime, vec3 color1, vec3 color2) {
          // Apply parallax based on depth
          float scale = mix(nebulaScale, nebulaScale * 0.3, depth);
          vec3 pos = vec3(uv * scale, layerTime);
          
          // Multi-octave noise for cloud-like structure
          float noise1 = fbm(pos, 4, 2.0, 0.5);
          float noise2 = fbm(pos * 2.3 + vec3(100.0), 3, 2.5, 0.6);
          
          // Combine noises for more complex patterns
          float nebulaDensity = noise1 * 0.7 + noise2 * 0.3;
          nebulaDensity = smoothstep(-0.5, 0.8, nebulaDensity);
          
          // Create color gradient
          vec3 nebulaColor = mix(color1, color2, noise2 * 0.5 + 0.5);
          
          // Add some bright spots
          float brightSpots = pow(max(0.0, noise1), 3.0) * 2.0;
          nebulaColor += vec3(brightSpots) * 0.3;
          
          // Apply depth fading
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
          
          // Add two nebula background layers with different depths and speeds
          // Layer 1 - Far background nebula
          vec2 nebula1UV = uv + M * 0.1; // Less mouse influence for background
          float nebula1Depth = 0.9; // Far back
          vec3 nebula1 = nebulaLayer(
              nebula1UV, 
              nebula1Depth, 
              t * nebulaSpeed * 0.7,
              nebulaColor1,
              nebulaColor2
          );
          
          // Layer 2 - Mid background nebula  
          vec2 nebula2UV = uv + M * 0.2; // Medium mouse influence
          float nebula2Depth = 0.6; // Middle distance
          vec3 nebula2 = nebulaLayer(
              nebula2UV,
              nebula2Depth,
              t * nebulaSpeed,
              nebulaColor2 * 0.8,
              nebulaColor1 * 1.2
          );
          
          // Combine nebula layers
          col += (nebula1 * 4.0) + (nebula2 * 4.0) * 0.7;
          
          // Add star layers on top of nebula
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
          
          // Get mask value from texture using UV coordinates
          vec4 maskColor = texture2D(maskTexture, vUv);
       
          
          // Apply mask directly to final color
          col *= maskColor.rgb;
          
          // Contrast enhancement
          col = col * col * 1.5;
          
          // Tonemap
          col = tanh(col * 1.5);
          
          return col;
      }`
    );

    // Modify the color output to include star field
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 starColor = getStarField();
      diffuseColor.rgb += starColor;`
    );

    // Also add to emissive for glow effect
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec3 starEmissive = getStarField() * 0.2;
      totalEmissiveRadiance += starEmissive;`
    );
  };

  // Mark material as needing update
  material.needsUpdate = true;

  // Add update methods
  material.userData.update = function(deltaTime, audioTime = 0) {
    if (material.userData.uniforms) {
      material.userData.uniforms.time.value += deltaTime;
    }
  };

  material.userData.updateResolution = function(width, height) {
    if (material.userData.uniforms) {
      material.userData.uniforms.resolution.value.set(width, height);
    }
  };

  material.userData.updateMouse = function(x, y) {
    if (material.userData.uniforms) {
      material.userData.uniforms.mouse.value.set(x, y);
    }
  };

  material.userData.setNumStars = function(stars) {
    if (material.userData.uniforms) {
      material.userData.uniforms.numStars.value = stars;
    }
  };

  material.userData.setNumLayers = function(layers) {
    if (material.userData.uniforms) {
      material.userData.uniforms.numLayers.value = layers;
    }
  };

  material.userData.setMaskTexture = function(texture) {
    if (material.userData.uniforms) {
      // If no texture provided, use default white texture
      const tex = texture || defaultMaskTex;
      material.userData.uniforms.maskTexture.value = tex;
    }
  };

  material.userData.setMaskIntensity = function(intensity) {
    if (material.userData.uniforms) {
      material.userData.uniforms.maskIntensity.value = intensity;
    }
  };

  // New nebula control methods
  material.userData.setNebulaIntensity = function(intensity) {
    if (material.userData.uniforms) {
      material.userData.uniforms.nebulaIntensity.value = intensity;
    }
  };

  material.userData.setNebulaScale = function(scale) {
    if (material.userData.uniforms) {
      material.userData.uniforms.nebulaScale.value = scale;
    }
  };

  material.userData.setNebulaColors = function(color1, color2) {
    if (material.userData.uniforms) {
      material.userData.uniforms.nebulaColor1.value = color1;
      material.userData.uniforms.nebulaColor2.value = color2;
    }
  };

  material.userData.setNebulaSpeed = function(speed) {
    if (material.userData.uniforms) {
      material.userData.uniforms.nebulaSpeed.value = speed;
    }
  };

  return material;
}

// Integration helper for your existing code
export function applyStarNestToModel(gltfModel, resources = {}) {
  const materials = new Map();
  
  // Load the gradient texture
  const textureLoader = new THREE.TextureLoader();
  const gradientTexture = textureLoader.load('images/gradient.jpg');
  
  gltfModel.traverse(child => {
    if (child.isMesh && child.material?.name?.includes("latex_")) {
      const originalMaterial = child.material;
      
      // Create a new physical material with star effect and mask
      const starNestMat = createStarNestMaterial({
        maskTexture: gradientTexture,
        maskIntensity: 1.0,
        // Nebula settings
        nebulaIntensity: 0.3,
        nebulaScale: 2.0,
        nebulaColor1: new THREE.Vector3(0.5, 0.2, 0.8), // Purple
        nebulaColor2: new THREE.Vector3(0.2, 0.4, 0.9), // Blue
        nebulaSpeed: 0.015
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

// Update function to be called in your animation loop
export function updateStarNestMaterials(materials, deltaTime, mouseX, mouseY, audioTime) {
  materials.forEach(material => {
    if (material.userData.update) {
      material.userData.update(deltaTime, audioTime);
    }
    if (material.userData.updateResolution) {
      material.userData.updateResolution(window.innerWidth, window.innerHeight);
    }
    if (material.userData.updateMouse) {
      material.userData.updateMouse(mouseX, mouseY);
    }
  });
}

// Dynamic control functions
export function setStarDensity(materials, numStars) {
  materials.forEach(material => {
    if (material.userData.setNumStars) {
      material.userData.setNumStars(numStars);
    }
  });
}

export function setLayerCount(materials, numLayers) {
  materials.forEach(material => {
    if (material.userData.setNumLayers) {
      material.userData.setNumLayers(numLayers);
    }
  });
}

export function setMaskIntensity(materials, intensity) {
  materials.forEach(material => {
    if (material.userData.setMaskIntensity) {
      material.userData.setMaskIntensity(intensity);
    }
  });
}

export function updateMaskTexture(materials, texturePath) {
  const textureLoader = new THREE.TextureLoader();
  const newTexture = textureLoader.load(texturePath);
  
  materials.forEach(material => {
    if (material.userData.setMaskTexture) {
      material.userData.setMaskTexture(newTexture);
    }
  });
}

// New nebula control functions
export function setNebulaIntensity(materials, intensity) {
  materials.forEach(material => {
    if (material.userData.setNebulaIntensity) {
      material.userData.setNebulaIntensity(intensity);
    }
  });
}

export function setNebulaScale(materials, scale) {
  materials.forEach(material => {
    if (material.userData.setNebulaScale) {
      material.userData.setNebulaScale(scale);
    }
  });
}

export function setNebulaColors(materials, color1, color2) {
  materials.forEach(material => {
    if (material.userData.setNebulaColors) {
      material.userData.setNebulaColors(color1, color2);
    }
  });
}

export function setNebulaSpeed(materials, speed) {
  materials.forEach(material => {
    if (material.userData.setNebulaSpeed) {
      material.userData.setNebulaSpeed(speed);
    }
  });
}

// Example usage:
/*
// Basic usage with gradient mask and nebula
const starMaterial = createStarNestMaterial({
  numStars: 50,
  maskTexture: 'images/gradient.jpg',
  maskIntensity: 1.0,  // 1.0 = full mask effect, 0.0 = no masking
  // Nebula settings
  nebulaIntensity: 0.4,
  nebulaScale: 2.5,
  nebulaColor1: new THREE.Vector3(0.8, 0.3, 0.2), // Reddish
  nebulaColor2: new THREE.Vector3(0.2, 0.5, 0.9), // Bluish
  nebulaSpeed: 0.02
});

// Apply to a mesh
mesh.material = starMaterial;

// In your animation loop
starMaterial.userData.update(deltaTime);

// Dynamically control mask
starMaterial.userData.setMaskIntensity(0.5);  // Reduce mask effect to 50%

// Dynamically control nebula
starMaterial.userData.setNebulaIntensity(0.6);  // Increase nebula brightness
starMaterial.userData.setNebulaColors(
  new THREE.Vector3(0.9, 0.4, 0.1), // Orange
  new THREE.Vector3(0.3, 0.1, 0.7)  // Purple
);
*/
import * as THREE from "three";

/**
 * Creates a cloud shader material based on 2D noise functions
 * @param {Object} options - Configuration options
 * @param {THREE.Color|number} options.cloudColor - The color of the clouds
 * @param {THREE.Color|number} options.skyTopColor - The top color of the sky gradient
 * @param {THREE.Color|number} options.skyBottomColor - The bottom color of the sky gradient
 * @returns {THREE.ShaderMaterial} The created cloud shader material
 */
function createCloudMaterial(options = {}) {
  // Default values
  const defaults = {
    cloudColor: new THREE.Color(0xffffff),
    skyTopColor: new THREE.Color(0x1973e6),
    skyBottomColor: new THREE.Color(0x0073b3)
  };
  
  // Merge options with defaults
  const colors = {...defaults};
  if (options.cloudColor) {
    colors.cloudColor = options.cloudColor instanceof THREE.Color ?
      options.cloudColor : new THREE.Color(options.cloudColor);
  }
  if (options.skyTopColor) {
    colors.skyTopColor = options.skyTopColor instanceof THREE.Color ?
      options.skyTopColor : new THREE.Color(options.skyTopColor);
  }
  if (options.skyBottomColor) {
    colors.skyBottomColor = options.skyBottomColor instanceof THREE.Color ?
      options.skyBottomColor : new THREE.Color(options.skyBottomColor);
  }
  
  // Create the shader material
  const cloudShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      cloudColor: { value: new THREE.Vector3(colors.cloudColor.r, colors.cloudColor.g, colors.cloudColor.b) },
      skyTopColor: { value: new THREE.Vector3(colors.skyTopColor.r, colors.skyTopColor.g, colors.skyTopColor.b) },
      skyBottomColor: { value: new THREE.Vector3(colors.skyBottomColor.r, colors.skyBottomColor.g, colors.skyBottomColor.b) }
    },
    vertexShader: `
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec2 resolution;
      uniform vec3 cloudColor;
      uniform vec3 skyTopColor;
      uniform vec3 skyBottomColor;
      
      varying vec2 vUv;
      
      /**
       * Cloudy noise function
       */
      float cloudyNoise(vec2 uv) {
        float sx = cos(500.0 * uv.x);
        float sy = sin(500.0 * uv.y);
        sx = mix(sx, cos(uv.y * 1000.0), 0.5);
        sy = mix(sy, sin(uv.x * 1000.0), 0.5);
        
        vec2 b = vec2(sx, sy);
        vec2 bn = normalize(b);
        vec2 _b = b;
        b.x = b.x * bn.x - b.y * bn.y;
        b.y = b.x * bn.y + b.y * bn.x; 
        vec2 l = uv - vec2(sin(b.x), cos(b.y));
        return length(l - b) - 0.5;
      }
      
      /**
       * Fractal Brownian Motion for clouds
       */
      float cloudyFbm(vec2 uv) {
        float f = 0.0;
        vec2 _uv = uv;
        vec2 rotator = vec2(0.91, 1.5);
        
        for (int i = 0; i < 5; ++i) {
          vec2 tmp = uv;
          uv.x = tmp.x * rotator.x - tmp.y * rotator.y; 
          uv.y = tmp.x * rotator.y + tmp.y * rotator.x; 
          f += 0.5 * cloudyNoise(uv) * pow(0.5, float(i + 1));
        }
        return f;
      }
      
      /**
       * Generate clouds with multiple layers of FBM
       */
      float clouds(vec2 uv) {
        float T = time * 0.1; // Slower speed than original
        float x = 0.0;
        x += cloudyFbm(0.5 * uv + vec2(0.1,  -0.01) * T) * 0.5;
        x += cloudyFbm(1.0 * uv + vec2(0.12,  0.03) * T) * 0.5 * 0.5;
        x += cloudyFbm(2.0 * uv + vec2(0.15, -0.02) * T) * 0.5 * 0.5 * 0.5;
        x += cloudyFbm(4.0 * uv + vec2(0.2,   0.01) * T) * 0.5 * 0.5 * 0.5 * 0.5;
        x += cloudyFbm(8.0 * uv + vec2(0.15, -0.01) * T) * 0.5 * 0.5 * 0.5 * 0.5 * 0.5;
        
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
        
        // Center UV and adjust aspect ratio
        uv -= vec2(0.5);
        uv.y *= resolution.x / resolution.y;
        vec2 _uv = uv * 0.007;
        
        // Generate clouds
        float x = clouds(_uv);
        
        // Sky gradient from bottom to top
        vec3 skyColor = mix(skyTopColor, skyBottomColor, smoothstep(0.5, 1.0, ouv.x));
        
        // Mix clouds with sky
        vec3 color = skyColor;
        color += x * cloudColor;
        color = mix(x * cloudColor, color, 1.0 - x);
        
        // Add fake lighting
        vec2 ld = 0.005 * normalize(vec2(1.0, 1.0)) * 0.01;
        float f = 0.0;
        const int steps = 4;
        for (int i = 1; i <= steps; ++i) {
          float c = clouds(_uv - float(i * i) * ld) * pow(0.55, float(i));
          f += max(c, 0.0);
        }
        f = clamp(f, 0.0, 1.0);
        f = 1.0 - f;
        f = pow(f, 1.2);
        color += f * x * 0.5 * cloudColor;
        
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    transparent: true
  });
  
  return cloudShaderMaterial;
}

/**
 * Creates a sky plane with the cloud shader
 * @param {Object} options - Configuration options
 * @param {number} options.width - Width of the sky plane
 * @param {number} options.height - Height of the sky plane
 * @param {THREE.Vector3} options.position - Position of the sky plane
 * @param {THREE.Euler} options.rotation - Rotation of the sky plane
 * @param {Object} options.colors - Color options for the cloud material
 * @returns {THREE.Mesh} The created sky plane mesh
 */
function createSkyPlane({
  width = 10,
  height = 10,
  position = new THREE.Vector3(0, 0, -5),
  rotation = new THREE.Euler(0, 0, 0),
  colors = {}
}) {
  // Create geometry
  const geometry = new THREE.PlaneGeometry(width, height);
  
  // Create material
  const material = createCloudMaterial(colors);
  
  // Create mesh
  const skyPlane = new THREE.Mesh(geometry, material);
  skyPlane.position.copy(position);
  skyPlane.rotation.copy(rotation);
  
  return skyPlane;
}

/**
 * Updates the cloud shader uniforms
 * @param {THREE.ShaderMaterial} material - The cloud shader material
 * @param {number} time - Current time in seconds
 * @param {number} width - Current viewport width
 * @param {number} height - Current viewport height
 */
function updateCloudUniforms(material, time, width, height) {
  if (material && material.uniforms) {
    material.uniforms.time.value = time;
    material.uniforms.resolution.value.set(width, height);
  }
}

/**
 * Sets the cloud and sky colors
 * @param {THREE.ShaderMaterial} material - The cloud shader material
 * @param {Object} colors - Color options
 * @param {THREE.Color|number} colors.cloudColor - Cloud color
 * @param {THREE.Color|number} colors.skyTopColor - Sky top color
 * @param {THREE.Color|number} colors.skyBottomColor - Sky bottom color
 */
function setCloudColors(material, { cloudColor, skyTopColor, skyBottomColor } = {}) {
  if (material && material.uniforms) {
    if (cloudColor) {
      const color = cloudColor instanceof THREE.Color ? cloudColor : new THREE.Color(cloudColor);
      material.uniforms.cloudColor.value.set(color.r, color.g, color.b);
    }
    if (skyTopColor) {
      const color = skyTopColor instanceof THREE.Color ? skyTopColor : new THREE.Color(skyTopColor);
      material.uniforms.skyTopColor.value.set(color.r, color.g, color.b);
    }
    if (skyBottomColor) {
      const color = skyBottomColor instanceof THREE.Color ? skyBottomColor : new THREE.Color(skyBottomColor);
      material.uniforms.skyBottomColor.value.set(color.r, color.g, color.b);
    }
  }
}

/**
 * Creates a simple cloud demo scene
 * @param {HTMLElement} container - The container element for the Three.js canvas
 * @returns {Object} Controller for the demo scene
 */
function createCloudDemo(container) {
  // Create Three.js scene
  const scene = new THREE.Scene();
  
  // Create camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 5;
  
  // Create renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  
  // Create sky plane
  const skyPlane = createSkyPlane({
    width: 10,
    height: 10,
    position: new THREE.Vector3(0, 0, -5),
    colors: {
      cloudColor: 0xffffff,
      skyTopColor: 0x1973e6,
      skyBottomColor: 0x0073b3
    }
  });
  scene.add(skyPlane);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCloudUniforms(skyPlane.material, clock.getElapsedTime(), window.innerWidth, window.innerHeight);
  });
  
  // Animation clock
  const clock = new THREE.Clock();
  
  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Update uniforms
    updateCloudUniforms(skyPlane.material, clock.getElapsedTime(), window.innerWidth, window.innerHeight);
    
    // Render scene
    renderer.render(scene, camera);
  }
  
  animate();
  
  // Return controller for adjusting parameters
  return {
    setColors: (colors) => setCloudColors(skyPlane.material, colors)
  };
}

export {
  createCloudMaterial,
  createSkyPlane,
  updateCloudUniforms,
  setCloudColors,
  createCloudDemo
};
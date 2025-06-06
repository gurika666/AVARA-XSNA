import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

/**
 * Custom shader pass that uses a separate scene with rotating cube and text as displacement map
 */
class DisplacementScenePass extends ShaderPass {
  constructor(renderer, displacementScale = 0.1) {
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
    
    // Calculate total luminance of the displacement pixel (to detect content)
    float luminance = (displacement.r + displacement.g + displacement.b) / .0;
    
    // Only displace if there's content (non-black pixels) in the displacement map
    float contentThreshold = 0.05;  // Adjust as needed
    float contentFactor = smoothstep(0.0, contentThreshold, luminance);
    
    // Calculate displacement vector - only apply displacement where content exists
    vec2 displacementVector = (displacement.rg - 0.5) * 2.0 * scale * contentFactor;
    
    // Apply displacement to UV coordinates
    vec2 distortedUv = vUv + displacementVector;
    
    // Ensure UVs stay in bounds
    distortedUv = clamp(distortedUv, 0.0, 1.0);
    
    // Sample the scene texture with distorted UVs
    vec4 color = texture2D(tDiffuse, distortedUv);
    
    // Output the color
    gl_FragColor = color;
  }
`
    };
    
    super(shader);
    
    this.renderer = renderer;
    
    // Create a separate scene for the displacement map
    this.setupDisplacementScene();
    
    // Text-related properties
    this.font = null;
    this.textMeshes = [];
    this.textMaterial = null;
    
    this.textConfig = {
      size: 0.2,
      height: 0.05,
      depth: 0.1,
      z: -2
    };
    
    this.removalZ = 5; // Point where text gets removed
    this.moveSpeed = 1; // Speed at which text moves
  }
  
  setupDisplacementScene() {
    // Create a separate displacement scene
    this.displacementScene = new THREE.Scene();
    // this.displacementScene.background = new THREE.Color(0x000000); // Black background
    // this.displacementScene.fog = new THREE.Fog(0xffffff, 1, -2);
    
    // Camera for displacement scene
    this.displacementCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    // this.displacementCamera.position.set(0, 0.7, 5);
    this.displacementCamera.position.z = 5;

   
    


    
    // Create a render target for the displacement scene
    this.displacementRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    //   format: THREE.RGBAFormat,
    //   type: THREE.UnsignedByteType
    });
    
    // Set the displacement texture uniform
    this.uniforms.tDisplacement.value = this.displacementRenderTarget.texture;
  }
  
  // Initialize the text manager functionality
  initTextSupport(font) {
    this.font = font;
    
    // Create text material
    // this.textMaterial = new THREE.MeshStandardMaterial({
    //   color: 0xffffff,
    //   metalness: 0.3,
    //   roughness: 0.4,
    //   emissive: 0x222222
    // });
    
    this.textMaterial = new THREE.MeshNormalMaterial();
    return this;
  }
  
  // Create text at a specific position in the displacement scene
  createDynamicText(text, currentAudioTime) {
    if (!this.font || !this.displacementScene) {
      console.error("Text functionality not properly initialized");
      return null;
    }
    
    // Create text geometry with the new text
    const textGeometry = new TextGeometry(text, {
      font: this.font,
      size: this.textConfig.size,
      height: this.textConfig.height,
      depth: this.textConfig.depth,
      curveSegments: 6,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 5
    });
    
    // Center the text geometry
    textGeometry.computeBoundingBox();
    const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
    const centerOffset = -textWidth / 2;
    
    // Create the text mesh
    const textMesh = new THREE.Mesh(textGeometry, this.textMaterial);
    textMesh.position.set(centerOffset, 0, this.textConfig.z); // Position in front of camera
    
    // Add a userData property to store creation time
    textMesh.userData = { 
      text: text,
      creationTime: currentAudioTime // Store when this text was created
    };
    
    // Add the text to the displacement scene
    this.displacementScene.add(textMesh);
    this.textMeshes.push(textMesh);
    
    return textMesh;
  }
  
  // Update text positions based on audio time
  updateTextBasedOnAudioTime(currentTime, deltaTime, textAppearTimes) {
    if (!this.displacementScene) return;
    
    // Check if any text should appear at this time
    for (const textItem of textAppearTimes) {
      // If we're within half a second of the timestamp (to catch any timing issues)
      if (Math.abs(currentTime - textItem.time) < 0.5 && 
          // Make sure we're not already showing this text
          !this.textMeshes.some(mesh => mesh.userData.text === textItem.text) &&
          // Make sure this text would be visible (not already past camera)
          currentTime - textItem.time < 5) {
        
        this.createDynamicText(textItem.text, currentTime);
      }
    }
    
    // Move all existing text
    const moveDelta = this.moveSpeed * deltaTime * 60;
    
    for (let i = this.textMeshes.length - 1; i >= 0; i--) {
      const textMesh = this.textMeshes[i];
      
      // Calculate how far this text should have moved based on audio time
      const timeSinceCreation = currentTime - textMesh.userData.creationTime;
      const expectedZ = this.textConfig.z + (timeSinceCreation * this.moveSpeed * 60);
      
      // Update position (if it's different from expected)
      if (Math.abs(textMesh.position.z - expectedZ) > 0.1) {
        textMesh.position.z = expectedZ;
      } else {
        // Small incremental move (smoother)
        textMesh.position.z += moveDelta;
      }
      
      // Remove if past camera
      if (textMesh.position.z > this.removalZ) {
        this.displacementScene.remove(textMesh);
        textMesh.geometry.dispose();
        this.textMeshes.splice(i, 1);
      }
    }
  }
  
  // Reset text display when scrubbing or seeking
  resetTextDisplay(targetTime, textAppearTimes) {
    if (!this.displacementScene) return;
    
    // Clear all current text
    for (const textMesh of this.textMeshes) {
      this.displacementScene.remove(textMesh);
      textMesh.geometry.dispose();
    }
    this.textMeshes = [];
    
    // Generate text for timestamps that would be visible at this time
    for (const textItem of textAppearTimes) {
      if (targetTime >= textItem.time && 
          targetTime - textItem.time < 5) { // Only if it would still be visible (within 5 seconds)
        
        const textMesh = this.createDynamicText(textItem.text, textItem.time);
        
        // Calculate correct Z position based on how long ago it should have appeared
        const timeSinceCreation = targetTime - textItem.time;
        const expectedZ = this.textConfig.z + (timeSinceCreation * this.moveSpeed * 60);
        textMesh.position.z = expectedZ;
      }
    }
  }
  
  // Configure text parameters
  setTextConfig(config) {
    this.textConfig = { ...this.textConfig, ...config };
    return this;
  }
  
  // Set text movement speed
  setTextMoveSpeed(speed) {
    this.moveSpeed = speed;
    return this;
  }
  
  // Set the Z position at which text should be removed
  setTextRemovalZ(z) {
    this.removalZ = z;
    return this;
  }
  
  update(renderer, time, currentAudioTime, deltaTime, textAppearTimes, displacementScale) {
    // Update cube rotation based on time
    if (this.cube) {
      this.cube.rotation.x = time * 0.0003;
      this.cube.rotation.y = time * 0.0005;
    }
    
    // Update text positions if we have audio time and textAppearTimes
    if (currentAudioTime !== undefined && textAppearTimes && deltaTime !== undefined) {
      this.updateTextBasedOnAudioTime(currentAudioTime, deltaTime, textAppearTimes);
    }
    
    // Render the displacement scene to the render target
    if (this.renderer && this.displacementScene && this.displacementCamera) {
      const currentRenderTarget = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.displacementRenderTarget);
      this.renderer.render(this.displacementScene, this.displacementCamera);
      this.renderer.setRenderTarget(currentRenderTarget);
    }
    
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
  
  // Resize handler
  setSize(width, height) {
    if (this.displacementRenderTarget) {
      this.displacementRenderTarget.setSize(width, height);
    }
    if (this.displacementCamera) {
      this.displacementCamera.aspect = width / height;
      this.displacementCamera.updateProjectionMatrix();
    }
  }
  
  // Clean up resources
  dispose() {
    if (this.displacementRenderTarget) {
      this.displacementRenderTarget.dispose();
    }
    if (this.cube && this.cube.geometry) {
      this.cube.geometry.dispose();
    }
    if (this.cube && this.cube.material) {
      this.cube.material.dispose();
    }
    
    // Clean up text resources
    for (const textMesh of this.textMeshes) {
      this.displacementScene.remove(textMesh);
      if (textMesh.geometry) textMesh.geometry.dispose();
    }
    this.textMeshes = [];
    
    if (this.textMaterial) {
      this.textMaterial.dispose();
    }
    
    super.dispose();
  }
}

export { DisplacementScenePass };
import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

/**
 * Manages 3D text that appears at specific times and moves toward the camera
 */
class TextManager {
  constructor() {
    this.font = null;
    this.textMeshes = [];
    this.textMaterial = null;
    this.scene = null;
    
    this.textConfig = {
      size: 0.8,
      height: 0.05,
      depth: 0.1,
      startZ: -50,  // Starting Z position (far from camera)
      endZ: 10,     // End Z position (past camera)
      yPosition: 2, // Height of text
      // xSpread: 15   // Random X spread
    };
    
    this.moveSpeed = 15; // Speed at which text moves toward camera
  }
  
  /**
   * Initialize the text manager with font and scene
   */
  init(font, scene) {
    this.font = font;
    this.scene = scene;
    
    // Create text material - can be customized
    this.textMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
      envMapIntensity: 1.0
    });
    
    // Alternative material options:
    // this.textMaterial = new THREE.MeshNormalMaterial();
    // this.textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    return this;
  }
  
  /**
   * Set custom material for text
   */
  setMaterial(material) {
    this.textMaterial = material;
    return this;
  }
  
  /**
   * Configure text parameters
   */
  setTextConfig(config) {
    this.textConfig = { ...this.textConfig, ...config };
    return this;
  }
  
  /**
   * Set text movement speed
   */
  setMoveSpeed(speed) {
    this.moveSpeed = speed;
    return this;
  }
  
  /**
   * Create text at a specific position in the main scene
   */
  createText(text, currentAudioTime) {
    if (!this.font || !this.scene) {
      console.error("Text manager not properly initialized");
      return null;
    }
    
    // Create text geometry
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
    const textMesh = new THREE.Mesh(textGeometry, this.textMaterial.clone());
    
    // Position text with some random X spread for variety
    const xOffset = (Math.random() - 0.5) * this.textConfig.xSpread;
    const yOffset = (Math.random() - 0.5) * 2; // Slight Y variation
    
    textMesh.position.set(
      centerOffset + xOffset, 
      this.textConfig.yPosition + yOffset, 
      this.textConfig.startZ
    );
    
    // // Add slight random rotation for visual interest
    // textMesh.rotation.y = (Math.random() - 0.5) * 0.3;
    // textMesh.rotation.z = (Math.random() - 0.5) * 0.1;
    
    // Store metadata
    textMesh.userData = { 
      text: text,
      creationTime: currentAudioTime,
      initialX: textMesh.position.x,
      initialY: textMesh.position.y
    };
    
    // Add to scene and tracking array
    this.scene.add(textMesh);
    this.textMeshes.push(textMesh);
    
    return textMesh;
  }
  
  /**
   * Update text positions based on audio time
   */
  update(currentTime, deltaTime, textAppearTimes) {
    if (!this.scene) return;
    
    // Check if any text should appear at this time
    for (const textItem of textAppearTimes) {
      // If we're within a small time window of the timestamp
      if (Math.abs(currentTime - textItem.time) < 0.1 && 
          // Make sure we're not already showing this text
          !this.textMeshes.some(mesh => 
            mesh.userData.text === textItem.text && 
            Math.abs(mesh.userData.creationTime - textItem.time) < 0.1
          )) {
        
        this.createText(textItem.text, currentTime);
      }
    }
    
    // Move all existing text toward camera
    for (let i = this.textMeshes.length - 1; i >= 0; i--) {
      const textMesh = this.textMeshes[i];
      
      // Calculate how far this text should have moved based on time
      const timeSinceCreation = currentTime - textMesh.userData.creationTime;
      const expectedZ = this.textConfig.startZ + (timeSinceCreation * this.moveSpeed);
      
      // Update position
      textMesh.position.z = expectedZ;
      
      // Optional: Add some floating animation
      const floatTime = currentTime * 2;
      textMesh.position.y = textMesh.userData.initialY + Math.sin(floatTime + i) * 0.1;
      
      // Optional: Slight rotation animation
      // textMesh.rotation.y += deltaTime * 0.2;
      
      // Fade out as text gets close to camera
      if (textMesh.position.z > 0) {
        const fadeDistance = 10;
        const opacity = Math.max(0, 1 - (textMesh.position.z / fadeDistance));
        textMesh.material.opacity = opacity;
        textMesh.material.transparent = true;
      }
      
      // Remove if past camera
      if (textMesh.position.z > this.textConfig.endZ) {
        this.scene.remove(textMesh);
        textMesh.geometry.dispose();
        textMesh.material.dispose();
        this.textMeshes.splice(i, 1);
      }
    }
  }
  
  /**
   * Reset text display when scrubbing or seeking
   */
  reset(targetTime, textAppearTimes) {
    if (!this.scene) return;
    
    // Clear all current text
    for (const textMesh of this.textMeshes) {
      this.scene.remove(textMesh);
      textMesh.geometry.dispose();
      textMesh.material.dispose();
    }
    this.textMeshes = [];
    
    // Generate text for timestamps that would be visible at this time
    for (const textItem of textAppearTimes) {
      const timeSinceAppear = targetTime - textItem.time;
      const wouldBeZ = this.textConfig.startZ + (timeSinceAppear * this.moveSpeed);
      
      // Only create if it would be visible (between start and end positions)
      if (targetTime >= textItem.time && wouldBeZ < this.textConfig.endZ && wouldBeZ > this.textConfig.startZ - 10) {
        const textMesh = this.createText(textItem.text, textItem.time);
        
        // Set correct Z position based on time
        textMesh.position.z = wouldBeZ;
      }
    }
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    for (const textMesh of this.textMeshes) {
      this.scene.remove(textMesh);
      if (textMesh.geometry) textMesh.geometry.dispose();
      if (textMesh.material) textMesh.material.dispose();
    }
    this.textMeshes = [];
    
    if (this.textMaterial) {
      this.textMaterial.dispose();
    }
  }
}

export { TextManager };
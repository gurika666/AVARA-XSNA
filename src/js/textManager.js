// textManager.js - Manages 3D text creation and animation

import * as THREE from "three";
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

class TextManager {
  constructor() {
    this.font = null;
    this.textMeshes = []; // Array to store all active text meshes
    this.textMaterial = null;
    this.scene = null;
    
    this.config = {
      size: 2,
      height: 0.1,
      depth: 1,
      z: -50
    };
    
    this.removalZ = 50; // Point where text gets removed (when it passes the camera)
  }

  // Initialize the text manager
  init(scene, font) {
    this.scene = scene;
    this.font = font;
    
    // Create text material
    this.textMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0x222222
    });
    
    return this;
  }

  // Create text at a specific position
  createDynamicText(text, currentAudioTime) {
    if (!this.font || !this.scene) {
      console.error("TextManager not properly initialized");
      return null;
    }
    
    // Create text geometry with the new text
    const textGeometry = new TextGeometry(text, {
      font: this.font,
      size: this.config.size,
      height: this.config.height,
      depth: this.config.depth,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.2,
      bevelSize: 0.1,
      bevelOffset: 0,
      bevelSegments: 5
    });
    
    // Center the text geometry
    textGeometry.computeBoundingBox();
    const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
    const centerOffset = -textWidth / 2;
    
    // Create the text mesh
    const textMesh = new THREE.Mesh(textGeometry, this.textMaterial);
    textMesh.position.set(centerOffset, 1, this.config.z); // Position far in front of camera
    
    // Add a userData property to store creation time
    textMesh.userData = { 
      text: text,
      creationTime: currentAudioTime // Store when this text was created
    };
    
    // Add the text to the scene
    this.scene.add(textMesh);
    this.textMeshes.push(textMesh);
    
    return textMesh;
  }

  // Update text positions based on audio time
  updateTextBasedOnAudioTime(currentTime, deltaTime, textAppearTimes, moveSpeed) {
    if (!this.scene) return;
    
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
    
    // Move all existing text based on audio playback (not frame time)
    // This ensures text moves in sync with audio even during pauses/scrubs
    const moveDelta = moveSpeed * deltaTime * 60;
    
    for (let i = this.textMeshes.length - 1; i >= 0; i--) {
      const textMesh = this.textMeshes[i];
      
      // Calculate how far this text should have moved based on audio time
      const timeSinceCreation = currentTime - textMesh.userData.creationTime;
      const expectedZ = this.config.z + (timeSinceCreation * moveSpeed * 60);
      
      // Update position (if it's different from expected)
      if (Math.abs(textMesh.position.z - expectedZ) > 0.1) {
        textMesh.position.z = expectedZ;
      } else {
        // Small incremental move (smoother)
        textMesh.position.z += moveDelta;
      }
      
      // Remove if past camera
      if (textMesh.position.z > this.removalZ) {
        this.scene.remove(textMesh);
        textMesh.geometry.dispose();
        this.textMeshes.splice(i, 1);
      }
    }
  }

  // Reset text display when scrubbing or seeking
  resetTextDisplay(targetTime, textAppearTimes, moveSpeed) {
    if (!this.scene) return;
    
    // Clear all current text
    for (const textMesh of this.textMeshes) {
      this.scene.remove(textMesh);
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
        const expectedZ = this.config.z + (timeSinceCreation * moveSpeed * 60);
        textMesh.position.z = expectedZ;
      }
    }
  }
  
  // Configure text parameters
  setConfig(config) {
    this.config = { ...this.config, ...config };
    return this;
  }
  
  // Set the Z position at which text should be removed
  setRemovalZ(z) {
    this.removalZ = z;
    return this;
  }
  
  // Clean up resources
  dispose() {
    // Remove all text meshes
    for (const textMesh of this.textMeshes) {
      if (this.scene) this.scene.remove(textMesh);
      if (textMesh.geometry) textMesh.geometry.dispose();
    }
    this.textMeshes = [];
    
    // Clean up material
    if (this.textMaterial) {
      this.textMaterial.dispose();
    }
  }
}

export default TextManager;
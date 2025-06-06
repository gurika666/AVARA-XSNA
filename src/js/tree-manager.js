// tree-manager.js - Handles all tree creation and management

import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as GUI from './gui.js';

// Tree-related variables
let trees = [];
let treeModels = [];
let resourcesLoaded = false;
let gradientColorTexture = null;

// Constants for tree generation and management
const spreadWidth = 20;
const minDistance = 5;
const removalZ = 30; // Point where objects get removed (when they pass the camera)
const generationZ = -70;
const rows = 10;
const perrows = 30;

// We're removing the alpha texture function as we'll only use color gradient

// Helper function to create a gradient color texture for trees
function createGradientColorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256; // Taller for better vertical gradient resolution
  const ctx = canvas.getContext('2d');
  
  // Create a vertical gradient with green colors - fully opaque
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0.1, 'rgb(0, 0, 0)');      // Dark green at bottom
//   gradient.addColorStop(0.5, 'rgb(0, 160, 0)');    // Medium green in middle
  gradient.addColorStop(0.3, 'rgb(255, 255, 255)');    // Lighter green at top
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Create a material with color gradient for trees
function createTreeMaterial() {
  if (!gradientColorTexture) {
    gradientColorTexture = createGradientColorTexture();
  }
  
  return new THREE.MeshPhysicalMaterial({
    map: gradientColorTexture,
    // color: 0xffffff, // White base color to let the map show through clearly
    roughness: 0.8,
    metalness: 0.1,
    alphaMap: gradientColorTexture,
    // alphaTest: true,
    depthTest: true,
    transparent: true,
    
    side: THREE.DoubleSide
  });
}

// Initialize the tree manager
export function init(scene, loadingManager) {
  // Create the color texture
  gradientColorTexture = createGradientColorTexture();
  
  // Load tree models
  const gltfLoader = new GLTFLoader(loadingManager);
  gltfLoader.load(
    'mesh/trees_01.glb',
    (gltf) => {
      gltf.scene.traverse((child) => {
        if (child.isMesh && child.name.includes("Tree_")) {
          // Apply the gradient material to all tree models
          // child.material = createTreeMaterial();
          treeModels.push(child);
        }
      });
      
      resourcesLoaded = true;
      GUI.updateLoadingProgress('mesh', 100);
    },
    (xhr) => {
      GUI.updateLoadingProgress('mesh', xhr.loaded / xhr.total * 100);
    },
    (error) => {
      console.error('Error loading tree models:', error);
      resourcesLoaded = true; // Mark as loaded even if it failed
    }
  );
}

// Check if trees are loaded
export function isLoaded() {
  return resourcesLoaded;
}

// Get the number of trees
export function getTreeCount() {
  return trees.length;
}

// Get all trees (for external access)
export function getAllTrees() {
  return trees;
}

// Create a tree at position
function createTree(x, z) {
  if (treeModels.length === 0) {
    // Create a simple box with the gradient material if no tree models available
    const geometry = new THREE.BoxGeometry(2, 5, 2);
    // const material = createTreeMaterial();
    const box = new THREE.Mesh(geometry, material);
    box.position.set(x, 2.5, z);
    return box;
  }
  
  const randomIndex = Math.floor(Math.random() * treeModels.length);
  const treeMesh = treeModels[randomIndex];
  
  const tree = treeMesh.clone();
  
  // Ensure the cloned tree has the gradient material
  tree.traverse((child) => {
    if (child.isMesh) {
      // child.material = createTreeMaterial();
    }
  });
  
  tree.position.set(x, 0, z);
  
  return tree;
}

// Create initial trees
export function createInitialTrees(scene) {
  // Clear existing trees first
  for (const tree of trees) {
    scene.remove(tree);
  }
  trees = [];
  
  for (let i = 0; i < rows; i++) {
    const z = -100 - (i * 10);
    
    for (let j = 0; j < perrows; j++) {
      const x = (Math.random() * 2 - 1) * spreadWidth;
      
      // Avoid placing trees too close to each other
      let tooClose = false;
      for (const existingTree of trees) {
        const dx = existingTree.position.x - x;
        const dz = existingTree.position.z - z;
        const distSquared = dx * dx + dz * dz;
        
        if (distSquared < minDistance * minDistance) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        const tree = createTree(x, z);
        scene.add(tree);
        trees.push(tree);
      }
    }
  }
  
  return trees.length;
}

// Create a new tree at the far end
function createNewTree(scene) {
  for (let attempts = 0; attempts < 10; attempts++) {
    const x = (Math.random() * 2 - 1) * spreadWidth;
    const z = generationZ - (Math.random() * 50);
    
    // Check if too close to existing trees
    let tooClose = false;
    for (const tree of trees) {
      const dx = tree.position.x - x;
      const dz = tree.position.z - z;
      const distSquared = dx * dx + dz * dz;
      
      if (distSquared < minDistance * minDistance) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      const tree = createTree(x, z);
      scene.add(tree);
      trees.push(tree);
      return true;
    }
  }
  
  return false;
}

// Update trees - move and manage them
export function updateTrees(scene, deltaZ) {
  // Move all trees toward camera
  for (const tree of trees) {
    tree.position.z += deltaZ;
  }
  
  // Manage trees (remove if behind camera, create new ones)
  let removedCount = 0;
  
  for (let i = trees.length - 1; i >= 0; i--) {
    if (trees[i].position.z > removalZ) {
      // Remove tree
      scene.remove(trees[i]);
      trees.splice(i, 1);
      removedCount++;
      
      // Create a new tree at the far end
      createNewTree(scene);
    }
  }
  
  return trees.length;
}

// Apply effects to trees (optional)
export function applyEffects(effectType, intensity) {
  switch(effectType) {
    case 'sway':
      // Make trees sway based on intensity
      for (const tree of trees) {
        tree.rotation.z = Math.sin(Date.now() * 0.001 + tree.position.x) * 0.05 * intensity;
      }
      break;
    case 'scale':
      // Pulse trees based on intensity
      for (const tree of trees) {
        const scale = 1.0 + Math.sin(Date.now() * 0.002 + tree.position.z * 0.1) * 0.05 * intensity;
        tree.scale.set(scale, scale, scale);
      }
      break;
    case 'color':
      // Change tree color intensity
      for (const tree of trees) {
        tree.traverse((child) => {
          if (child.isMesh && child.material) {
            // Only apply to trees with materials
            if (child.material.color) {
              // Calculate a color based on intensity
              const g = 0.7 + intensity * 0.3;
              child.material.color.setRGB(0.2, g, 0.3);
            }
          }
        });
      }
      break;
    default:
      // Reset effects
      for (const tree of trees) {
        tree.rotation.z = 0;
        tree.scale.set(1, 1, 1);
        tree.traverse((child) => {
          if (child.isMesh && child.material && child.material.color) {
            child.material.color.setRGB(0.2, 0.7, 0.3);
          }
        });
      }
  }
}

// Clean up resources
export function dispose() {
  for (const tree of trees) {
    if (tree.geometry) tree.geometry.dispose();
    if (tree.material) {
      if (Array.isArray(tree.material)) {
        tree.material.forEach(m => m.dispose());
      } else {
        tree.material.dispose();
      }
    }
  }
  
  if (gradientColorTexture) gradientColorTexture.dispose();
  
  trees = [];
  treeModels = [];
  resourcesLoaded = false;
  gradientColorTexture = null;
}
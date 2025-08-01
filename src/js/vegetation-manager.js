// vegetation-manager.js - Step 2: Object Pooling Implementation
import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as GUI from './gui.js';

// Constants
const BLADE_WIDTH = 0.2, BLADE_HEIGHT = 1.2, BLADE_HEIGHT_VARIATION = 0.8, BLADE_VERTEX_COUNT = 5, BLADE_TIP_OFFSET = 0.1;
const GRASS_SPREAD = 10, TREE_SPREAD = 20, MIN_DISTANCE = 5, REMOVAL_Z = 20, GENERATION_Z = -70;
const MIN_PATCH_SIZE = 10, MAX_PATCH_SIZE = 15, MIN_BLADE_COUNT = 500, MAX_BLADE_COUNT = 600;
const TREE_CLEARANCE_FROM_CENTER = 7

// State
let grassPatches = [], trees = [], treeModels = [], resourcesLoaded = { trees: false, grass: false };
let cloudTexture, gradientTexture;

// SHARED MATERIALS - Create once, use everywhere
let sharedGrassMaterial = null;
let sharedTreeMaterials = new Map(); // Store tree materials by name

// OBJECT POOLS
const grassPool = {
  available: [],
  active: new Set(),
  
  // Get a grass patch from pool or create new one
  get(size, count) {
    // Try to find a matching grass patch in the pool
    for (let i = 0; i < this.available.length; i++) {
      const patch = this.available[i];
      // Check if this patch matches our requirements (you could be more flexible here)
      if (patch.userData.size === size && patch.userData.count === count) {
        this.available.splice(i, 1);
        this.active.add(patch);
        patch.visible = true;
        return patch;
      }
    }
    
    // No matching patch found, create a new one
    const newPatch = new Grass(size, count);
    newPatch.userData.size = size;
    newPatch.userData.count = count;
    this.active.add(newPatch);
    return newPatch;
  },
  
  // Return a grass patch to the pool
  release(patch) {
    patch.visible = false;
    this.active.delete(patch);
    this.available.push(patch);
  },
  
  // Clean up all patches
  dispose() {
    [...this.available, ...this.active].forEach(patch => {
      if (patch.geometry) patch.geometry.dispose();
    });
    this.available = [];
    this.active.clear();
  }
};

const treePool = {
  available: [],
  active: new Set(),
  
  // Get a tree from pool or create new one
  get(modelIndex) {
    // Try to find a matching tree in the pool
    for (let i = 0; i < this.available.length; i++) {
      const tree = this.available[i];
      if (tree.userData.modelIndex === modelIndex) {
        this.available.splice(i, 1);
        this.active.add(tree);
        tree.visible = true;
        return tree;
      }
    }
    
    // No matching tree found, create a new one
    let newTree;
    
    if (treeModels.length === 0) {
      // Fallback box tree
      const geometry = new THREE.BoxGeometry(2, 5, 2);
      const material = sharedTreeMaterials.get('default') || new THREE.MeshPhysicalMaterial({ color: 0x228B22 });
      newTree = new THREE.Mesh(geometry, material);
      newTree.userData.modelIndex = -1; // Special index for box trees
    } else {
      // Clone from loaded models
      const model = treeModels[modelIndex];
      newTree = model.clone();
      
      // Apply shared materials
      newTree.traverse(child => {
        if (child.isMesh && child.material) {
          const materialName = child.material.name || 'default';
          if (sharedTreeMaterials.has(materialName)) {
            child.material = sharedTreeMaterials.get(materialName);
          }
        }
      });
      
      newTree.userData.modelIndex = modelIndex;
    }
    
    this.active.add(newTree);
    return newTree;
  },
  
  // Return a tree to the pool
  release(tree) {
    tree.visible = false;
    this.active.delete(tree);
    this.available.push(tree);
  },
  
  // Clean up all trees
  dispose() {
    [...this.available, ...this.active].forEach(tree => {
      if (tree.geometry) tree.geometry.dispose();
    });
    this.available = [];
    this.active.clear();
  }
};

// Utilities
const interpolate = (val, oldMin, oldMax, newMin, newMax) => ((val - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
const centerBiasedRandom = () => Math.pow(Math.random(), 1.5) * 2 - 1;

// Texture creation
function createGradientTexture(colors = ['rgba(255,255,255,0)', 'rgb(0,0,0)']) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createDefaultTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#dddddd');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Grass Geometry
class GrassGeometry extends THREE.BufferGeometry {
  constructor(size, count) {
    super();
    const positions = [], uvs = [], indices = [];

    for (let i = 0; i < count; i++) {
      const radius = (size / 2) * Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const x = radius * Math.cos(theta), y = radius * Math.sin(theta);
      
      uvs.push(...Array.from({ length: BLADE_VERTEX_COUNT }).flatMap((_, vertexIndex) => [
        interpolate(x, -size/2, size/2, 0, 1),
        vertexIndex >= 2 ? (vertexIndex === 4 ? 1.0 : 0.5) : 0
      ]));
      
      const blade = this.computeBlade([x, 0, y], i);
      positions.push(...blade.positions); indices.push(...blade.indices);
    }

    this.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    this.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    this.setIndex(indices); this.computeVertexNormals();
  }

  computeBlade(center, index = 0) {
    const height = BLADE_HEIGHT + Math.random() * BLADE_HEIGHT_VARIATION;
    const vIndex = index * BLADE_VERTEX_COUNT;
    const yaw = Math.random() * Math.PI * 2, bend = Math.random() * Math.PI * 2;
    const yawVec = [Math.sin(yaw), 0, -Math.cos(yaw)], bendVec = [Math.sin(bend), 0, -Math.cos(bend)];
    
    const bl = yawVec.map((n, i) => n * (BLADE_WIDTH / 2) + center[i]);
    const br = yawVec.map((n, i) => n * (BLADE_WIDTH / -2) + center[i]);
    const tl = yawVec.map((n, i) => n * (BLADE_WIDTH / 4) + center[i]);
    const tr = yawVec.map((n, i) => n * (BLADE_WIDTH / -4) + center[i]);
    const tc = bendVec.map((n, i) => n * BLADE_TIP_OFFSET + center[i]);
    
    tl[1] += height / 2; tr[1] += height / 2; tc[1] += height;
    
    return {
      positions: [...bl, ...br, ...tr, ...tl, ...tc],
      indices: [vIndex, vIndex + 1, vIndex + 2, vIndex + 2, vIndex + 4, vIndex + 3, vIndex + 3, vIndex, vIndex + 2]
    };
  }
}

// Grass Mesh - Uses shared material
class Grass extends THREE.Mesh {
  constructor(size, count) {
    const geometry = new GrassGeometry(size, count);
    super(geometry, sharedGrassMaterial);
  }
}

// Vegetation Management - MODIFIED TO USE POOLS
function createGrassPatch(scene, x, z, size, count) {
  const grassPatch = grassPool.get(size, count);
  grassPatch.position.set(x, 0, z);
  
  // Only add to scene if not already in it
  if (!grassPatch.parent) {
    scene.add(grassPatch);
  }
  
  grassPatches.push(grassPatch);
  return grassPatch;
}

function createTree(x, z) {
  const modelIndex = treeModels.length > 0 ? Math.floor(Math.random() * treeModels.length) : -1;
  const tree = treePool.get(modelIndex);
  
  tree.position.set(x, modelIndex === -1 ? 2.5 : 0, z); // Box trees need Y offset
  tree.rotation.y = 0; // All trees face the same direction
  
  return tree;
}

function createInitialVegetation(scene) {
  // Clear existing - RETURN TO POOLS INSTEAD OF REMOVING
  grassPatches.forEach(patch => {
    grassPool.release(patch);
    scene.remove(patch);
  });
  trees.forEach(tree => {
    treePool.release(tree);
    scene.remove(tree);
  });
  grassPatches = []; 
  trees = [];
  
  // Create grass patches
  createGrassPatch(scene, 0, -40, MAX_PATCH_SIZE + 5, MAX_BLADE_COUNT + 200);
  for (let z = -20; z > -200; z -= 25) {
    const patchesInRow = Math.max(2, Math.floor(6 * (1 - Math.abs(z) / 200)));
    for (let i = 0; i < patchesInRow; i++) {
      const x = centerBiasedRandom() * GRASS_SPREAD;
      const sizeFactor = 1 - Math.sqrt(x*x + z*z) / Math.sqrt(GRASS_SPREAD*GRASS_SPREAD + 200*200) * 0.5;
      const size = MIN_PATCH_SIZE + (MAX_PATCH_SIZE - MIN_PATCH_SIZE) * sizeFactor;
      const count = MIN_BLADE_COUNT + Math.floor((MAX_BLADE_COUNT - MIN_BLADE_COUNT) * sizeFactor);
      createGrassPatch(scene, x, z, size, count);
    }
  }
  
  // Create trees
  for (let i = 0; i < 10; i++) {
    const z = -100 - (i * 10);
    for (let j = 0; j < 30; j++) {
      const x = (Math.random() * 2 - 1) * TREE_SPREAD;
      if (!trees.some(t => Math.pow(t.position.x - x, 2) + Math.pow(t.position.z - z, 2) < MIN_DISTANCE * MIN_DISTANCE)) {
        const tree = createTree(x, z);
        if (!tree.parent) {
          scene.add(tree);
        }
        trees.push(tree);
      }
    }
  }
}

function createNewVegetation(scene, type) {
  for (let attempts = 0; attempts < 10; attempts++) {
    const spread = type === 'grass' ? GRASS_SPREAD : TREE_SPREAD;
    const x = (type === 'grass' ? centerBiasedRandom() : (Math.random() * 2 - 1)) * spread;
    const z = GENERATION_Z - (Math.random() * 50);
    
    const existing = type === 'grass' ? grassPatches : trees;
    const tooClose = existing.some(obj => Math.pow(obj.position.x - x, 2) + Math.pow(obj.position.z - z, 2) < MIN_DISTANCE * MIN_DISTANCE);
    
    const tooCloseToCamera = type === 'tree' && Math.abs(x) < TREE_CLEARANCE_FROM_CENTER;
    
    if (!tooClose && !tooCloseToCamera) {
      if (type === 'grass') {
        const sizeFactor = 1 - Math.abs(x) / spread * 0.5;
        const size = MIN_PATCH_SIZE + (MAX_PATCH_SIZE - MIN_PATCH_SIZE) * sizeFactor;
        const count = MIN_BLADE_COUNT + Math.floor((MAX_BLADE_COUNT - MIN_BLADE_COUNT) * sizeFactor);
        createGrassPatch(scene, x, z, size, count);
      } else if (type === 'tree') {
        const tree = createTree(x, z);
        if (!tree.parent) {
          scene.add(tree);
        }
        trees.push(tree);
      }
      return true;
    }
  }
  return false;
}

// Main functions
export function init(scene, manager) {
  gradientTexture = createGradientTexture();
  
  // CREATE SHARED GRASS MATERIAL ONCE
  sharedGrassMaterial = new THREE.MeshPhysicalMaterial({
    map: gradientTexture,
    roughness: 0.8,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    alphaMap: gradientTexture,
    alphaTest: 0.1
  });
  
  // Create default tree material
  sharedTreeMaterials.set('default', new THREE.MeshPhysicalMaterial({ color: 0x228B22 }));
  
  // Load cloud texture for grass
  const textureLoader = new THREE.TextureLoader(manager);
  textureLoader.load('images/cloud.jpg', 
    texture => { 
      cloudTexture = texture; 
      resourcesLoaded.grass = true; 
    },
    undefined,
    error => { cloudTexture = createDefaultTexture(); resourcesLoaded.grass = true; }
  );
  
  // Load tree models
  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.load('mesh/trees_01.glb',
    gltf => {
      gltf.scene.traverse(child => {
        if (child.isMesh && child.name.includes("Tree_")) {
          treeModels.push(child);
          
          // CACHE TREE MATERIALS
          if (child.material && !sharedTreeMaterials.has(child.material.name)) {
            sharedTreeMaterials.set(child.material.name, child.material);
          }
        }
      });
      resourcesLoaded.trees = true;
      GUI.updateLoadingProgress('mesh', 100);
    },
    xhr => GUI.updateLoadingProgress('mesh', xhr.loaded / xhr.total * 100),
    error => { console.error('Error loading trees:', error); resourcesLoaded.trees = true; }
  );
}

export function createInitialVegetationWhenReady(scene) {
  if (Object.values(resourcesLoaded).every(Boolean)) createInitialVegetation(scene);
}

export function updateVegetation(scene, deltaZ = 0.5) {
  if (!Object.values(resourcesLoaded).every(Boolean)) return { grass: 0, trees: 0 };
  
  // Move all vegetation forward (towards camera)
  [...grassPatches, ...trees].forEach(obj => {
    obj.position.z += deltaZ;
    // Rotation should NOT change here - only position
    
    // DEBUG: Check if tree rotations are changing
    if (obj.userData.initialRotation !== undefined) {
      const currentRotation = obj.rotation.y;
      if (Math.abs(currentRotation - obj.userData.initialRotation) > 0.01) {
        console.warn(`Tree rotation changed! Initial: ${obj.userData.initialRotation.toFixed(2)}, Current: ${currentRotation.toFixed(2)}`);
      }
    }
  });
  
  // Remove and create new vegetation
  // Handle grass patches
  for (let i = grassPatches.length - 1; i >= 0; i--) {
    if (grassPatches[i].position.z > REMOVAL_Z) {
      const patch = grassPatches[i];
      scene.remove(patch);
      grassPool.release(patch); // Return to pool instead of disposing
      grassPatches.splice(i, 1);
      createNewVegetation(scene, 'grass');
    }
  }
  
  // Handle trees
  for (let i = trees.length - 1; i >= 0; i--) {
    if (trees[i].position.z > REMOVAL_Z) {
      const tree = trees[i];
      scene.remove(tree);
      treePool.release(tree); // Return to pool instead of disposing
      trees.splice(i, 1);
      createNewVegetation(scene, 'tree');
    }
  }
  
  return { grass: grassPatches.length, trees: trees.length };
}

export const isLoaded = () => Object.values(resourcesLoaded).every(Boolean);
export const getTreeCount = () => trees.length;
export const getAllTrees = () => trees;
export const getAllGrassPatches = () => grassPatches;

export function dispose() {
  // Clean up pools
  grassPool.dispose();
  treePool.dispose();
  
  grassPatches = []; 
  trees = []; 
  treeModels = [];
  
  // Dispose shared materials
  if (sharedGrassMaterial) {
    sharedGrassMaterial.dispose();
    sharedGrassMaterial = null;
  }
  
  sharedTreeMaterials.forEach(material => material.dispose());
  sharedTreeMaterials.clear();
  
  if (cloudTexture) cloudTexture.dispose();
  if (gradientTexture) gradientTexture.dispose();
  resourcesLoaded = { trees: false, grass: false };
}
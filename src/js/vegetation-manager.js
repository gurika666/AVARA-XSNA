// vegetation-manager.js - Optimized with proper memory management
import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';


// Constants
const BLADE_WIDTH = 0.2, BLADE_HEIGHT = 1.2, BLADE_HEIGHT_VARIATION = 0.8, BLADE_VERTEX_COUNT = 5, BLADE_TIP_OFFSET = 0.1;
const GRASS_SPREAD = 10, TREE_SPREAD = 20, MIN_DISTANCE = 5, REMOVAL_Z = 20, GENERATION_Z = -70;
const MIN_PATCH_SIZE = 10, MAX_PATCH_SIZE = 15, MIN_BLADE_COUNT = 30, MAX_BLADE_COUNT = 100;
const TREE_CLEARANCE_FROM_CENTER = 3;

// Pool configuration
const MAX_POOL_SIZE = 10; // Maximum objects to keep in each pool
const GRASS_POOL_CATEGORIES = 3; // Small, medium, large grass patches

const TREE_ROWS = 6 ;
const TREES_PER_ROW_ATTEMPTS = 200;

// State
let grassPatches = [], trees = [], treeModels = [], resourcesLoaded = { trees: false, grass: false };
let cloudTexture, gradientTexture;
let isDisposed = false; // Track if manager has been disposed

// SHARED MATERIALS - Create once, use everywhere
let sharedGrassMaterial = null;
let sharedTreeMaterials = new Map();

// Improved Object Pool with proper memory management
class ObjectPool {
  constructor(maxSize = MAX_POOL_SIZE) {
    this.available = [];
    this.active = new Set();
    this.maxSize = maxSize;
    this.createCount = 0; // Track how many objects we've created
  }
  
  get(creator, ...args) {
    let obj = null;
    
    // Try to get from pool
    if (this.available.length > 0) {
      obj = this.available.pop();
      obj.visible = true;
    } else {
      // Create new object
      obj = creator(...args);
      this.createCount++;
    }
    
    this.active.add(obj);
    return obj;
  }
  
  release(obj, scene) {
    if (!this.active.has(obj)) return;
    
    obj.visible = false;
    this.active.delete(obj);
    
    // Remove from scene to free memory
    if (scene && obj.parent === scene) {
      scene.remove(obj);
    }
    
    // Only keep in pool if under max size
    if (this.available.length < this.maxSize) {
      this.available.push(obj);
    } else {
      // Dispose excess objects
      this.disposeObject(obj);
    }
  }
  
  disposeObject(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material && !obj.material.shared) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
    // Clear references
    obj.userData = {};
  }
  
  dispose() {
    // Dispose all objects
    [...this.available, ...this.active].forEach(obj => this.disposeObject(obj));
    this.available = [];
    this.active.clear();
    this.createCount = 0;
  }
  
  getStats() {
    return {
      active: this.active.size,
      pooled: this.available.length,
      totalCreated: this.createCount
    };
  }
}

// Categorized grass pool for better reuse
class GrassPool {
  constructor() {
    this.pools = {
      small: new ObjectPool(),
      medium: new ObjectPool(),
      large: new ObjectPool()
    };
  }
  
  getCategory(size, count) {
    const totalSize = size * count;
    if (totalSize < 5000) return 'small';
    if (totalSize < 10000) return 'medium';
    return 'large';
  }
  
  get(size, count) {
    const category = this.getCategory(size, count);
    return this.pools[category].get(() => {
      const grass = new Grass(size, count);
      grass.userData.size = size;
      grass.userData.count = count;
      grass.userData.category = category;
      return grass;
    });
  }
  
  release(grass, scene) {
    const category = grass.userData.category || 'medium';
    this.pools[category].release(grass, scene);
  }
  
  dispose() {
    Object.values(this.pools).forEach(pool => pool.dispose());
  }
  
  getStats() {
    const stats = {};
    Object.entries(this.pools).forEach(([key, pool]) => {
      stats[key] = pool.getStats();
    });
    return stats;
  }
}

// Initialize pools
const grassPool = new GrassPool();
const treePool = new ObjectPool(MAX_POOL_SIZE);

// Utilities
const interpolate = (val, oldMin, oldMax, newMin, newMax) => ((val - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
const centerBiasedRandom = () => Math.pow(Math.random(), 1.5) * 2 - 1;

// Texture creation with disposal tracking
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
  texture.userData.disposable = true; // Mark for disposal
  return texture;
}

function createDefaultTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, '#ffffff'); 
  gradient.addColorStop(1, '#dddddd');
  ctx.fillStyle = gradient; 
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.userData.disposable = true;
  return texture;
}

// Optimized Grass Geometry with better memory management
class GrassGeometry extends THREE.BufferGeometry {
  constructor(size, count) {
    super();
    
    // Pre-allocate arrays for better memory efficiency
    const vertexCount = count * BLADE_VERTEX_COUNT * 3;
    const positions = new Float32Array(vertexCount);
    const uvs = new Float32Array(count * BLADE_VERTEX_COUNT * 2);
    const indices = [];
    
    let posIndex = 0;
    let uvIndex = 0;

    for (let i = 0; i < count; i++) {
      const radius = (size / 2) * Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const x = radius * Math.cos(theta);
      const y = radius * Math.sin(theta);
      
      // UV coordinates
      for (let j = 0; j < BLADE_VERTEX_COUNT; j++) {
        uvs[uvIndex++] = interpolate(x, -size/2, size/2, 0, 1);
        uvs[uvIndex++] = j >= 2 ? (j === 4 ? 1.0 : 0.5) : 0;
      }
      
      // Blade positions
      const blade = this.computeBlade([x, 0, y], i);
      for (let j = 0; j < blade.positions.length; j++) {
        positions[posIndex++] = blade.positions[j];
      }
      indices.push(...blade.indices);
    }

    this.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.setIndex(indices);
    this.computeVertexNormals();
    
    // Mark as non-dynamic for better GPU caching
    this.attributes.position.setUsage(THREE.StaticDrawUsage);
    this.attributes.uv.setUsage(THREE.StaticDrawUsage);
  }

  computeBlade(center, index = 0) {
    const height = BLADE_HEIGHT + Math.random() * BLADE_HEIGHT_VARIATION;
    const vIndex = index * BLADE_VERTEX_COUNT;
    const yaw = Math.random() * Math.PI * 2;
    const bend = Math.random() * Math.PI * 2;
    const yawVec = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const bendVec = [Math.sin(bend), 0, -Math.cos(bend)];
    
    const bl = yawVec.map((n, i) => n * (BLADE_WIDTH / 2) + center[i]);
    const br = yawVec.map((n, i) => n * (BLADE_WIDTH / -2) + center[i]);
    const tl = yawVec.map((n, i) => n * (BLADE_WIDTH / 4) + center[i]);
    const tr = yawVec.map((n, i) => n * (BLADE_WIDTH / -4) + center[i]);
    const tc = bendVec.map((n, i) => n * BLADE_TIP_OFFSET + center[i]);
    
    tl[1] += height / 2; 
    tr[1] += height / 2; 
    tc[1] += height;
    
    return {
      positions: [...bl, ...br, ...tr, ...tl, ...tc],
      indices: [
        vIndex, vIndex + 1, vIndex + 2, 
        vIndex + 2, vIndex + 4, vIndex + 3, 
        vIndex + 3, vIndex, vIndex + 2
      ]
    };
  }
}

// Grass Mesh
class Grass extends THREE.Mesh {
  constructor(size, count) {
    const geometry = new GrassGeometry(size, count);
    super(geometry, sharedGrassMaterial);
    this.material.shared = true; // Mark as shared to prevent disposal
  }
}

// Tree creation with proper material sharing
function createTreeCreator(modelIndex) {
  return () => {
    let tree;
    
    if (modelIndex === -1 || treeModels.length === 0) {
      // Fallback box tree
      const geometry = new THREE.BoxGeometry(2, 5, 2);
      const material = sharedTreeMaterials.get('default') || 
                       new THREE.MeshPhysicalMaterial({ color: 0x228B22 });
      material.shared = true;
      tree = new THREE.Mesh(geometry, material);
      tree.userData.modelIndex = -1;
      console.log("no tree models loaded, using box fallback");
    } else {
      // Clone from loaded models
      const model = treeModels[modelIndex];
      tree = model.clone();
      
      // Apply shared materials
      tree.traverse(child => {
        if (child.isMesh && child.material) {
          const materialName = child.material.name || 'default';
          if (sharedTreeMaterials.has(materialName)) {
            child.material = sharedTreeMaterials.get(materialName);
            child.material.shared = true;
          }
        }
      });
      
      tree.userData.modelIndex = modelIndex;
    }
    
    return tree;
  };
}

// Vegetation creation functions
function createGrassPatch(scene, x, z, size, count) {
  const grassPatch = grassPool.get(size, count);
  grassPatch.position.set(x, 0, z);
  
  if (!grassPatch.parent) {
    scene.add(grassPatch);
  }
  
  grassPatches.push(grassPatch);
  return grassPatch;
}

function createTree(scene, x, z) {
  const modelIndex = treeModels.length > 0 ? 
    Math.floor(Math.random() * treeModels.length) : -1;
  
  const tree = treePool.get(createTreeCreator(modelIndex));
  tree.position.set(x, modelIndex === -1 ? 2.5 : 0, z);
  tree.rotation.y = 0;
  
  if (!tree.parent) {
    scene.add(tree);
  }
  
  trees.push(tree);
  return tree;
}

function createInitialVegetation(scene) {
  if (isDisposed) return;
  
  // Clear existing - properly return to pools
  grassPatches.forEach(patch => grassPool.release(patch, scene));
  trees.forEach(tree => treePool.release(tree, scene));
  grassPatches = []; 
  trees = [];
  
  // Create grass patches
  createGrassPatch(scene, 0, -40, MAX_PATCH_SIZE, MAX_BLADE_COUNT);
  
  for (let z = -20; z > -200; z -= 25) {
    const patchesInRow = Math.max(2, Math.floor(6 * (1 - Math.abs(z) / 200)));
    for (let i = 0; i < patchesInRow; i++) {
      const x = centerBiasedRandom() * GRASS_SPREAD;
      const sizeFactor = 1 - Math.sqrt(x*x + z*z) / 
                         Math.sqrt(GRASS_SPREAD*GRASS_SPREAD + 200*200) * 0.5;
      const size = MIN_PATCH_SIZE + (MAX_PATCH_SIZE - MIN_PATCH_SIZE) * sizeFactor;
      const count = MIN_BLADE_COUNT + 
                   Math.floor((MAX_BLADE_COUNT - MIN_BLADE_COUNT) * sizeFactor);
      createGrassPatch(scene, x, z, size, count);
    }
  }
  
  // Create trees
  for (let i = 0; i < TREE_ROWS; i++) {
  const z = -100 - (i * 10);
  for (let j = 0; j < TREES_PER_ROW_ATTEMPTS; j++) {
      const x = (Math.random() * 2 - 1) * TREE_SPREAD;
      if (!trees.some(t => 
        Math.pow(t.position.x - x, 2) + 
        Math.pow(t.position.z - z, 2) < MIN_DISTANCE * MIN_DISTANCE)) {
        createTree(scene, x, z);
      }
    }
  }
}

function createNewVegetation(scene, type) {
  if (isDisposed) return false;
  
  for (let attempts = 0; attempts < 10; attempts++) {
    const spread = type === 'grass' ? GRASS_SPREAD : TREE_SPREAD;
    const x = (type === 'grass' ? centerBiasedRandom() : (Math.random() * 2 - 1)) * spread;
    const z = GENERATION_Z - (Math.random() * 50);
    
    const existing = type === 'grass' ? grassPatches : trees;
    const tooClose = existing.some(obj => 
      Math.pow(obj.position.x - x, 2) + 
      Math.pow(obj.position.z - z, 2) < MIN_DISTANCE * MIN_DISTANCE
    );
    
    const tooCloseToCamera = type === 'tree' && Math.abs(x) < TREE_CLEARANCE_FROM_CENTER;
    
    if (!tooClose && !tooCloseToCamera) {
      if (type === 'grass') {
        const sizeFactor = 1 - Math.abs(x) / spread * 0.5;
        const size = MIN_PATCH_SIZE + (MAX_PATCH_SIZE - MIN_PATCH_SIZE) * sizeFactor;
        const count = MIN_BLADE_COUNT + 
                     Math.floor((MAX_BLADE_COUNT - MIN_BLADE_COUNT) * sizeFactor);
        createGrassPatch(scene, x, z, size, count);
      } else if (type === 'tree') {
        createTree(scene, x, z);
      }
      return true;
    }
  }
  return false;
}

// Main functions
export function init(scene, manager) {
  isDisposed = false;
  gradientTexture = createGradientTexture();
  
  // Create shared grass material once
  sharedGrassMaterial = new THREE.MeshPhysicalMaterial({
    map: gradientTexture,
    roughness: 0.8,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    alphaMap: gradientTexture,
    alphaTest: 0.1
  });
  sharedGrassMaterial.shared = true;
  
  // Create default tree material
  const defaultTreeMaterial = new THREE.MeshPhysicalMaterial({ color: 0x228B22 });
  defaultTreeMaterial.shared = true;
  sharedTreeMaterials.set('default', defaultTreeMaterial);
  
  // Load cloud texture for grass
  const textureLoader = new THREE.TextureLoader(manager);
  textureLoader.load('images/cloud.jpg', 
    texture => { 
      cloudTexture = texture; 
      cloudTexture.userData.disposable = true;
      resourcesLoaded.grass = true; 
    },
    undefined,
    error => { 
      cloudTexture = createDefaultTexture(); 
      resourcesLoaded.grass = true; 
    }
  );
  
  // Load tree models
  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.load('mesh/trees_01.glb',
    gltf => {
      gltf.scene.traverse(child => {
        if (child.isMesh && child.name.includes("Tree_")) {
          treeModels.push(child);
          
          // Cache tree materials
          if (child.material && !sharedTreeMaterials.has(child.material.name)) {
            child.material.shared = true;
            sharedTreeMaterials.set(child.material.name, child.material);
          }
        }
      });
      resourcesLoaded.trees = true;
   
    },
  

  );
}

export function createInitialVegetationWhenReady(scene) {
  if (Object.values(resourcesLoaded).every(Boolean)) {
    createInitialVegetation(scene);
  }
}

export function updateVegetation(scene, deltaZ = 0.5) {
  if (!Object.values(resourcesLoaded).every(Boolean) || isDisposed) {
    return { grass: 0, trees: 0 };
  }
  
  // Move all vegetation forward
  [...grassPatches, ...trees].forEach(obj => {
    obj.position.z += deltaZ;
  });
  
  // Remove old vegetation and create new
  // Handle grass patches
  for (let i = grassPatches.length - 1; i >= 0; i--) {
    if (grassPatches[i].position.z > REMOVAL_Z) {
      const patch = grassPatches[i];
      grassPool.release(patch, scene);
      grassPatches.splice(i, 1);
      createNewVegetation(scene, 'grass');
    }
  }
  
  // Handle trees
  for (let i = trees.length - 1; i >= 0; i--) {
    if (trees[i].position.z > REMOVAL_Z) {
      const tree = trees[i];
      treePool.release(tree, scene);
      trees.splice(i, 1);
      createNewVegetation(scene, 'tree');
    }
  }
  
  return { grass: grassPatches.length, trees: trees.length };
}

// Clear all vegetation from scene
export function clearAllVegetation(scene) {
  // Properly release all objects back to pools
  grassPatches.forEach(patch => grassPool.release(patch, scene));
  trees.forEach(tree => treePool.release(tree, scene));
  
  grassPatches = [];
  trees = [];
}

// Get pool statistics for debugging
export function getPoolStats() {
  return {
    grass: grassPool.getStats(),
    trees: treePool.getStats()
  };
}

export const isLoaded = () => Object.values(resourcesLoaded).every(Boolean);
export const getTreeCount = () => trees.length;
export const getAllTrees = () => trees;
export const getAllGrassPatches = () => grassPatches;

export function dispose() {
  isDisposed = true;
  
  // Clear from scene first
  grassPatches.forEach(patch => {
    if (patch.parent) patch.parent.remove(patch);
  });
  trees.forEach(tree => {
    if (tree.parent) tree.parent.remove(tree);
  });
  
  // Dispose pools
  grassPool.dispose();
  treePool.dispose();
  
  // Clear arrays
  grassPatches = []; 
  trees = []; 
  treeModels = [];
  
  // Dispose shared materials
  if (sharedGrassMaterial) {
    sharedGrassMaterial.dispose();
    sharedGrassMaterial = null;
  }
  
  sharedTreeMaterials.forEach(material => {
    if (material && !material.shared) material.dispose();
  });
  sharedTreeMaterials.clear();
  
  // Dispose textures
  if (cloudTexture && cloudTexture.userData.disposable) {
    cloudTexture.dispose();
    cloudTexture = null;
  }
  if (gradientTexture && gradientTexture.userData.disposable) {
    gradientTexture.dispose();
    gradientTexture = null;
  }
  
  resourcesLoaded = { trees: false, grass: false };
}
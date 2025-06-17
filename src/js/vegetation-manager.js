import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as GUI from './gui.js';

// Constants
const BLADE_WIDTH = 0.2, BLADE_HEIGHT = 1.2, BLADE_HEIGHT_VARIATION = 0.8, BLADE_VERTEX_COUNT = 5, BLADE_TIP_OFFSET = 0.1;
const GRASS_SPREAD = 10, TREE_SPREAD = 20, MIN_DISTANCE = 5, REMOVAL_Z = 20, GENERATION_Z = -70;
const MIN_PATCH_SIZE = 10, MAX_PATCH_SIZE = 15, MIN_BLADE_COUNT = 500, MAX_BLADE_COUNT = 600;
const TREE_CLEARANCE_FROM_CENTER = 5

// State
let grassPatches = [], trees = [], treeModels = [], resourcesLoaded = { trees: false, grass: false };
let cloudTexture, gradientTexture;

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

// Grass Mesh
class Grass extends THREE.Mesh {
  constructor(size, count) {
    const geometry = new GrassGeometry(size, count);
    const alphaTexture = gradientTexture || createGradientTexture();
    const material = new THREE.MeshPhysicalMaterial({
      map: alphaTexture, roughness: 0.8, metalness: 0,
      side: THREE.DoubleSide, transparent: true, alphaMap: alphaTexture, alphaTest: 0.1
    });
    super(geometry, material);
  }
}

// Vegetation Management
function createGrassPatch(scene, x, z, size, count) {
  const grassPatch = new Grass(size, count);
  grassPatch.position.set(x, 0, z);
  scene.add(grassPatch); grassPatches.push(grassPatch);
  return grassPatch;
}

function createTree(x, z) {
  if (treeModels.length === 0) {
    const geometry = new THREE.BoxGeometry(2, 5, 2);
    const material = new THREE.MeshPhysicalMaterial({ color: 0x228B22 });
    const box = new THREE.Mesh(geometry, material);
    box.position.set(x, 2.5, z);
    return box;
  }
  
  const tree = treeModels[Math.floor(Math.random() * treeModels.length)].clone();
  tree.position.set(x, 0, z);
  return tree;
}

function createInitialVegetation(scene) {
  // Clear existing
  [...grassPatches, ...trees].forEach(obj => scene.remove(obj));
  grassPatches = []; trees = [];
  
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
        scene.add(tree); trees.push(tree);
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
    
    // For trees, check if they're too close to the camera path (x near 0)
    const tooCloseToCamera = type === 'tree' && Math.abs(x) < TREE_CLEARANCE_FROM_CENTER;
    
    if (!tooClose && !tooCloseToCamera) {
      if (type === 'grass') {
        const sizeFactor = 1 - Math.abs(x) / spread * 0.5;
        const size = MIN_PATCH_SIZE + (MAX_PATCH_SIZE - MIN_PATCH_SIZE) * sizeFactor;
        const count = MIN_BLADE_COUNT + Math.floor((MAX_BLADE_COUNT - MIN_BLADE_COUNT) * sizeFactor);
        createGrassPatch(scene, x, z, size, count);
      } else if (type === 'tree') {
        const tree = createTree(x, z);
        scene.add(tree); trees.push(tree);
      }
      return true;
    }
  }
  return false;
}

// Main functions
export function init(scene, manager) {
  gradientTexture = createGradientTexture();
  
  // Load cloud texture for grass
  const textureLoader = new THREE.TextureLoader(manager);
  textureLoader.load('images/cloud.jpg', 
    texture => { cloudTexture = texture; resourcesLoaded.grass = true; },
    undefined,
    error => { cloudTexture = createDefaultTexture(); resourcesLoaded.grass = true; }
  );
  
  // Load tree models
  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.load('mesh/trees_01.glb',
    gltf => {
      gltf.scene.traverse(child => {
        if (child.isMesh && child.name.includes("Tree_")) treeModels.push(child);
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
  
  // Move all vegetation
  [...grassPatches, ...trees].forEach(obj => obj.position.z += deltaZ);
  
  // Remove and create new vegetation
  // Handle grass patches
  for (let i = grassPatches.length - 1; i >= 0; i--) {
    if (grassPatches[i].position.z > REMOVAL_Z) {
      scene.remove(grassPatches[i]);
      if (grassPatches[i].geometry) grassPatches[i].geometry.dispose();
      if (grassPatches[i].material) grassPatches[i].material.dispose();
      grassPatches.splice(i, 1);
      createNewVegetation(scene, 'grass');
    }
  }
  
  // Handle trees
  for (let i = trees.length - 1; i >= 0; i--) {
    if (trees[i].position.z > REMOVAL_Z) {
      scene.remove(trees[i]);
      if (trees[i].geometry) trees[i].geometry.dispose();
      if (trees[i].material) trees[i].material.dispose();
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
  [...grassPatches, ...trees].forEach(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  grassPatches = []; trees = []; treeModels = [];
  if (cloudTexture) cloudTexture.dispose();
  if (gradientTexture) gradientTexture.dispose();
  resourcesLoaded = { trees: false, grass: false };
}
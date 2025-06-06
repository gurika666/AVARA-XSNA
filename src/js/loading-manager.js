// loading-manager.js - Centralized loading management
import * as THREE from 'three';

// Create a custom loading manager with progress tracking
export function create(onProgress, onComplete, onError) {
  const manager = new THREE.LoadingManager();
  
  let itemsLoaded = 0;
  let itemsTotal = 0;
  let loadingStartTime = Date.now();
  
  // Track individual resource progress
  const resourceProgress = new Map();
  
  manager.onStart = (url, loaded, total) => {
    itemsLoaded = loaded;
    itemsTotal = total;
    loadingStartTime = Date.now();
    console.log(`Loading started: ${loaded}/${total} items`);
  };
  
  manager.onProgress = (url, loaded, total) => {
    itemsLoaded = loaded;
    itemsTotal = total;
    
    // Extract resource type from URL
    const resourceType = getResourceType(url);
    resourceProgress.set(resourceType, { loaded, total });
    
    // Calculate overall progress
    const overallProgress = (loaded / total) * 100;
    
    if (onProgress) {
      onProgress(url, loaded, total, overallProgress, resourceType);
    }
    
    console.log(`Loading progress: ${url} - ${loaded}/${total} (${overallProgress.toFixed(1)}%)`);
  };
  
  manager.onLoad = () => {
    const loadingTime = (Date.now() - loadingStartTime) / 1000;
    console.log(`All resources loaded in ${loadingTime.toFixed(2)} seconds`);
    
    if (onComplete) {
      onComplete(loadingTime);
    }
  };
  
  manager.onError = (url) => {
    console.error(`Error loading: ${url}`);
    
    if (onError) {
      onError(url);
    }
  };
  
  return manager;
}

// Helper function to determine resource type from URL
function getResourceType(url) {
  if (url.includes('.hdr')) return 'environment';
  if (url.includes('.png') || url.includes('.jpg')) return 'texture';
  if (url.includes('.json') && url.includes('font')) return 'font';
  if (url.includes('.glb') || url.includes('.gltf')) return 'model';
  if (url.includes('.mp3') || url.includes('.wav')) return 'audio';
  if (url.includes('tree')) return 'vegetation';
  return 'other';
}

// Preload check to see if resources are cached
export function checkCachedResources(urls) {
  const cached = [];
  const notCached = [];
  
  // This is a simplified check - in a real app you might use
  // service workers or check browser cache more thoroughly
  urls.forEach(url => {
    // Check if the resource might be in memory/cache
    const img = new Image();
    img.src = url;
    
    if (img.complete && img.naturalHeight !== 0) {
      cached.push(url);
    } else {
      notCached.push(url);
    }
  });
  
  return { cached, notCached };
}

// Resource priority queue for optimal loading order
export class ResourceQueue {
  constructor() {
    this.queue = [];
    this.priorities = {
      'environment': 1,  // Load HDR first for lighting
      'font': 2,         // Load fonts early
      'texture': 3,      // Textures next
      'model': 4,        // Models can be larger
      'audio': 5,        // Audio can load in parallel
      'vegetation': 6    // Vegetation last
    };
  }
  
  add(resource, type, loader) {
    const priority = this.priorities[type] || 999;
    this.queue.push({ resource, type, loader, priority });
    this.queue.sort((a, b) => a.priority - b.priority);
  }
  
  async loadAll(onProgress) {
    const results = [];
    
    // Group by priority for parallel loading
    const groups = {};
    this.queue.forEach(item => {
      if (!groups[item.priority]) {
        groups[item.priority] = [];
      }
      groups[item.priority].push(item);
    });
    
    // Load each priority group in parallel
    for (const priority in groups) {
      const group = groups[priority];
      const groupPromises = group.map(item => 
        item.loader().catch(error => {
          console.error(`Failed to load ${item.type}: ${item.resource}`, error);
          return null;
        })
      );
      
      const groupResults = await Promise.all(groupPromises);
      results.push(...groupResults);
      
      if (onProgress) {
        const loaded = results.filter(r => r !== null).length;
        const total = this.queue.length;
        onProgress(loaded, total);
      }
    }
    
    return results;
  }
}

// Performance monitoring for loading
export class LoadingPerformance {
  constructor() {
    this.metrics = {
      startTime: 0,
      endTime: 0,
      resourceTimes: new Map(),
      resourceSizes: new Map()
    };
  }
  
  start() {
    this.metrics.startTime = performance.now();
  }
  
  recordResource(url, startTime, size = 0) {
    const loadTime = performance.now() - startTime;
    this.metrics.resourceTimes.set(url, loadTime);
    if (size > 0) {
      this.metrics.resourceSizes.set(url, size);
    }
  }
  
  end() {
    this.metrics.endTime = performance.now();
    const totalTime = this.metrics.endTime - this.metrics.startTime;
    
    // Calculate statistics
    const times = Array.from(this.metrics.resourceTimes.values());
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    
    return {
      totalTime,
      avgTime,
      maxTime,
      minTime,
      resourceCount: times.length,
      totalSize: Array.from(this.metrics.resourceSizes.values()).reduce((a, b) => a + b, 0)
    };
  }
  
  getSlowResources(threshold = 1000) {
    const slow = [];
    this.metrics.resourceTimes.forEach((time, url) => {
      if (time > threshold) {
        slow.push({ url, time });
      }
    });
    return slow.sort((a, b) => b.time - a.time);
  }
}

// Retry logic for failed resources
export async function loadWithRetry(loadFn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await loadFn();
    } catch (error) {
      lastError = error;
      console.warn(`Load attempt ${i + 1} failed, retrying in ${delay}ms...`);
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

// Progressive loading for better perceived performance
export class ProgressiveLoader {
  constructor() {
    this.criticalResources = [];
    this.deferredResources = [];
  }
  
  addCritical(resource) {
    this.criticalResources.push(resource);
  }
  
  addDeferred(resource) {
    this.deferredResources.push(resource);
  }
  
  async load(onCriticalComplete, onAllComplete) {
    // Load critical resources first
    console.log('Loading critical resources...');
    await Promise.all(this.criticalResources);
    
    if (onCriticalComplete) {
      onCriticalComplete();
    }
    
    // Then load deferred resources
    console.log('Loading deferred resources...');
    await Promise.all(this.deferredResources);
    
    if (onAllComplete) {
      onAllComplete();
    }
  }
}

// Export utility functions
export default {
  create,
  checkCachedResources,
  ResourceQueue,
  LoadingPerformance,
  loadWithRetry,
  ProgressiveLoader
};
import * as THREE from 'three';
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

export class LineHandler {
  constructor(config) {
    this.config = config;
    this.lineCurves = [];
  }

  /**
   * Process an edge-only model to extract and create curves
   * @param {THREE.Object3D} modelScene - The model scene to process
   * @returns {Array} - Array of Line2 objects representing the curves
   */
  createCurvesFromEdgeModel(modelScene) {
    // First pass: collect all edge vertices to be able to index them globally
    const allVertices = [];
    const processedVertexIndices = new Map(); // Map to track processed vertices
    let vertexIndex = 0;
    
    // Collect all unique vertices from objects with "line_" in their names
    modelScene.traverse((child) => {
      // Only process objects that include "line_" in their names
      if ((child.isMesh || child.isLine || child.isLineSegments) && child.name.includes("line_")) {
        const geometry = child.geometry;
        const positions = geometry.attributes.position;
        const indices = geometry.index;
        
        if (indices) {
          // For indexed geometry
          for (let i = 0; i < indices.count; i++) {
            const idx = indices.getX(i);
            const vertex = new THREE.Vector3(
              positions.getX(idx),
              positions.getY(idx),
              positions.getZ(idx)
            );
            
            // Transform to world coordinates
            const worldVertex = vertex.clone().applyMatrix4(child.matrixWorld);
            
            // Create a unique key for this vertex position
            const vertexKey = `${worldVertex.x.toFixed(5)},${worldVertex.y.toFixed(5)},${worldVertex.z.toFixed(5)}`;
            
            if (!processedVertexIndices.has(vertexKey)) {
              processedVertexIndices.set(vertexKey, vertexIndex++);
              allVertices.push(worldVertex);
            }
          }
        } else {
          // For non-indexed geometry
          for (let i = 0; i < positions.count; i++) {
            const vertex = new THREE.Vector3(
              positions.getX(i),
              positions.getY(i),
              positions.getZ(i)
            );
            
            // Transform to world coordinates
            const worldVertex = vertex.clone().applyMatrix4(child.matrixWorld);
            
            // Create a unique key for this vertex position
            const vertexKey = `${worldVertex.x.toFixed(5)},${worldVertex.y.toFixed(5)},${worldVertex.z.toFixed(5)}`;
            
            if (!processedVertexIndices.has(vertexKey)) {
              processedVertexIndices.set(vertexKey, vertexIndex++);
              allVertices.push(worldVertex);
            }
          }
        }
      }
    });
    
    console.log(`Collected ${allVertices.length} unique vertices from objects with "line_" in their names`);
    
    // Second pass: create line segments and apply global coloring
    modelScene.traverse((child) => {
      // Only process objects that include "line_" in their names
      if ((child.isMesh || child.isLine || child.isLineSegments) && child.name.includes("line_")) {
        const geometry = child.geometry;
        const positions = geometry.attributes.position;
        const indices = geometry.index;
        
        const processedEdges = new Set();
        
        if (indices) {
          // For indexed geometry, process each edge pair
          for (let i = 0; i < indices.count; i += 2) {
            if (i + 1 < indices.count) {
              const idx1 = indices.getX(i);
              const idx2 = indices.getX(i + 1);
              
              // Create unique key for this edge to avoid duplicates
              const edgeKey = idx1 < idx2 ? `${idx1}-${idx2}` : `${idx2}-${idx1}`;
              
              if (!processedEdges.has(edgeKey)) {
                processedEdges.add(edgeKey);
                
                const start = new THREE.Vector3(
                  positions.getX(idx1),
                  positions.getY(idx1),
                  positions.getZ(idx1)
                );
                
                const end = new THREE.Vector3(
                  positions.getX(idx2),
                  positions.getY(idx2),
                  positions.getZ(idx2)
                );
                
                // Get world positions
                const startWorld = start.clone().applyMatrix4(child.matrixWorld);
                const endWorld = end.clone().applyMatrix4(child.matrixWorld);
                
                // Find corresponding indices in the global vertex array
                const startKey = `${startWorld.x.toFixed(5)},${startWorld.y.toFixed(5)},${startWorld.z.toFixed(5)}`;
                const endKey = `${endWorld.x.toFixed(5)},${endWorld.y.toFixed(5)},${endWorld.z.toFixed(5)}`;
                
                const startGlobalIdx = processedVertexIndices.get(startKey);
                const endGlobalIdx = processedVertexIndices.get(endKey);
                
                this.createGradientLine(child, start, end, startGlobalIdx, endGlobalIdx, allVertices.length);
              }
            }
          }
        } else {
          // For non-indexed geometry, assume vertices are in pairs
          for (let i = 0; i < positions.count; i += 2) {
            if (i + 1 < positions.count) {
              const start = new THREE.Vector3(
                positions.getX(i),
                positions.getY(i),
                positions.getZ(i)
              );
              
              const end = new THREE.Vector3(
                positions.getX(i + 1),
                positions.getY(i + 1),
                positions.getZ(i + 1)
              );
              
              // Get world positions
              const startWorld = start.clone().applyMatrix4(child.matrixWorld);
              const endWorld = end.clone().applyMatrix4(child.matrixWorld);
              
              // Find corresponding indices in the global vertex array
              const startKey = `${startWorld.x.toFixed(5)},${startWorld.y.toFixed(5)},${startWorld.z.toFixed(5)}`;
              const endKey = `${endWorld.x.toFixed(5)},${endWorld.y.toFixed(5)},${endWorld.z.toFixed(5)}`;
              
              const startGlobalIdx = processedVertexIndices.get(startKey);
              const endGlobalIdx = processedVertexIndices.get(endKey);
              
              this.createGradientLine(child, start, end, startGlobalIdx, endGlobalIdx, allVertices.length);
            }
          }
        }
      }
    });
    
    console.log(`Created ${this.lineCurves.length} Bézier curves with global HSL gradient from objects with "line_" in their names`);
    return this.lineCurves;
  }

  /**
   * Create a Bézier curve with color based on global vertex indices
   * @param {THREE.Object3D} object - The object containing the edge
   * @param {THREE.Vector3} startPoint - The start point of the edge
   * @param {THREE.Vector3} endPoint - The end point of the edge
   * @param {Number} startGlobalIdx - The global index of the start vertex
   * @param {Number} endGlobalIdx - The global index of the end vertex
   * @param {Number} totalVertices - The total number of vertices
   */
  createGradientLine(object, startPoint, endPoint, startGlobalIdx, endGlobalIdx, totalVertices) {
    // Create Bézier curve between the two points
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
    const offset = new THREE.Vector3().subVectors(endPoint, startPoint).multiplyScalar(this.config.bezierCurveAmount);
    
    // Perpendicular offset for control points to create a curve
    const perpOffset = new THREE.Vector3(-offset.y, offset.x, offset.z);
    
    const controlPoint1 = new THREE.Vector3().addVectors(midPoint, perpOffset);
    const controlPoint2 = new THREE.Vector3().subVectors(midPoint, perpOffset);
    
    const curve = new THREE.CubicBezierCurve3(
      startPoint,
      controlPoint1,
      controlPoint2,
      endPoint
    );
    
    // Sample points along the curve - INCREASED for smoother lines
    const pointCount = 20; // Increased from 20 to 50 for smoother curves
    const curvePoints = curve.getPoints(pointCount);
    
    // Extract positions for Line2
    const positions = [];
    const colors = [];
    
    // Calculate normalized positions of start and end vertices in global vertex array
    const startNormalized = startGlobalIdx / (totalVertices - 1);  // 0 to 1
    const endNormalized = endGlobalIdx / (totalVertices - 1);      // 0 to 1
    
    // Create color for start and end vertices using HSL, same approach as example
    const startColor = new THREE.Color();
    const endColor = new THREE.Color();
    
    // Use HSL color space where hue varies with position (0 to 1)
    startColor.setHSL(0.12, 1.0, 0.5, THREE.SRGBColorSpace);
    endColor.setHSL(0.12, 1.0, 0.5, THREE.SRGBColorSpace);
    
    // For each point along the curve, interpolate between the global-indexed start and end colors
    for (let i = 0; i < curvePoints.length; i++) {
      const point = curvePoints[i];
      positions.push(point.x, point.y, point.z);
      
      // Calculate interpolation factor along this specific line
      const alpha = i / (curvePoints.length - 1);
      
      // Interpolate between the start and end colors for this line
      const color = new THREE.Color().lerpColors(
        startColor,
        endColor,
        alpha
      );
      
      colors.push(color.r, color.g, color.b);
    }
    
    // Create Line2 geometry
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);
    
    // Calculate a unique line width for this curve
    // Generate a unique width based on the indices of the vertices
    // This creates variation between different lines
    const uniqueWidth = this.getUniqueLineWidth(startGlobalIdx, endGlobalIdx, totalVertices);
    
    // Create Line2 material with width control - ADJUSTED settings for smoother lines
    const material = new LineMaterial({
      color: 0xffffff,
      linewidth: uniqueWidth,
      vertexColors: true,
      worldUnits: false,
      alphaToCoverage: true,
      alphaTest: 0.0,       // Added to match example
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      opacity: this.config.opacity,
      transparent: true,
      dashed: false         // Explicitly set to false to match example
    });
    
    // Create Line2
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    
    // Apply transformations from the original object
    line.applyMatrix4(object.matrixWorld);
    
    // Store the custom width with the line for later reference
    line.userData.customWidth = uniqueWidth;
    
    // Add to our curves array
    this.lineCurves.push(line);
    
    return line;
  }

  /**
   * Generate a unique line width based on vertex indices
   * @param {Number} startIdx - The start vertex index
   * @param {Number} endIdx - The end vertex index
   * @param {Number} totalVertices - Total number of vertices
   * @returns {Number} - A width value between config min and max
   */
  getUniqueLineWidth(startIdx, endIdx, totalVertices) {
    // Ensure we have min and max width in config, or use defaults
    const minWidth = this.config.minLineWidth || 0.5;
    const maxWidth = this.config.maxLineWidth || 4.0;
    
    // Create a more complex hash function that produces more variation
    // Use prime numbers and additional operations to create more "random" patterns
    const hash1 = ((startIdx * 31) + (endIdx * 17)) % totalVertices;
    const hash2 = ((startIdx * 7) + (endIdx * 23)) % totalVertices;
    const hash3 = ((startIdx + endIdx) * 13) % totalVertices;
    
    // Combine the hashes in a non-linear way 
    const combinedHash = (hash1 * hash2 + hash3) % totalVertices;
    
    // Apply a sine wave to the normalized hash to introduce more variation
    const normalizedHash = combinedHash / totalVertices;
    const sineInfluence = Math.sin(normalizedHash * Math.PI * 2) * 0.5 + 0.5;
    
    // Add a secondary pattern based on the actual vertex positions
    const positionFactor = (Math.abs(startIdx - endIdx) % 5) / 5;
    
    // Combine the factors with different weights
    const randomFactor = sineInfluence * 0.7 + positionFactor * 0.3;
    
    // Apply a non-linear distribution to favor certain widths if desired
    // The power makes the distribution favor thinner or thicker lines based on the value
    // Values > 1 will favor thinner lines, < 1 will favor thicker lines
    const powerFactor = this.config.widthDistribution || 1.0;
    const biasedFactor = Math.pow(randomFactor, powerFactor);
    
    // Map to the width range
    return minWidth + biasedFactor * (maxWidth - minWidth);
  }

  /**
   * Update the resolution for all line materials
   * @param {Number} width - The window width
   * @param {Number} height - The window height
   */
  updateResolution(width, height) {
    this.lineCurves.forEach(curve => {
      if (curve.material) {
        curve.material.resolution.set(width, height);
      }
    });
  }

  /**
   * Get all line curves
   * @returns {Array} - Array of Line2 objects
   */
  getLineCurves() {
    return this.lineCurves;
  }

  /**
   * Update line material properties
   * @param {Object} params - Parameters to update
   */
  updateLineProperties(params) {
    if (!params) return;
    
    // Update global config if needed
    if (params.lineWidth !== undefined) this.config.lineWidth = params.lineWidth;
    if (params.minLineWidth !== undefined) this.config.minLineWidth = params.minLineWidth;
    if (params.maxLineWidth !== undefined) this.config.maxLineWidth = params.maxLineWidth;
    if (params.widthDistribution !== undefined) this.config.widthDistribution = params.widthDistribution;
    if (params.opacity !== undefined) this.config.opacity = params.opacity;
    if (params.bezierCurveAmount !== undefined) this.config.bezierCurveAmount = params.bezierCurveAmount;
    
    // If lines already exist and we need to update their properties
    if (params.updateExisting) {
      this.lineCurves.forEach(curve => {
        if (curve.material) {
          // If we're updating all widths with the same value
          if (params.setUniformWidth && params.lineWidth !== undefined) {
            curve.material.linewidth = params.lineWidth;
          } 
          // If we're regenerating random widths with true randomness
          else if (params.regenerateWidths) {
            if (params.fullyRandom) {
              // True random values
              const minWidth = this.config.minLineWidth;
              const maxWidth = this.config.maxLineWidth;
              const randomWidth = minWidth + Math.random() * (maxWidth - minWidth);
              curve.material.linewidth = randomWidth;
              curve.userData.customWidth = randomWidth;
            } else {
              // Semi-random values based on the existing width
              const baseWidth = curve.userData.customWidth || this.config.lineWidth;
              const randFactor = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
              const newWidth = baseWidth * randFactor;
              
              // Clamp to min/max range
              curve.material.linewidth = Math.max(
                this.config.minLineWidth, 
                Math.min(this.config.maxLineWidth, newWidth)
              );
              curve.userData.customWidth = curve.material.linewidth;
            }
          }
          
          // Update opacity if needed
          if (params.opacity !== undefined) {
            curve.material.opacity = params.opacity;
          }
        }
      });
    }
  }
  
  /**
   * Completely randomize all line widths
   * This can be called at runtime to create a new random pattern
   */
  randomizeLineWidths() {
    const minWidth = this.config.minLineWidth;
    const maxWidth = this.config.maxLineWidth;
    
    this.lineCurves.forEach(curve => {
      if (curve.material) {
        // Apply different randomization strategies for more variety
        let randomWidth;
        
        // Occasionally create some very thin or very thick lines
        const specialCase = Math.random() < 0.15; // 15% chance for extreme values
        
        if (specialCase) {
          // Create either a very thin or very thick line
          const extremeCase = Math.random() < 0.5;
          if (extremeCase) {
            // Thin line
            randomWidth = minWidth + Math.random() * (minWidth * 0.8);
          } else {
            // Thick line
            randomWidth = maxWidth - Math.random() * (maxWidth * 0.2);
          }
        } else {
          // Normal distribution for most lines
          // Use a bell-curve-like distribution to cluster more lines toward the middle
          const u1 = Math.random();
          const u2 = Math.random();
          // Box-Muller transform for pseudo-normal distribution
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          // Map to our range, with mean at center of range and standard deviation 1/6 of range
          const mean = (minWidth + maxWidth) / 2;
          const stdDev = (maxWidth - minWidth) / 6;
          randomWidth = mean + z * stdDev;
          
          // Clamp to our range
          randomWidth = Math.max(minWidth, Math.min(maxWidth, randomWidth));
        }
        
        curve.material.linewidth = randomWidth;
        curve.userData.customWidth = randomWidth;
      }
    });
    
    console.log('Completely randomized all line widths');
  }
}
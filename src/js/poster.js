import * as THREE from 'three';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Add orbit controls for easier testing
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// Sphere configuration
const radius = 2;
// Use a higher detail level for better deformation results
const geometry = new THREE.PlaneGeometry(1,1,12,12, );
const material = new THREE.MeshPhongMaterial({
    color: 0x2194ce,
    emissive: 0x072534,
    side: THREE.DoubleSide,
    flatShading: false,
    wireframe: true
});

// Create the sphere
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// Store original vertex positions and scales
const originalPositions = geometry.attributes.position.array.slice();
const vertexCount = originalPositions.length / 3;
const originalScales = new Float32Array(vertexCount).fill(1.0);

// Create arrays to track vertex animation
const targetPositions = new Float32Array(originalPositions);
const currentPositions = new Float32Array(originalPositions);
const targetScales = new Float32Array(vertexCount).fill(1.0);
const currentScales = new Float32Array(vertexCount).fill(1.0);

// Set camera position
camera.position.z = 5;

// Sphere of influence
const influenceSphereGeometry = new THREE.SphereGeometry(0.5, 8, 8);
const influenceSphereMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.3,
    wireframe: true
});
const influenceSphere = new THREE.Mesh(influenceSphereGeometry, influenceSphereMaterial);
// scene.add(influenceSphere);

// Raycaster setup for determining influence sphere position
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-100, -100); // Initialize off-screen

// Configuration for influence effect
const influenceRadius = 1.5; // Radius of influence sphere
const maxExtrusionDistance = 0.5; // How far vertices move along normal
const maxScaleFactor = 0.01; // 50% scaling effect as requested
const animationSpeed = 0.1; // Speed of animation (0-1)

// Handle mouse movement
function onMouseMove(event) {
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// Find intersection point on sphere to position the influence sphere
function updateInfluenceSpherePosition() {
    // Update the ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Get intersection with sphere
    const intersects = raycaster.intersectObject(sphere);
    
    if (intersects.length > 0) {
        // Position influence sphere at intersection point
        influenceSphere.position.copy(intersects[0].point);
        influenceSphere.visible = true;
        
        // Reset all target positions and scales to original
        for (let i = 0; i < vertexCount; i++) {
            targetPositions[i * 3] = originalPositions[i * 3];
            targetPositions[i * 3 + 1] = originalPositions[i * 3 + 1];
            targetPositions[i * 3 + 2] = originalPositions[i * 3 + 2];
            targetScales[i] = 1.0;
        }
        
        // Update vertices within the influence sphere
        updateVerticesInInfluenceSphere();
    } else {
        // Hide influence sphere when not hovering on main sphere
        influenceSphere.visible = false;
        
        // Reset all target positions and scales to original when not hovering
        for (let i = 0; i < vertexCount; i++) {
            targetPositions[i * 3] = originalPositions[i * 3];
            targetPositions[i * 3 + 1] = originalPositions[i * 3 + 1];
            targetPositions[i * 3 + 2] = originalPositions[i * 3 + 2];
            targetScales[i] = 1.0;
        }
    }
}

// Update vertices within the influence sphere
function updateVerticesInInfluenceSphere() {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const influenceCenter = influenceSphere.position;
    
    // Check each vertex
    for (let i = 0; i < vertexCount; i++) {
        // Get vertex position
        const vertexX = originalPositions[i * 3];
        const vertexY = originalPositions[i * 3 + 1];
        const vertexZ = originalPositions[i * 3 + 2];
        
        // Create vertex vector for distance calculation
        const vertex = new THREE.Vector3(vertexX, vertexY, vertexZ);
        
        // Calculate distance from vertex to influence sphere center
        const distance = vertex.distanceTo(influenceCenter);
        
        // If within influence radius, affect the vertex
        if (distance < influenceRadius) {
            // Get vertex normal
            const normalX = normals.getX(i);
            const normalY = normals.getY(i);
            const normalZ = normals.getZ(i);
            
            // Calculate effect strength (more effect for closer vertices)
            const effect = 1 - distance / influenceRadius;
            
            // Calculate extrusion amount
            const extrusionAmount = maxExtrusionDistance * effect;
            
            // Calculate scale factor (50% scaling at maximum effect)
            const scaleFactor = 1.0 + (maxScaleFactor * effect);
            
            // Set target scale
            targetScales[i] = scaleFactor;
            
            // Calculate new target position along normal with scaling effect
            const scaledX = vertexX * scaleFactor;
            const scaledY = vertexY * scaleFactor;
            const scaledZ = vertexZ * scaleFactor;
            
            // Apply extrusion along normal
            targetPositions[i * 3] = scaledX + normalX * extrusionAmount;
            targetPositions[i * 3 + 1] = scaledY + normalY * extrusionAmount;
            targetPositions[i * 3 + 2] = scaledZ + normalZ * extrusionAmount;
        }
    }
}

// Animate current positions and scales towards target values
function animateVertices() {
    let needsUpdate = false;
    
    // Update all vertices
    for (let i = 0; i < vertexCount; i++) {
        // Update position (x, y, z)
        for (let j = 0; j < 3; j++) {
            const index = i * 3 + j;
            const current = currentPositions[index];
            const target = targetPositions[index];
            
            // Only update if there's a significant difference
            if (Math.abs(current - target) > 0.001) {
                // Lerp towards target position
                currentPositions[index] += (target - current) * animationSpeed;
                needsUpdate = true;
            } else {
                currentPositions[index] = target;
            }
            
            // Update actual geometry
            geometry.attributes.position.array[index] = currentPositions[index];
        }
        
        // Update scale
        const currentScale = currentScales[i];
        const targetScale = targetScales[i];
        
        // Only update if there's a significant difference
        if (Math.abs(currentScale - targetScale) > 0.001) {
            // Lerp towards target scale
            currentScales[i] += (targetScale - currentScale) * animationSpeed;
            needsUpdate = true;
        } else {
            currentScales[i] = targetScale;
        }
    }
    
    // Update vertex positions if needed
    if (needsUpdate) {
        geometry.attributes.position.needsUpdate = true;
        
        // When positions change, normals should be recomputed
        geometry.computeVertexNormals();
    }
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update influence sphere position
    updateInfluenceSpherePosition();
    
    // Animate vertices
    animateVertices();
    
    // Update controls
    controls.update();
    
    // Render the scene
    renderer.render(scene, camera);
}

// Event listeners
window.addEventListener('mousemove', onMouseMove, false);
window.addEventListener('resize', onWindowResize, false);

// Start animation
animate();
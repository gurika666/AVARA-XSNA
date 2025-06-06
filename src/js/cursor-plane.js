// cursor-plane.js
import * as THREE from "three";

let cursorPlane, cursorMaterial;
let mousePosition = new THREE.Vector2(0.5, 0.5);
let viewportSize = new THREE.Vector2(1, 1);

// Create a shader that draws colored dots on a circle
const vertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    // Force the plane to render at the near plane (z = 1.0 in clip space)
    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vec4(pos.x, pos.y, pos.w * 0.999999, pos.w);
}
`;

const fragmentShader = `
uniform vec2 uMouse;
uniform vec2 uViewportSize;
uniform float uTime;
uniform float uNumGroups;
uniform float uRgbSpacingMin;
uniform float uRgbSpacingMax;
uniform float uRgbSpacingSpeed;

varying vec2 vUv;

void main() {
    // Shadertoy-style variables
    vec2 fragCoord = vUv * uViewportSize;
    vec2 iResolution = uViewportSize;
    float iTime = uTime;
    
    // Normalize coordinates to [0,1] range
    vec2 uv = fragCoord / iResolution.xy;
    
    // Parameters
    float ellipseRadius = 0.02;
    float blurAmount = 0.08;
    vec2 center = uMouse; // Use mouse position as center
    
    // Animated circle radius
    float minRadius = 0.45;        // Minimum circle radius
    float maxRadius = 0.55;        // Maximum circle radius
    float radiusSpeed = 0.9;       // Speed of radius animation
    float radiusAnimation = (sin(iTime * radiusSpeed) + 1.0) * 0.5; // 0 to 1
    float circleRadius = mix(minRadius, maxRadius, radiusAnimation);
    
    // Movement-based opacity instead of animated opacity
    vec2 mouseFromCenter = uMouse - vec2(0.5, 0.5);
    float mouseDistance = length(mouseFromCenter);
    
    // Map mouse distance to opacity
    float minOpacity = 0.0;        // Minimum opacity when mouse is at center
    float maxOpacity = 0.2;        // Maximum opacity when mouse is at edges
    float opacityRange = 0.8;      // Distance range for full opacity (0.0 to 0.7 from center)
    
    // Calculate opacity based on distance from center
    float globalOpacity = mix(minOpacity, maxOpacity, 
                             smoothstep(0.0, opacityRange, mouseDistance));
    
    int numGroups = 12; // Number of RGB groups around the circle
    
    // Animated RGB spacing
    float spacingAnimation = (sin(iTime * uRgbSpacingSpeed) + 1.0) * 0.5; // 0 to 1
    float rgbSpacing = mix(uRgbSpacingMin, uRgbSpacingMax, spacingAnimation);
   
    // Calculate rotation based on mouse position
    float mouseAngle = atan(mouseFromCenter.y, mouseFromCenter.x);
    
    // Use mouse angle as rotation (you can multiply by a factor to control sensitivity)
    float rotationSensitivity = 2.0; // Adjust this to control how much mouse movement affects rotation
    float globalRotation = mouseAngle * rotationSensitivity;
    
    vec3 finalColor = vec3(0.0);
    float totalAlpha = 0.0;
    
    // Create 12 RGB groups around a circle
    for(int group = 0; group < 8; group++)
    {
        // Position each group around the circle with mouse-based rotation
        float groupAngle = float(group) * 3.14159 * 2.0 / 8. + globalRotation/2.;
        vec2 groupCenter = center + circleRadius * vec2(cos(groupAngle), sin(groupAngle));
        
        // Create RGB triplet at this group position
        for(int colorIndex = 0; colorIndex < 3; colorIndex++)
        {
            // Arrange RGB colors in a line radiating from center
            float offset = (float(colorIndex) - 1.0) * rgbSpacing; // Use animated spacing
            vec2 ellipsePos = groupCenter + offset * vec2(cos(groupAngle), sin(groupAngle));
            
            // Define ellipse dimensions (width, height scaling)
            vec2 ellipseScale = vec2(2.5, 0.5); // Make them tall and narrow
            
            // Rotate ellipse to align with radial direction
            vec2 directionFromCenter = ellipsePos - center;
            float rotAngle = atan(directionFromCenter.y, directionFromCenter.x);
            
            // Apply rotation to the coordinate difference
            vec2 diff = uv - ellipsePos;
            float cosR = cos(-rotAngle);
            float sinR = sin(-rotAngle);
            vec2 rotatedDiff = vec2(
                diff.x * cosR - diff.y * sinR,
                diff.x * sinR + diff.y * cosR
            );
            
            // Calculate elliptical distance in rotated space
            vec2 scaledDiff = rotatedDiff / ellipseScale;
            float dist = length(scaledDiff);
            
            // Create intensity with blur
            float intensity = 1.0 - smoothstep(ellipseRadius - blurAmount, ellipseRadius + blurAmount, dist);
            
            // Define colors: Red, Green, Blue
            vec3 color;
            if(colorIndex == 0) color = vec3(1.0, 0.2, 0.2);      // Red
            else if(colorIndex == 1) color = vec3(0.2, 1.0, 0.2); // Green
            else color = vec3(0.2, 0.2, 1.0);                     // Blue
            
            // Add to final color
            finalColor += color * intensity;
            totalAlpha = max(totalAlpha, intensity);
        }
    }
    
    // Set final color with movement-based opacity
    gl_FragColor = vec4(finalColor * globalOpacity, totalAlpha * globalOpacity);
}
`;

// Initialize cursor plane
function init(scene, camera) {
    // Create material with custom shader
    cursorMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: {
            uMouse: { value: mousePosition },
            uViewportSize: { value: viewportSize },
            uTime: { value: 0.0 },          // Time uniform for animation
            uNumGroups: { value: 6.0 },     // Number of groups uniform
            uRgbSpacingMin: { value: 0.10 }, // Minimum RGB spacing
            uRgbSpacingMax: { value: 0.25 }, // Maximum RGB spacing
            uRgbSpacingSpeed: { value: 0.5 } // Speed of RGB spacing animation
        },
        transparent: true,
        depthTest: false,     // Don't test depth
        depthWrite: false,    // Don't write to depth buffer
        side: THREE.DoubleSide // Render both sides
    });

    // Create a plane that covers the entire view
    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    cursorPlane = new THREE.Mesh(planeGeometry, cursorMaterial);
    
    // Set render order to maximum value to ensure it renders last
    cursorPlane.renderOrder = Number.MAX_SAFE_INTEGER;
    
    // Make sure it's always on top by setting material properties
    cursorPlane.material.needsUpdate = true;
    
    // Add to scene
    scene.add(cursorPlane);
    
    // Position directly in camera space (will be updated each frame)
    updatePlanePosition(camera);
    
    // Add event listeners for mouse movement
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('resize', onWindowResize);
    
    // Initial viewport size
    onWindowResize();
}

// Handle mouse movement
function onMouseMove(event) {
    updateMousePosition(event.clientX, event.clientY);
}

// Handle touch movement for mobile
function onTouchMove(event) {
    if (event.touches.length > 0) {
        event.preventDefault();
        updateMousePosition(event.touches[0].clientX, event.touches[0].clientY);
    }
}

// Update mouse position helper
function updateMousePosition(clientX, clientY) {
    // Normalize mouse coordinates (0 to 1)
    mousePosition.x = clientX / window.innerWidth;
    mousePosition.y = 1.0 - (clientY / window.innerHeight); // Invert Y for shader space
    
    // Update uniform
    if (cursorMaterial) {
        cursorMaterial.uniforms.uMouse.value = mousePosition;
    }
}

// Handle window resize
function onWindowResize() {
    viewportSize.x = window.innerWidth;
    viewportSize.y = window.innerHeight;
    
    if (cursorMaterial) {
        cursorMaterial.uniforms.uViewportSize.value = viewportSize;
    }
}

// Update the plane's position to stay in front of camera
function updatePlanePosition(camera) {
    if (!cursorPlane) return;
    
    // Position the plane at a safe distance from the camera (not too close to avoid clipping)
    const distance = 0.5; // Increased distance to avoid near clipping
    
    // Create a vector pointing forward from the camera
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(camera.quaternion);
    forward.multiplyScalar(distance);
    
    // Position plane at this point
    cursorPlane.position.copy(camera.position).add(forward);
    
    // Make plane face the camera
    cursorPlane.quaternion.copy(camera.quaternion);
    
    // Scale the plane to cover the view at this distance
    const scale = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
    const aspectRatio = camera.aspect;
    
    cursorPlane.scale.set(scale * aspectRatio, scale, 1);
}

// Config options for the cursor
function setOptions(options) {
    if (!cursorMaterial) return;
    
    // Handle numGroups option
    if (options.numGroups !== undefined) {
        cursorMaterial.uniforms.uNumGroups.value = options.numGroups;
        console.log('Number of groups set to:', options.numGroups);
    }
    
    // Handle RGB spacing animation options
    if (options.rgbSpacingMin !== undefined) {
        cursorMaterial.uniforms.uRgbSpacingMin.value = options.rgbSpacingMin;
        console.log('RGB spacing minimum set to:', options.rgbSpacingMin);
    }
    
    if (options.rgbSpacingMax !== undefined) {
        cursorMaterial.uniforms.uRgbSpacingMax.value = options.rgbSpacingMax;
        console.log('RGB spacing maximum set to:', options.rgbSpacingMax);
    }
    
    if (options.rgbSpacingSpeed !== undefined) {
        cursorMaterial.uniforms.uRgbSpacingSpeed.value = options.rgbSpacingSpeed;
        console.log('RGB spacing animation speed set to:', options.rgbSpacingSpeed);
    }
    
    console.log('Cursor options updated:', options);
}

// Update function to be called from animation loop
function update(camera, deltaTime) {
    if (!cursorPlane || !cursorMaterial) return;
    
    // Update time uniform for shader animation
    const dt = deltaTime || (1/60);
    cursorMaterial.uniforms.uTime.value += dt;
    
    // Update plane position relative to camera
    updatePlanePosition(camera);
}

// Clean up function
function dispose() {
    if (cursorMaterial) {
        cursorMaterial.dispose();
    }
    if (cursorPlane && cursorPlane.geometry) {
        cursorPlane.geometry.dispose();
    }
    
    // Remove event listeners
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('resize', onWindowResize);
}

export {
    init,
    update,
    setOptions,
    dispose
};
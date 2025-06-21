// audio-controller.js - Using Web Audio API directly for reliability

import * as THREE from "three";

// Audio variables
let audioContext;
let audioBuffer;
let sourceNode;
let startTime = 0;
let pauseTime = 0;
let isPlaying = false;
let isAudioLoaded = false;

// Three.js audio listener for 3D audio (if needed)
let audioListener;

// Callbacks from main app
let callbacks = {
  onTimeUpdate: null
};

// Initialize the audio controller
export function init(options = {}) {
  // Setup callbacks
  callbacks = {
    onTimeUpdate: options.onTimeUpdate || function() {}
  };
  
  // Create audio context
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // Create Three.js audio listener (for compatibility)
  audioListener = new THREE.AudioListener();
}

// Load the audio file
export function loadAudio(audioPath) {
  return new Promise((resolve, reject) => {
    fetch(audioPath)
      .then(response => response.arrayBuffer())
      .then(data => audioContext.decodeAudioData(data))
      .then(buffer => {
        audioBuffer = buffer;
        isAudioLoaded = true;
        console.log('Audio loaded, duration:', buffer.duration);
        resolve();
      })
      .catch(error => {
        console.error('Audio loading error:', error);
        reject(error);
      });
  });
}

// Get the audio listener (for compatibility)
export function getAudioListener() {
  return audioListener;
}

// Get current audio time
export function getCurrentTime() {
  if (!isPlaying) {
    return pauseTime;
  }
  return audioContext.currentTime - startTime;
}

// Get audio duration
export function getAudioDuration() {
  return audioBuffer?.duration || 0;
}

// Start audio playback
export function startAudio() {
  if (!audioBuffer || !isAudioLoaded) {
    console.warn("Audio not loaded yet");
    return;
  }
  
  // Resume audio context if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  // Create new source node
  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioContext.destination);
  
  // Handle end of playback
  sourceNode.onended = () => {
    if (isPlaying && getCurrentTime() >= audioBuffer.duration - 0.1) {
      console.log("Audio ended naturally");
      isPlaying = false;
      pauseTime = 0;
      startTime = 0;
    }
  };
  
  // Start playback from pause position
  const offset = pauseTime;
  sourceNode.start(0, offset);
  startTime = audioContext.currentTime - offset;
  isPlaying = true;
  
  console.log("Audio started from:", offset);
}

// Pause audio playback
export function pauseAudio() {
  if (!sourceNode || !isPlaying) return;
  
  // Save current position
  pauseTime = getCurrentTime();
  
  // Stop the source
  sourceNode.stop();
  sourceNode.disconnect();
  sourceNode = null;
  isPlaying = false;
  
  console.log("Audio paused at:", pauseTime);
}

// Toggle play/pause
export function togglePlayPause() {
  if (!audioBuffer || !isAudioLoaded) {
    console.warn("Audio not loaded yet");
    return false;
  }
  
  if (isPlaying) {
    pauseAudio();
  } else {
    startAudio();
  }
  
  return isPlaying;
}

// Update function called from main animation loop
export function update(deltaTime) {
  if (!audioBuffer || !isAudioLoaded) return;
  
  const currentTime = getCurrentTime();
  
  // Call the time update callback
  if (callbacks.onTimeUpdate) {
    callbacks.onTimeUpdate(currentTime, deltaTime);
  }
  
  // Check if we've reached the end
  if (isPlaying && currentTime >= audioBuffer.duration) {
    isPlaying = false;
    pauseTime = 0;
    startTime = 0;
  }
}

// Check if currently playing
export function isCurrentlyPlaying() {
  return isPlaying;
}

// Set volume (0-1)
export function setVolume(value) {
  // You can implement a GainNode if volume control is needed
  console.log("Volume control not implemented in this version");
}

// Reset audio to beginning
export function reset() {
  if (sourceNode && isPlaying) {
    sourceNode.stop();
    sourceNode.disconnect();
  }
  pauseTime = 0;
  startTime = 0;
  isPlaying = false;
}
// audio-controller.js - Handles all audio and scrubbing functionality

import * as THREE from "three";
import * as GUI from './gui.js';

// Audio variables
let audio, audioListener, audioLoader;
let isPlaying = false;

// let isAudioLoaded = false;
let currentAudioTime = 0;
let audioStartTime = 0;
let isScrubbing = false;
let audioDuration = 0;


// Callbacks from main app
let callbacks = {
  onTimeUpdate: null,
  onScrubComplete: null
};

// Initialize the audio controller
export function init(options = {}) {
  // Setup callbacks
  callbacks = {
    onTimeUpdate: options.onTimeUpdate || function() {},
    onScrubComplete: options.onScrubComplete || function() {}
  };
  
  // Create audio listener
  audioListener = new THREE.AudioListener();
  
  // Set up audio loader
  audioLoader = new THREE.AudioLoader();
}

// Load the audio file
export function loadAudio(audioPath) {
  // Load audio
  audioLoader.load(
    audioPath,
    (audioBuffer) => {
      // Create audio object now that we have the buffer
      audio = new THREE.Audio(audioListener);
      audio.setBuffer(audioBuffer);
      audio.setLoop(false);
      audio.setVolume(0.5);
      
      // Set duration for GUI
      audioDuration = audioBuffer.duration;
      
      // Mark as loaded
      isAudioLoaded = true;
      GUI.updateLoadingProgress('audio', 100);
    },
    (xhr) => {
      GUI.updateLoadingProgress('audio', xhr.loaded / xhr.total * 100);
    },
    (error) => {
      console.error('Audio loading error:', error);
      isAudioLoaded = true; // Mark as loaded even if it failed
    }
  );
}

// Check if audio is loaded
export function isAudioLoaded() {
  return isAudioLoaded;
}

// Get the audio listener (to be added to camera)
export function getAudioListener() {
  return audioListener;
}

// Get current audio time
export function getCurrentTime() {
  return currentAudioTime;
}

// Get audio duration
export function getAudioDuration() {
  return audioDuration;
}

// Start audio playback
export function startAudio() {
  // Make sure audio is initialized before trying to play
  if (!audio || !audio.context) {
    console.warn("Audio not fully initialized yet");
    return;
  }
  
  // Start audio
  if (currentAudioTime > 0) {
    audio.offset = currentAudioTime;
  }
  
  audio.play();
  audioStartTime = audio.context.currentTime - currentAudioTime;
  isPlaying = true;
  
  // Make sure text positions match current audio time
  if (callbacks.onScrubComplete) {
    callbacks.onScrubComplete(currentAudioTime);
  }
}

// Pause audio playback
export function pauseAudio() {
  if (!audio) return;
  
  audio.pause();
  isPlaying = false;
}

// Update function called from main animation loop
export function update(deltaTime, treeCount) {
  // Update timer - only if audio is properly initialized
  if (audio && audio.buffer) {
    // Only try to use audio.context if audio is playing
    if (isPlaying && audio.context && typeof audio.context.currentTime === 'number') {
      try {
        currentAudioTime = audio.context.currentTime - audioStartTime;
      } catch (error) {
        console.warn("Error accessing audio context time:", error);
        // Fallback to incrementing time based on deltaTime
        currentAudioTime += deltaTime;
      }
    }
    
    if (isNaN(currentAudioTime)) {
      currentAudioTime = 0;
    }
    
    if (currentAudioTime > audio.buffer.duration) {
      currentAudioTime = audio.buffer.duration;
    }
    
    // Update GUI with current time
    try {
      GUI.updateTimeDisplay(currentAudioTime, treeCount, isScrubbing);
    } catch (e) {
      console.warn("Error updating time display:", e);
    }
    
    // Call the time update callback for text and other time-based events
    if (!isScrubbing && callbacks.onTimeUpdate) {
      callbacks.onTimeUpdate(currentAudioTime, deltaTime);
    }
  }
}

// Handle scrubber input - called from GUI
export function handleScrubberInput() {
  // Get the current value of the scrubber
  const scrubTime = parseFloat(GUI.scrubber.value);
  
  // Update the time display
  GUI.scrubberTimeDisplay.textContent = GUI.formatTime(scrubTime);
  
  // Set scrubbing flag
  isScrubbing = true;
  
  // If playing, pause temporarily
  if (isPlaying) {
    audio.pause();
  }
  
  // Update current time
  currentAudioTime = scrubTime;
}

// Handle scrubber change - called from GUI
export function handleScrubberChange() {
  // Get the new time position
  const scrubTime = parseFloat(GUI.scrubber.value);
  
  // Update current time
  currentAudioTime = scrubTime;
  
  // Call the scrub complete callback to reset text display
  if (callbacks.onScrubComplete) {
    callbacks.onScrubComplete(scrubTime);
  }
  
  // Update audio position
  if (audio.buffer) {
    if (isPlaying) {
      // Stop current playback
      audio.stop();
      
      // Set the offset and play from that position
      audio.offset = scrubTime;
      audio.play();
      
      // Update time reference
      audioStartTime = audio.context.currentTime - scrubTime;
    }
  }
  
  // Reset scrubbing flag
  isScrubbing = false;
}

// Create audio analyzer for visualizations (optional)
export function createAnalyzer() {
  if (!audio || !audio.context) {
    return null;
  }
  
  const analyzer = audio.context.createAnalyser();
  analyzer.fftSize = 256;
  audio.setFilter(analyzer);
  
  return analyzer;
}

// Get frequency data for visualizations (optional)
export function getFrequencyData(analyzer) {
  if (!analyzer) return null;
  
  const dataArray = new Uint8Array(analyzer.frequencyBinCount);
  analyzer.getByteFrequencyData(dataArray);
  
  return dataArray;
}

// Set volume
export function setVolume(value) {
  if (audio) {
    audio.setVolume(Math.max(0, Math.min(1, value)));
  }
}

// Mute/unmute audio
export function toggleMute() {
  if (!audio) return;
  
  if (audio.getVolume() > 0) {
    // Store current volume and mute
    audio.userData = audio.userData || {};
    audio.userData.previousVolume = audio.getVolume();
    audio.setVolume(0);
  } else {
    // Restore previous volume
    const prevVol = (audio.userData && audio.userData.previousVolume) || 0.5;
    audio.setVolume(prevVol);
  }
  
  return audio.getVolume() === 0; // Return true if now muted
}

// Check if currently playing
export function isCurrentlyPlaying() {
  return isPlaying;
}

// Add audio effects like reverb, delay, etc.
export function addAudioEffects() {
  if (!audio || !audio.context) return;
  
  // Example: Add reverb effect
  const convolver = audio.context.createConvolver();
  
  // Create impulse response for reverb
  // This would normally load from an impulse response file
  // But for simplicity we'll create a short one
  const impulseLength = audio.context.sampleRate * 2; // 2 seconds
  const impulse = audio.context.createBuffer(2, impulseLength, audio.context.sampleRate);
  
  // Fill the impulse response
  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < impulseLength; i++) {
      // Simple exponential decay
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2);
    }
  }
  
  convolver.buffer = impulse;
  
  // Connect the audio to the convolver
  const gainNode = audio.context.createGain();
  gainNode.gain.value = 0.3; // Adjust the effect intensity
  
  // Connect the nodes
  audio.setFilters([gainNode, convolver]);
  
  return {
    setWetDryMix: (wet) => {
      gainNode.gain.value = wet;
    }
  };
}
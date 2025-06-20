// gui.js - Simplified GUI with only scrubber and loading screen

export let scrubber, scrubberTimeDisplay, durationDisplay, infoDiv;
export let loadingScreen, loadingProgress, loadingText, loadingDetails;

// Setup minimal UI with just scrubber
export function setupUI() {
  // Create loading screen
  createLoadingScreen();
  
  // Create scrubber container (hidden initially)
  const scrubberContainer = document.createElement('div');
  scrubberContainer.style.position = 'fixed';
  scrubberContainer.style.bottom = '40px';
  scrubberContainer.style.left = '20px';
  scrubberContainer.style.right = '20px';
  scrubberContainer.style.display = 'none'; // Hidden initially
  scrubberContainer.style.flexDirection = 'row';
  scrubberContainer.style.alignItems = 'center';
  scrubberContainer.style.gap = '10px';
  scrubberContainer.style.zIndex = '10';
  scrubberContainer.style.opacity = '0';
  scrubberContainer.style.transition = 'opacity 0.5s ease-in-out';
  scrubberContainer.id = 'scrubber-container';

  // Create time display
  scrubberTimeDisplay = document.createElement('div');
  scrubberTimeDisplay.textContent = '00:00:000';
  scrubberTimeDisplay.style.fontFamily = 'monospace';
  scrubberTimeDisplay.style.fontSize = '14px';
  scrubberTimeDisplay.style.width = '80px';
  scrubberTimeDisplay.style.color = '#fff';
  scrubberContainer.appendChild(scrubberTimeDisplay);

  // Create scrubber
  scrubber = document.createElement('input');
  scrubber.type = 'range';
  scrubber.min = '0';
  scrubber.max = '100';
  scrubber.value = '0';
  scrubber.step = '0.01';
  scrubber.style.flex = '1';
  scrubber.style.height = '20px';
  scrubber.style.cursor = 'pointer';
  scrubber.disabled = true;
  
  // Add scrubber styles
  const scrubberStyle = document.createElement('style');
  scrubberStyle.textContent = `
    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      cursor: pointer;
    }
    
    input[type="range"]::-webkit-slider-track {
      background: #333;
      height: 4px;
      border-radius: 2px;
    }
    
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      background: #fff;
      height: 14px;
      width: 14px;
      border-radius: 50%;
      margin-top: -5px;
      cursor: pointer;
    }
    
    input[type="range"]::-moz-range-track {
      background: #333;
      height: 4px;
      border-radius: 2px;
    }
    
    input[type="range"]::-moz-range-thumb {
      background: #fff;
      height: 14px;
      width: 14px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
    }
  `;
  document.head.appendChild(scrubberStyle);
  
  scrubberContainer.appendChild(scrubber);

  // Create duration display
  durationDisplay = document.createElement('div');
  durationDisplay.textContent = '00:00:000';
  durationDisplay.style.fontFamily = 'monospace';
  durationDisplay.style.fontSize = '14px';
  durationDisplay.style.width = '80px';
  durationDisplay.style.textAlign = 'right';
  durationDisplay.style.color = '#fff';
  scrubberContainer.appendChild(durationDisplay);

  // Add scrubber to body
  scrubberContainer.style.display = 'flex'; // Make it flex but still invisible
  document.body.appendChild(scrubberContainer);

  // Create minimal info overlay
  infoDiv = document.createElement('div');
  infoDiv.style.position = 'fixed';
  infoDiv.style.top = '20px';
  infoDiv.style.left = '20px';
  infoDiv.style.color = '#fff';
  infoDiv.style.fontFamily = 'Arial, sans-serif';
  infoDiv.style.fontSize = '14px';
  infoDiv.style.pointerEvents = 'none';
  infoDiv.style.opacity = '0';
  infoDiv.style.transition = 'opacity 0.5s ease-in-out';
  infoDiv.style.zIndex = '10';
  document.body.appendChild(infoDiv);

  // Set dark background
  document.body.style.backgroundColor = '#000';
  document.body.style.color = '#fff';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
}

// Create loading screen
function createLoadingScreen() {
  loadingScreen = document.createElement('div');
  loadingScreen.style.position = 'fixed';
  loadingScreen.style.top = '0';
  loadingScreen.style.left = '0';
  loadingScreen.style.width = '100%';
  loadingScreen.style.height = '100%';
  loadingScreen.style.backgroundColor = '#000';
  loadingScreen.style.display = 'flex';
  loadingScreen.style.flexDirection = 'column';
  loadingScreen.style.justifyContent = 'center';
  loadingScreen.style.alignItems = 'center';
  loadingScreen.style.zIndex = '1000';
  
  const loadingContainer = document.createElement('div');
  loadingContainer.style.textAlign = 'center';
  
  loadingText = document.createElement('div');
  loadingText.textContent = 'Loading...';
  loadingText.style.color = '#fff';
  loadingText.style.fontSize = '24px';
  loadingText.style.marginBottom = '20px';
  loadingContainer.appendChild(loadingText);
  
  const progressContainer = document.createElement('div');
  progressContainer.style.width = '200px';
  progressContainer.style.height = '4px';
  progressContainer.style.backgroundColor = '#333';
  progressContainer.style.borderRadius = '2px';
  progressContainer.style.overflow = 'hidden';
  
  loadingProgress = document.createElement('div');
  loadingProgress.style.width = '0%';
  loadingProgress.style.height = '100%';
  loadingProgress.style.backgroundColor = '#fff';
  loadingProgress.style.transition = 'width 0.3s ease-out';
  progressContainer.appendChild(loadingProgress);
  loadingContainer.appendChild(progressContainer);
  
  loadingDetails = document.createElement('div');
  loadingDetails.style.color = '#666';
  loadingDetails.style.fontSize = '14px';
  loadingDetails.style.marginTop = '10px';
  loadingContainer.appendChild(loadingDetails);
  
  loadingScreen.appendChild(loadingContainer);
  document.body.appendChild(loadingScreen);
}

// Show/hide functions
export function showLoadingScreen() {
  if (loadingScreen) loadingScreen.style.display = 'flex';
}

export function hideLoadingScreen() {
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
      loadingScreen.style.display = 'none';
      // Fade in info and scrubber
      if (infoDiv) infoDiv.style.opacity = '1';
      const scrubberContainer = document.getElementById('scrubber-container');
      if (scrubberContainer) scrubberContainer.style.opacity = '1';
    }, 500);
  }
}

// Update loading progress
export function updateLoadingProgress(type, progress) {
  if (loadingProgress) {
    loadingProgress.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }
  if (loadingDetails) {
    loadingDetails.textContent = `${Math.floor(progress)}% complete`;
  }
}

// Show loading error
export function showLoadingError(message) {
  if (loadingText) loadingText.textContent = 'Loading failed';
  if (loadingDetails) loadingDetails.textContent = message;
}

// Setup scrubber callbacks
export function setupScrubber(inputCallback, changeCallback) {
  if (scrubber) {
    scrubber.addEventListener('input', inputCallback);
    scrubber.addEventListener('change', changeCallback);
  }
}

// Format time
export function formatTime(timeInSeconds) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const milliseconds = Math.floor((timeInSeconds % 1) * 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
}

// Enable scrubber after loading
export function enableControls(duration, treeCount) {
  if (scrubber) scrubber.disabled = false;
  
  if (duration && durationDisplay) {
    scrubber.max = duration.toString();
    durationDisplay.textContent = formatTime(duration);
  }
  
  if (infoDiv) {
    infoDiv.innerHTML = `Trees: ${treeCount}`;
  }
}

// Update time display
export function updateTimeDisplay(currentTime, treeCount, isScrubbing) {
  if (!isScrubbing && scrubber) {
    scrubber.value = currentTime.toString();
  }
  if (scrubberTimeDisplay) {
    scrubberTimeDisplay.textContent = formatTime(currentTime);
  }
  if (infoDiv) {
    infoDiv.innerHTML = `Trees: ${treeCount}`;
  }
}

// Empty function for compatibility
export function updatePlaybackState(isPlaying) {
  // No longer needed - Rive handles play/pause display
}
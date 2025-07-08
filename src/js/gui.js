// gui.js - Modified to remove HTML loading screen

export let scrubber, scrubberTimeDisplay, durationDisplay, infoDiv;
// Remove loading screen variables

// Setup minimal UI with just scrubber
export function setupUI() {
  // Don't create loading screen anymore
  
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

// Remove or stub out loading functions
export function showLoadingScreen() {
  // No longer needed - Rive handles loading
}

export function hideLoadingScreen() {
  // Just fade in the controls
  if (infoDiv) infoDiv.style.opacity = '1';
  const scrubberContainer = document.getElementById('scrubber-container');
  if (scrubberContainer) {
    setTimeout(() => {
      scrubberContainer.style.opacity = '1';
    }, 100);
  }
}

// Keep for compatibility but it won't show anything
export function updateLoadingProgress(type, progress) {
  // Could log for debugging
  // console.log(`Loading progress: ${type} - ${progress}%`);
}

// Keep for compatibility
export function showLoadingError(message) {
  console.error('Loading error:', message);
  // You might want to trigger an error state in Rive here
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
  
  // Fade in controls
  hideLoadingScreen();
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
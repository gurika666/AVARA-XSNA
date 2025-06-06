// gui.js - Enhanced GUI with loading screen and keyboard controls

// Export references to UI elements
export let playButton, pauseButton, scrubber, scrubberTimeDisplay, durationDisplay, infoDiv;
export let loadingScreen, loadingProgress, loadingText, loadingDetails;

// Setup all UI elements
export function setupUI(startCallback, pauseCallback) {
  // Create loading screen first
  createLoadingScreen();
  
  // Create controls container
  const controlsDiv = document.createElement('div');
  controlsDiv.style.position = 'absolute';
  controlsDiv.style.top = '10px';
  controlsDiv.style.left = '10px';
  controlsDiv.style.right = '10px';
  controlsDiv.style.zIndex = '10';
  controlsDiv.style.display = 'flex';
  controlsDiv.style.flexDirection = 'column';
  controlsDiv.style.gap = '10px';
  controlsDiv.style.opacity = '0';
  controlsDiv.style.transition = 'opacity 0.5s ease-in-out';
  controlsDiv.id = 'controls';

  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '10px';
  buttonContainer.style.alignItems = 'center';
  controlsDiv.appendChild(buttonContainer);

  // Create play button with dark theme
  playButton = document.createElement('button');
  playButton.textContent = 'Start Zoom';
  playButton.style.padding = '10px 20px';
  playButton.style.fontSize = '18px';
  playButton.style.backgroundColor = '#222';
  playButton.style.color = '#fff';
  playButton.style.border = '1px solid #444';
  playButton.style.borderRadius = '4px';
  playButton.style.cursor = 'pointer';
  playButton.disabled = true;
  buttonContainer.appendChild(playButton);

  // Create pause button with dark theme
  pauseButton = document.createElement('button');
  pauseButton.textContent = 'Pause';
  pauseButton.style.padding = '10px 20px';
  pauseButton.style.fontSize = '18px';
  pauseButton.style.backgroundColor = '#222';
  pauseButton.style.color = '#fff';
  pauseButton.style.border = '1px solid #444';
  pauseButton.style.borderRadius = '4px';
  pauseButton.style.cursor = 'pointer';
  pauseButton.style.display = 'none';
  buttonContainer.appendChild(pauseButton);
  
  // Add keyboard hint
  const keyboardHint = document.createElement('div');
  keyboardHint.textContent = '(Press SPACE to play/pause)';
  keyboardHint.style.color = '#666';
  keyboardHint.style.fontSize = '14px';
  keyboardHint.style.marginLeft = '20px';
  buttonContainer.appendChild(keyboardHint);

  // Create scrubber container
  const scrubberContainer = document.createElement('div');
  scrubberContainer.style.display = 'flex';
  scrubberContainer.style.alignItems = 'center';
  scrubberContainer.style.gap = '10px';
  scrubberContainer.style.width = '100%';
  scrubberContainer.style.marginTop = '10px';
  controlsDiv.appendChild(scrubberContainer);

  // Create time display with dark theme
  scrubberTimeDisplay = document.createElement('div');
  scrubberTimeDisplay.textContent = '00:00:000';
  scrubberTimeDisplay.style.fontFamily = 'monospace';
  scrubberTimeDisplay.style.fontSize = '16px';
  scrubberTimeDisplay.style.width = '100px';
  scrubberTimeDisplay.style.color = '#fff';
  scrubberContainer.appendChild(scrubberTimeDisplay);

  // Create scrubber with dark theme
  scrubber = document.createElement('input');
  scrubber.type = 'range';
  scrubber.min = '0';
  scrubber.max = '100';
  scrubber.value = '0';
  scrubber.step = '0.01';
  scrubber.style.flex = '1';
  scrubber.style.height = '20px';
  scrubber.style.accentColor = '#3a3';
  scrubber.style.cursor = 'pointer';
  scrubber.disabled = true;
  
  // Style the scrubber track and thumb
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
      height: 6px;
      border-radius: 3px;
    }
    
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      background: #3a3;
      height: 18px;
      width: 18px;
      border-radius: 50%;
      margin-top: -6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.2);
      background: #4b4;
    }
    
    input[type="range"]::-moz-range-track {
      background: #333;
      height: 6px;
      border-radius: 3px;
    }
    
    input[type="range"]::-moz-range-thumb {
      background: #3a3;
      height: 18px;
      width: 18px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    input[type="range"]::-moz-range-thumb:hover {
      transform: scale(1.2);
      background: #4b4;
    }
  `;
  document.head.appendChild(scrubberStyle);
  
  scrubberContainer.appendChild(scrubber);

  // Create duration display with dark theme
  durationDisplay = document.createElement('div');
  durationDisplay.textContent = '00:00:000';
  durationDisplay.style.fontFamily = 'monospace';
  durationDisplay.style.fontSize = '16px';
  durationDisplay.style.width = '100px';
  durationDisplay.style.textAlign = 'right';
  durationDisplay.style.color = '#fff';
  scrubberContainer.appendChild(durationDisplay);

  // Add controls to body
  document.body.appendChild(controlsDiv);

  // Create info overlay with dark theme
  infoDiv = document.createElement('div');
  infoDiv.style.position = 'absolute';
  infoDiv.style.bottom = '20px';
  infoDiv.style.width = '100%';
  infoDiv.style.textAlign = 'center';
  infoDiv.style.color = '#fff';
  infoDiv.style.fontFamily = 'Arial, sans-serif';
  infoDiv.style.fontSize = '14px';
  infoDiv.style.pointerEvents = 'none';
  infoDiv.style.opacity = '0';
  infoDiv.style.transition = 'opacity 0.5s ease-in-out';
  infoDiv.innerHTML = 'Linear Infinite Zoom';
  document.body.appendChild(infoDiv);

  // Add dark background to the whole page
  document.body.style.backgroundColor = '#000';
  document.body.style.color = '#fff';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.fontFamily = 'Arial, sans-serif';

  // Add event listeners
  playButton.addEventListener('click', startCallback);
  pauseButton.addEventListener('click', pauseCallback);
  
  // Hover effects for buttons
  const buttonHoverStyle = { over: '#333', out: '#222' };
  [playButton, pauseButton].forEach(btn => {
    btn.addEventListener('mouseover', () => btn.style.backgroundColor = buttonHoverStyle.over);
    btn.addEventListener('mouseout', () => btn.style.backgroundColor = buttonHoverStyle.out);
  });
}

// Create loading screen
function createLoadingScreen() {
  // Loading screen container
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
  
  // Loading container
  const loadingContainer = document.createElement('div');
  loadingContainer.style.textAlign = 'center';
  loadingContainer.style.maxWidth = '600px';
  loadingContainer.style.padding = '40px';
  
  // Title
  const title = document.createElement('h1');
  title.textContent = 'Linear Infinite Zoom';
  title.style.color = '#fff';
  title.style.fontSize = '36px';
  title.style.marginBottom = '40px';
  title.style.fontWeight = '300';
  title.style.letterSpacing = '2px';
  loadingContainer.appendChild(title);
  
  // Loading text
  loadingText = document.createElement('div');
  loadingText.textContent = 'Initializing...';
  loadingText.style.color = '#aaa';
  loadingText.style.fontSize = '18px';
  loadingText.style.marginBottom = '20px';
  loadingContainer.appendChild(loadingText);
  
  // Progress bar container
  const progressContainer = document.createElement('div');
  progressContainer.style.width = '100%';
  progressContainer.style.height = '6px';
  progressContainer.style.backgroundColor = '#222';
  progressContainer.style.borderRadius = '3px';
  progressContainer.style.overflow = 'hidden';
  progressContainer.style.marginBottom = '20px';
  
  // Progress bar
  loadingProgress = document.createElement('div');
  loadingProgress.style.width = '0%';
  loadingProgress.style.height = '100%';
  loadingProgress.style.backgroundColor = '#3a3';
  loadingProgress.style.transition = 'width 0.3s ease-out';
  loadingProgress.style.borderRadius = '3px';
  progressContainer.appendChild(loadingProgress);
  loadingContainer.appendChild(progressContainer);
  
  // Loading details
  loadingDetails = document.createElement('div');
  loadingDetails.style.color = '#666';
  loadingDetails.style.fontSize = '14px';
  loadingDetails.style.marginTop = '10px';
  loadingContainer.appendChild(loadingDetails);
  
  // Add spinner
  const spinner = document.createElement('div');
  spinner.style.width = '40px';
  spinner.style.height = '40px';
  spinner.style.border = '3px solid #222';
  spinner.style.borderTopColor = '#3a3';
  spinner.style.borderRadius = '50%';
  spinner.style.animation = 'spin 1s linear infinite';
  spinner.style.margin = '30px auto 0';
  loadingContainer.appendChild(spinner);
  
  // Add spinner animation
  const spinnerStyle = document.createElement('style');
  spinnerStyle.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(spinnerStyle);
  
  loadingScreen.appendChild(loadingContainer);
  document.body.appendChild(loadingScreen);
}

// Show loading screen
export function showLoadingScreen() {
  if (loadingScreen) {
    loadingScreen.style.display = 'flex';
  }
}

// Hide loading screen
export function hideLoadingScreen() {
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
      loadingScreen.style.display = 'none';
      // Fade in controls and info
      document.getElementById('controls').style.opacity = '1';
      infoDiv.style.opacity = '1';
    }, 500);
  }
}

// Update loading progress
export function updateLoadingProgress(type, progress) {
  if (loadingProgress) {
    loadingProgress.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }
  
  if (loadingText) {
    const messages = {
      'environment': 'Loading environment...',
      'texture': 'Loading textures...',
      'font': 'Loading fonts...',
      'model': 'Loading 3D models...',
      'audio': 'Loading audio...',
      'vegetation': 'Creating vegetation...',
      'overall': 'Loading resources...'
    };
    
    loadingText.textContent = messages[type] || 'Loading...';
  }
  
  if (loadingDetails) {
    loadingDetails.textContent = `${Math.floor(progress)}% complete`;
  }
}

// Show loading error
export function showLoadingError(message) {
  if (loadingText) {
    loadingText.textContent = 'Loading failed';
    loadingText.style.color = '#f44';
  }
  
  if (loadingDetails) {
    loadingDetails.textContent = message;
    loadingDetails.style.color = '#f44';
  }
  
  if (loadingProgress) {
    loadingProgress.style.backgroundColor = '#f44';
  }
}

// Set up scrubber functions
export function setupScrubber(inputCallback, changeCallback) {
  if (scrubber) {
    scrubber.addEventListener('input', inputCallback);
    scrubber.addEventListener('change', changeCallback);
  }
}

// Format time with milliseconds
export function formatTime(timeInSeconds) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const milliseconds = Math.floor((timeInSeconds % 1) * 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
}

// Update playback UI state
export function updatePlaybackState(isPlaying) {
  playButton.style.display = isPlaying ? 'none' : 'block';
  pauseButton.style.display = isPlaying ? 'block' : 'none';
}

// Enable controls after loading
export function enableControls(duration, treeCount) {
  playButton.disabled = false;
  playButton.textContent = 'Start Zoom';
  scrubber.disabled = false;
  
  if (duration) {
    scrubber.max = duration.toString();
    durationDisplay.textContent = formatTime(duration);
  }
  
  infoDiv.innerHTML = `Linear Infinite Zoom | Ready | ${treeCount} trees loaded`;
}

// Update time display
export function updateTimeDisplay(currentTime, treeCount, isScrubbing) {
  if (!isScrubbing) {
    scrubber.value = currentTime.toString();
    scrubberTimeDisplay.textContent = formatTime(currentTime);
  }
  
  infoDiv.innerHTML = `Linear Infinite Zoom | ${formatTime(currentTime)} | Trees: ${treeCount}`;
}

// Add visual feedback for keyboard controls
export function showKeyboardFeedback() {
  const feedback = document.createElement('div');
  feedback.textContent = 'SPACE';
  feedback.style.position = 'fixed';
  feedback.style.top = '50%';
  feedback.style.left = '50%';
  feedback.style.transform = 'translate(-50%, -50%)';
  feedback.style.fontSize = '48px';
  feedback.style.color = '#3a3';
  feedback.style.fontWeight = 'bold';
  feedback.style.pointerEvents = 'none';
  feedback.style.opacity = '0';
  feedback.style.transition = 'opacity 0.2s ease-out';
  
  document.body.appendChild(feedback);
  
  // Animate in and out
  requestAnimationFrame(() => {
    feedback.style.opacity = '0.8';
    setTimeout(() => {
      feedback.style.opacity = '0';
      setTimeout(() => feedback.remove(), 200);
    }, 300);
  });
}
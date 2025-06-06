// Modified version of gui.js to work with the split architecture

// Export references to UI elements for main script to access
export let playButton, pauseButton, scrubber, scrubberTimeDisplay, durationDisplay, infoDiv;

// Setup all UI elements
export function setupUI(startCallback, pauseCallback) {
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

  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '10px';
  controlsDiv.appendChild(buttonContainer);

  // Create play button with dark theme
  playButton = document.createElement('button');
  playButton.textContent = 'Loading...';
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
  scrubber.style.accentColor = '#3a3'; // Green accent color
  scrubber.disabled = true;
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
  infoDiv.style.top = '50px';
  infoDiv.style.width = '100%';
  infoDiv.style.textAlign = 'center';
  infoDiv.style.color = '#fff';
  infoDiv.style.fontFamily = 'Arial, sans-serif';
  infoDiv.style.pointerEvents = 'none';
  infoDiv.innerHTML = 'Linear Infinite Zoom | Loading...';
  document.body.appendChild(infoDiv);

  // Add dark background to the whole page
  document.body.style.backgroundColor = '#000';
  document.body.style.color = '#fff';
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';

  // Add event listeners
  playButton.addEventListener('click', startCallback);
  pauseButton.addEventListener('click', pauseCallback);
  
  // Hover effects for buttons
  playButton.addEventListener('mouseover', () => {
    playButton.style.backgroundColor = '#333';
  });
  playButton.addEventListener('mouseout', () => {
    playButton.style.backgroundColor = '#222';
  });
  pauseButton.addEventListener('mouseover', () => {
    pauseButton.style.backgroundColor = '#333';
  });
  pauseButton.addEventListener('mouseout', () => {
    pauseButton.style.backgroundColor = '#222';
  });
  
  return {
    playButton,
    pauseButton,
    scrubber,
    scrubberTimeDisplay,
    durationDisplay,
    infoDiv
  };
}

// Set up scrubber functions separately (added for the modular approach)
export function setupScrubber(inputCallback, changeCallback) {
  if (scrubber) {
    scrubber.addEventListener('input', inputCallback);
    scrubber.addEventListener('change', changeCallback);
  }
}

// Update UI based on loading progress
export function updateLoadingProgress(type, progress) {
  if (type === 'audio') {
    playButton.textContent = `Loading audio... ${Math.floor(progress)}%`;
  } else if (type === 'mesh') {
    infoDiv.innerHTML = `Linear Infinite Zoom | Loading trees: ${Math.floor(progress)}%`;
  } else if (type === 'hdri') {
    infoDiv.innerHTML = `Linear Infinite Zoom | Loading environment: ${Math.floor(progress)}%`;
  } else if (type === 'font') {
    infoDiv.innerHTML = `Linear Infinite Zoom | Loading fonts: ${Math.floor(progress)}%`;
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
  
  infoDiv.innerHTML = `Linear Infinite Zoom | Ready to start | ${treeCount} trees`;
}

// Update time display
export function updateTimeDisplay(currentTime, treeCount, isScrubbing) {
  if (!isScrubbing) {
    scrubber.value = currentTime.toString();
    scrubberTimeDisplay.textContent = formatTime(currentTime);
  }
  
  infoDiv.innerHTML = `Linear Infinite Zoom | Time: ${formatTime(currentTime)} | Trees: ${treeCount}`;
}
// simple-controls.js - Simple HTML controls to work alongside Rive
import * as AudioController from './audioController.js';

class SimpleControls {
  constructor() {
    this.container = null;
    this.playButton = null;
    this.scrubber = null;
    this.scrubberFill = null;
    this.isDragging = false;
    this.onPlayPauseCallback = null;
    this.onSeekCallback = null;
  }
  
  init(onPlayPause, onSeek) {
    this.onPlayPauseCallback = onPlayPause;
    this.onSeekCallback = onSeek;
    this.createControls();
    this.setupEventListeners();
    this.updateLoop();
  }
  
  createControls() {
    // Create container
    this.container = document.createElement('div');
    this.container.className = 'simple-controls';
    this.container.innerHTML = `
      <!-- Play/Pause Button with Image -->
      <button class="simple-play-btn" id="simplePlayBtn" aria-label="Play">
        <img src="images/playbutton.png" alt="Play/Pause" class="play-btn-image" />
      </button>
      
      <!-- Scrubber -->
      <div class="simple-scrubber" id="simpleScrubber">
        <div class="scrubber-track"></div>
        <div class="scrubber-fill" id="scrubberFill"></div>
        <img src="images/circle.png" alt="Scrubber handle" class="scrubber-handle" id="scrubberHandle" />
      </div>
    `;
    
    // Add styles
    this.addStyles();
    
    // Append to body
    document.body.appendChild(this.container);
    
    // Get references
    this.playButton = document.getElementById('simplePlayBtn');
    this.scrubber = document.getElementById('simpleScrubber');
    this.scrubberFill = document.getElementById('scrubberFill');
    this.scrubberHandle = document.getElementById('scrubberHandle');
  }
  
  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .simple-controls {
        position: fixed;
        bottom: 90px;
        left: 50%;
        transform: translateX(-50%);
        width: 80%;
        max-width: 1800px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 25px;
        z-index: 2;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
        filter: 
            drop-shadow(2px 0 0 rgba(255, 0, 0, 0.5))
            drop-shadow(-2px 0 0 rgba(0, 255, 255, 0.5));
      }
      
      /* Play Button with Image */
      .simple-play-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.1s ease;
        padding: 0;
        position: relative;
      }
      
      .simple-play-btn:hover {
        transform: scale(1.1);
      }
      
      .simple-play-btn:active {
        transform: scale(0.95);
      }
      
      /* Play button image */
      .play-btn-image {
        width: 100px;
        height: 100px;
        object-fit: contain;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
        transition: transform 0.1s ease;
      }
      
      /* Optional: Add animation when playing */
      .simple-play-btn.playing .play-btn-image {
        animation: pulse 2s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      /* 8-bit Scrubber */
      .simple-scrubber {
        width: 100%;
        height: 30px;
        position: relative;
        cursor: pointer;
        display: flex;
        align-items: center;
        order: -1; /* Put scrubber above button */
      }
      
      .scrubber-track {
        position: absolute;
        width: 100%;
        height: 10px;
        border-radius: 0;
        border: 1px solid rgba(255, 255, 255, 1);
      }
      
      .scrubber-fill {
        position: absolute;
        height: 10px;
        background: #ffffff;
        border-radius: 0;
        width: 0%;
        transition: width 0.05s ease;
       
      }
      
      .scrubber-handle {
        position: absolute;
        width: 20px;
        height: 20px;
        transform: translateX(-50%);
        left: 0%;
        transition: transform 0.05s ease;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
      }
      
      .simple-scrubber:hover .scrubber-track {
        height: 6px;
        border-width: 2px;
      }
      
      .simple-scrubber:hover .scrubber-fill {
        height: 6px;
      }
      
      .simple-scrubber:hover .scrubber-handle {
        transform: translateX(-50%) scale(1.3);
      }
      
      /* Mobile responsive */
      @media (max-width: 768px) {
        .simple-controls {
          bottom: 10px;
          width: 80%;
          gap: 20px;
        }
        
        .play-btn-image {
          width: 80px;
          height: 80px;
        }
        
        .scrubber-handle {
          width: 16px;
          height: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  setupEventListeners() {
    // Play/Pause button
    this.playButton.addEventListener('click', () => {
      if (this.onPlayPauseCallback) {
        this.onPlayPauseCallback();
      }
    });
    
    // Scrubber events
    this.scrubber.addEventListener('mousedown', (e) => this.startScrub(e));
    this.scrubber.addEventListener('touchstart', (e) => this.startScrub(e), { passive: false });
    
    document.addEventListener('mousemove', (e) => this.updateScrub(e));
    document.addEventListener('touchmove', (e) => this.updateScrub(e), { passive: false });
    
    document.addEventListener('mouseup', () => this.endScrub());
    document.addEventListener('touchend', () => this.endScrub());
    
    // Click to seek
    this.scrubber.addEventListener('click', (e) => {
      if (!this.isDragging) {
        const rect = this.scrubber.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        this.seek(percentage);
      }
    });
  }
  
  startScrub(e) {
    e.preventDefault();
    this.isDragging = true;
    this.updateScrub(e);
  }
  
  updateScrub(e) {
    if (!this.isDragging) return;
    
    const rect = this.scrubber.getBoundingClientRect();
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    
    this.updateScrubberPosition(percentage);
  }
  
  endScrub() {
    if (this.isDragging) {
      this.isDragging = false;
      
      const fillWidth = parseFloat(this.scrubberFill.style.width) / 100;
      this.seek(fillWidth);
    }
  }
  
  seek(percentage) {
    if (this.onSeekCallback) {
      const duration = AudioController.getAudioDuration();
      const seekTime = duration * percentage;
      this.onSeekCallback(seekTime);
    }
  }
  
  updateScrubberPosition(percentage) {
    const percentStr = (percentage * 100) + '%';
    this.scrubberFill.style.width = percentStr;
    this.scrubberHandle.style.left = percentStr;
  }
  
  updatePlayButton(isPlaying) {
    // Add or remove 'playing' class for visual feedback
    if (isPlaying) {
      this.playButton.classList.add('playing');
      this.playButton.setAttribute('aria-label', 'Pause');
    } else {
      this.playButton.classList.remove('playing');
      this.playButton.setAttribute('aria-label', 'Play');
    }
    
    // Optionally, you can swap images if you have separate play/pause images
    // const img = this.playButton.querySelector('.play-btn-image');
    // img.src = isPlaying ? 'pausebutton.png' : 'playbutton.png';
  }
  
  updateLoop() {
    const update = () => {
      if (!this.isDragging) {
        const currentTime = AudioController.getCurrentTime();
        const duration = AudioController.getAudioDuration();
        
        if (duration > 0) {
          const percentage = currentTime / duration;
          this.updateScrubberPosition(percentage);
        }
      }
      
      requestAnimationFrame(update);
    };
    
    update();
  }
  
  show() {
    if (this.container) {
      this.container.style.display = 'flex';
    }
  }
  
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }
}

export default SimpleControls;
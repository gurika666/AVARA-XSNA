// rive-overlay.js - Enhanced with audio scrubber control
import { Rive, EventType, RiveEventType, StateMachineInput } from '@rive-app/canvas'

export class SimpleRiveOverlay {
  constructor() {
    this.rive = null;
    this.canvas = null;
    this.playPauseCallback = null;
    this.onScrubCallback = null;
    this.scrubberInput = null;
    this.progressInput = null;
    this.stateMachine = null;
    this.isScrubbing = false;
    this.lastScrubValue = 0;
  }

  async load(config = {}) {
    const {
      src = 'animations/test.riv',
      width = 400,
      height = 400,
      position = { x: 50, y: 50 },
      autoplay = true,
      onPlayPause = null,
      onScrub = null
    } = config;

    this.playPauseCallback = onPlayPause;
    this.onScrubCallback = onScrub;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.cssText = `
      position: fixed;
      left: ${position.x}%;
      top: ${position.y}%;
      transform: translate(-50%, -50%);
      pointer-events: auto;
      z-index: 100;
      cursor: pointer;
    `;
    
    document.body.appendChild(this.canvas);

    // Create Rive instance
    this.rive = new Rive({
      src: src,
      canvas: this.canvas,
      autoplay: autoplay,
      stateMachines: 'State Machine 1',
      onLoad: () => {
        this.rive.resizeDrawingSurfaceToCanvas();
        
        // Get the state machine
        const stateMachineInstances = this.rive.stateMachineInstances;
        if (stateMachineInstances && stateMachineInstances.length > 0) {
          this.stateMachine = stateMachineInstances[0];
          
          // Find and store references to inputs
          const inputs = this.stateMachine.inputs;
          inputs.forEach(input => {
            console.log('Found input:', input.name, 'type:', input.type);
            
            if (input.name === 'control_scrubber') {
              this.scrubberInput = input;
              console.log('Connected to control_scrubber');
              
              // Set initial value
              if (this.scrubberInput) {
                this.scrubberInput.value = 0;
              }
            }
            
            // Also look for progress input if it exists
            if (input.name === 'progress' || input.name === 'Progress') {
              this.progressInput = input;
              console.log('Connected to progress input');
            }
          });
        }
        
        // Set up mouse/touch listeners for scrubbing
        this.setupScrubberInteraction();
      },
      onStateChange: (state) => {
        if (state.data == 'playbutton_click') {
          console.log("Play button clicked");
          if (this.playPauseCallback) {
            this.playPauseCallback();
          }
        }
      },
      onLoadError: (error) => {
        console.error('Failed to load Rive animation:', error);
      }
    });

    this.rive.on(EventType.RiveEvent, this.onRiveEventReceived.bind(this));

    // Set up animation frame update
    this.startUpdateLoop();

    return this.rive;
  }

  setupScrubberInteraction() {
    let isDragging = false;
    let lastX = 0;
    
    const handleStart = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches[0].clientX) - rect.left;
      const y = (e.clientY || e.touches[0].clientY) - rect.top;
      
      // Check if we're clicking on the scrubber area
      // You might need to adjust these bounds based on your Rive design
      if (this.isPointOnScrubber(x, y)) {
        isDragging = true;
        this.isScrubbing = true;
        lastX = x;
        e.preventDefault();
      }
    };
    
    const handleMove = (e) => {
      if (!isDragging || !this.scrubberInput) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches[0].clientX) - rect.left;
      
      // Calculate scrubber value based on x position
      // Adjust these values based on your scrubber's design
      const scrubberLeft = rect.width * 0.1; // 10% from left
      const scrubberRight = rect.width * 0.9; // 90% from left
      const scrubberWidth = scrubberRight - scrubberLeft;
      
      let normalizedX = (x - scrubberLeft) / scrubberWidth;
      normalizedX = Math.max(0, Math.min(1, normalizedX));
      
      // Update the Rive scrubber
      const scrubberValue = normalizedX * 100; // 0-100 range
      this.scrubberInput.value = scrubberValue;
      this.lastScrubValue = scrubberValue;
      
      // Notify the audio controller
      if (this.onScrubCallback) {
        this.onScrubCallback(normalizedX);
      }
      
      e.preventDefault();
    };
    
    const handleEnd = (e) => {
      if (isDragging) {
        isDragging = false;
        this.isScrubbing = false;
        e.preventDefault();
      }
    };
    
    // Mouse events
    this.canvas.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    
    // Touch events
    this.canvas.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd, { passive: false });
  }
  
  isPointOnScrubber(x, y) {
    // This is a simplified check - you might need to adjust based on your Rive design
    // Assuming the scrubber is in the lower portion of the canvas
    const rect = this.canvas.getBoundingClientRect();
    const scrubberTop = rect.height * 0.7;
    const scrubberBottom = rect.height * 0.9;
    
    return y >= scrubberTop && y <= scrubberBottom;
  }

  startUpdateLoop() {
    const update = () => {
      // Check if scrubber value has changed from Rive side
      if (this.scrubberInput && !this.isScrubbing) {
        const currentValue = this.scrubberInput.value;
        if (Math.abs(currentValue - this.lastScrubValue) > 0.1) {
          this.lastScrubValue = currentValue;
          if (this.onScrubCallback) {
            this.onScrubCallback(currentValue / 100); // Normalize to 0-1
          }
        }
      }
      
      requestAnimationFrame(update);
    };
    
    update();
  }

  // Update scrubber position from audio progress
  setProgress(progressPercent) {
    if (this.scrubberInput && !this.isScrubbing) {
      this.scrubberInput.value = progressPercent;
      this.lastScrubValue = progressPercent;
    }
    
    // Also update progress input if it exists
    if (this.progressInput) {
      this.progressInput.value = progressPercent;
    }
  }

  // Get current scrubber value (0-100)
  getScrubberValue() {
    return this.scrubberInput ? this.scrubberInput.value : 0;
  }

  // Set scrubber directly (0-100)
  setScrubberValue(value) {
    if (this.scrubberInput) {
      this.scrubberInput.value = Math.max(0, Math.min(100, value));
      this.lastScrubValue = this.scrubberInput.value;
    }
  }

  onRiveEventReceived(riveEvent) {
    const eventData = riveEvent.data;
    const eventProperties = eventData.properties;
    
    if (eventData.type === RiveEventType.General) {
      console.log("Rive event:", eventData.name);
      
      // Handle scrubber events if they're sent as Rive events
      if (eventData.name === "scrubber_change" && eventProperties) {
        const value = eventProperties.value || 0;
        if (this.onScrubCallback) {
          this.onScrubCallback(value / 100);
        }
      }
    } else if (eventData.type === RiveEventType.OpenUrl) {
      console.log("Event name", eventData.name);
      window.open(eventData.url);
    }
  }

  dispose() {
    if (this.rive) {
      this.rive.cleanup();
    }
    if (this.canvas) {
      this.canvas.remove();
    }
  }
}
// simple-rive-overlay.js
import { Rive, EventType, RiveEventType } from '@rive-app/canvas'

export class SimpleRiveOverlay {
  constructor() {
    this.rive = null;
    this.canvas = null;
    this.playPauseCallback = null;
  }

  async load(config = {}) {
    const {
      src = 'animations/test.riv',
      width = 400,
      height = 400,
      position = { x: 50, y: 50 },
      autoplay = true,
      onPlayPause = null
    } = config;

    this.playPauseCallback = onPlayPause;

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
      stateMachines: 'State Machine 1', // Default state machine
      onLoad: () => {
        


        this.rive.resizeDrawingSurfaceToCanvas();
        
        // Get state machine inputs
        const stateMachine = this.rive.stateMachineInputs('State Machine 1');
        
        // Find the progress input
        this.progressInput = stateMachine.find(input => input.name === 'progress');
        this.isScrubInput = stateMachine.find(input => input.name === 'isScrubbing');
        
        // console.log('Found progress input:', this.progressInput);
        // console.log('Found isScrubbing input:', this.isScrubInput);

      

        
      },
      onStateChange: (state) => {
        if (state.data == 'playbutton_click') {
          console.log("Play button clicked");
          // Trigger play/pause callback
          if (this.playPauseCallback) {
            this.playPauseCallback();
          }
        }
      },
      onLoadError: (error) => {
        console.error('Failed to load Rive animation:', error);
      }
    });

     console.log(this.rive)

    this.rive.on(EventType.RiveEvent, this.onRiveEventReceived.bind(this));

    return this.rive;

    
  }
 

  // Add this method to update progress from audio
  setProgress(progressPercent) {
    if (this.progressInput) {
      this.progressInput.value = progressPercent;
    }
  }

  onRiveEventReceived(riveEvent) {
    const eventData = riveEvent.data;
    const eventProperties = eventData.properties;
    if (eventData.type === RiveEventType.General) {
      if(eventData.name === "play"){
        // console.log("Playing animation");
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
// simple-rive-overlay.js
import { Rive, EventType, RiveEventType, Layout,  Fit, Alignment } from '@rive-app/canvas'

export class SimpleRiveOverlay {
  constructor() {
    this.rive = null;
    this.canvas = null;
    // this.playPauseCallback = null;
  }

  async load(config = {}) {
    const {
      src = 'animations/test.riv',
    //   width = 400,
    //   height = 400,
    //   position = { x: 150, y: 50 },
      autoplay = true,
      onPlayPause = null 
    } = config;

    this.playPauseCallback = onPlayPause;

    // Create canvas
    this.canvas = document.querySelector('.rive');
    // this.canvas.width = width;
    // this.canvas.height = height;
    // this.canvas.style.cssText = `
    //   position: fixed;
    //   left: ${position.x}%;
    //   top: ${position.y}%;
    //   transform: translate(-50%, -50%);
    //   pointer-events: auto;
    //   z-index: 100;
    //   cursor: pointer;
    // `;
    
// document.body.appendChild(this.canvas);

    window.addEventListener('resize', () => {

  this.rive.resizeDrawingSurfaceToCanvas();

    });


    // Create Rive instance
    this.rive = new Rive({
      src: 'animations/test.riv',
      canvas: document.getElementById('riveCanvas'), // Ensure this matches your canvas ID
      autoplay: autoplay,
      stateMachines: 'State Machine 1', // Default state machine
      layout: new Layout({
        // fit: Fit.Contain,      
        // alignment: Alignment.Center,
      }),
     

      onLoad: () => {

        console.log('Rive animation loaded');
        this.rive.resizeDrawingSurfaceToCanvas();
      
      },    
       onStateChange: (state) => {
        
        // console.log("state changed", state);


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

    // this.rive.on(EventType.RiveEvent, this.onRiveEventReceived.bind(this));

    return this.rive;
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
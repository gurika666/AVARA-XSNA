// simple-rive-overlay.js
import { Rive } from '@rive-app/canvas';

export class SimpleRiveOverlay {
  constructor() {
    this.rive = null;
    this.canvas = null;
    this.clickCallback = null;
  }

  async load(config = {}) {
    const {
      src = 'animations/test.riv',
      width = 400,
      height = 400,
      position = { x: 50, y: 50 },
      autoplay = true,
      onClick = null // Simple click callback
    } = config;

    this.clickCallback = onClick;

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
        console.log('Rive animation loaded');
        this.rive.resizeDrawingSurfaceToCanvas();
      },
      onLoadError: (error) => {
        console.error('Failed to load Rive animation:', error);
      }
    });

    // Simple click handler
    this.canvas.addEventListener('click', (event) => {
      if (this.clickCallback) {
        this.clickCallback();
      }
    });

    return this.rive;
  }

  show() {
    if (this.canvas) this.canvas.style.display = 'block';
  }

  hide() {
    if (this.canvas) this.canvas.style.display = 'none';
  }

  setPosition(x, y) {
    if (this.canvas) {
      this.canvas.style.left = `${x}%`;
      this.canvas.style.top = `${y}%`;
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
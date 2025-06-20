// simple-rive-overlay.js
import { Rive } from '@rive-app/canvas';

export class SimpleRiveOverlay {
  constructor() {
    this.rive = null;
    this.canvas = null;
  }

  async load(config = {}) {
    const {
      src = 'animations/test.riv',
      width = 400,
      height = 400,
      position = { x: 50, y: 50 }, // percentage from center
      autoplay = true
    } = config;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.cssText = `
      position: fixed;
      left: ${position.x}%;
      top: ${position.y}%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 100;
    `;
    
    document.body.appendChild(this.canvas);

    // Create Rive instance
    this.rive = new Rive({
      src: src,
      canvas: this.canvas,
      autoplay: autoplay,
      onLoad: () => {
        console.log('Rive animation loaded');
        this.rive.resizeDrawingSurfaceToCanvas();
      },
      onLoadError: (error) => {
        console.error('Failed to load Rive animation:', error);
      }
    });

    return this.rive;
  }

  play() {
    if (this.rive) this.rive.play();
  }

  pause() {
    if (this.rive) this.rive.pause();
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
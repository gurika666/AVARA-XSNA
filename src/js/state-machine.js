// state-machine.js - Simple state machine for animation control

class AnimationStateMachine {
  constructor() {
    // States
    this.STATES = {
      IDLE: 1,        // Everything running except star shader
      STAR_START: 2,  // Star shader starts, first camera animation starts
      MINIMAL: 3,     // Sky shader and vegetation stopped
      FINAL: 4        // Second camera animation starts
    };
    
    // Current state
    this.currentState = this.STATES.IDLE;
    this.previousState = null;
    
    // Timing from existing camera animations
    this.transitions = {
      toStarStart: 60,    // animStartTime - when first camera animation starts
      toMinimal: 80,      // animEndTime - when first camera animation ends
      toFinal: 85         // animStartTime2 - when second camera animation starts
    };
    
    // State flags
    this.stateFlags = {
      starShaderActive: false,
      firstCameraAnimActive: false,
      skyShaderActive: true,
      vegetationActive: true,
      secondCameraAnimActive: false
    };
    
    // Callbacks for state changes
    this.callbacks = {
      onEnterIdle: null,
      onEnterStarStart: null,
      onEnterMinimal: null,
      onEnterFinal: null
    };
  }
  
  // Update state based on audio time
  update(audioTime) {
    let newState = this.currentState;
    
    // Determine state based on time
    if (audioTime < this.transitions.toStarStart) {
      newState = this.STATES.IDLE;
    } else if (audioTime < this.transitions.toMinimal) {
      newState = this.STATES.STAR_START;
    } else if (audioTime < this.transitions.toFinal) {
      newState = this.STATES.MINIMAL;
    } else {
      newState = this.STATES.FINAL;
    }
    
    // Handle state transition
    if (newState !== this.currentState) {
      this.transitionTo(newState);
    }
    
    return this.currentState;
  }
  
  // Force transition to a specific state (useful for scrubbing)
  transitionTo(newState) {
    if (newState === this.currentState) return;
    
    this.previousState = this.currentState;
    this.currentState = newState;
    
    // Update flags based on state
    switch (newState) {
      case this.STATES.IDLE:
        this.stateFlags = {
          starShaderActive: false,
          firstCameraAnimActive: false,
          skyShaderActive: true,
          vegetationActive: true,
          secondCameraAnimActive: false
        };
        if (this.callbacks.onEnterIdle) this.callbacks.onEnterIdle();
        break;
        
      case this.STATES.STAR_START:
        this.stateFlags = {
          starShaderActive: true,
          firstCameraAnimActive: true,
          skyShaderActive: true,
          vegetationActive: true,
          secondCameraAnimActive: false
        };
        if (this.callbacks.onEnterStarStart) this.callbacks.onEnterStarStart();
        break;
        
      case this.STATES.MINIMAL:
        this.stateFlags = {
          starShaderActive: true,
          firstCameraAnimActive: false,  // First animation completed
          skyShaderActive: false,
          vegetationActive: false,
          secondCameraAnimActive: false
        };
        if (this.callbacks.onEnterMinimal) this.callbacks.onEnterMinimal();
        break;
        
      case this.STATES.FINAL:
        this.stateFlags = {
          starShaderActive: true,
          firstCameraAnimActive: false,
          skyShaderActive: false,
          vegetationActive: false,
          secondCameraAnimActive: true
        };
        if (this.callbacks.onEnterFinal) this.callbacks.onEnterFinal();
        break;
    }
    
    console.log(`State transition: ${this.getStateName(this.previousState)} -> ${this.getStateName(this.currentState)}`);
  }
  
  // Get current state name for debugging
  getStateName(state = this.currentState) {
    const names = Object.keys(this.STATES);
    return names.find(key => this.STATES[key] === state) || 'UNKNOWN';
  }
  
  // Check if a specific feature should be active
  isStarShaderActive() { return this.stateFlags.starShaderActive; }
  isFirstCameraAnimActive() { return this.stateFlags.firstCameraAnimActive; }
  isSkyShaderActive() { return this.stateFlags.skyShaderActive; }
  isVegetationActive() { return this.stateFlags.vegetationActive; }
  isSecondCameraAnimActive() { return this.stateFlags.secondCameraAnimActive; }
  
  // Helper to check if we're in a specific state
  isInState(stateName) {
    return this.currentState === this.STATES[stateName];
  }
  
  // Set callbacks for state entry
  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }
  
  // Reset to initial state
  reset() {
    this.transitionTo(this.STATES.IDLE);
  }
}

export default AnimationStateMachine;
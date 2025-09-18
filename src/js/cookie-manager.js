// cookie-manager.js - Simple cookie utilities for VHS collection state

// Set a cookie with expiration
function setCookie(name, value, days = 365) {
  const expires = new Date();
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

// Get a cookie value by name
function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for(let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

// Save VHS collection state to cookies
function saveVHSState(vhsCollected) {
  setCookie('vhs1', vhsCollected.vhs1 ? '1' : '0');
  setCookie('vhs2', vhsCollected.vhs2 ? '1' : '0');
  setCookie('vhs3', vhsCollected.vhs3 ? '1' : '0');
}

// Load VHS collection state from cookies
function loadVHSState() {
  return {
    vhs1: getCookie('vhs1') === '1',
    vhs2: getCookie('vhs2') === '1',
    vhs3: getCookie('vhs3') === '1'
  };
}

export { setCookie, getCookie, saveVHSState, loadVHSState };
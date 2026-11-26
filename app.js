import { suggestBest, printSiteswap } from './suggest.js';
import { randomSiteswap } from './random_siteswap.js';
import { startAnimation, setSiteswap, recolorByOrbit, recolorRandomly, setPace } from './anim.js';
import { createAutocomplete } from './autocomplete.js';

let suggestbox;
let copyResetTimer = null;

async function copyToClipboard() {
  const text = suggestbox.getSuggestion();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
  } catch {
    fallbackCopy(text);
  }

  const button = document.getElementById('copy');
  button.textContent = 'Copied!';
  if (copyResetTimer !== null) {
    clearTimeout(copyResetTimer);
  }
  copyResetTimer = setTimeout(() => {
    button.textContent = 'Copy';
    copyResetTimer = null;
  }, 1500);
}

function fallbackCopy(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

function showError(message) {
  const errorBox = document.getElementById('error');
  const errorText = document.getElementById('error-text');
  errorText.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  document.getElementById('error').hidden = true;
}

function updateSuggestion(prefix) {
  let suffix;
  let siteswap;
  let sync;

  const vanilla = document.getElementById('vanilla').checked;
  if (!prefix) {
    sync = Math.random() < 0.5;
    siteswap = randomSiteswap(vanilla, sync);
    suffix = printSiteswap(siteswap, sync);
  } else {
    sync = prefix[0] === '(';
    const result = suggestBest(prefix, !vanilla, sync);
    if (result.error !== undefined) {
      suggestbox.setSuggestion('');
      showError(result.error);
      return;
    }
    suffix = result.suffix;
    siteswap = result.siteswap;
  }

  suggestbox.setSuggestion(prefix + suffix);
  hideError();

  const colorByOrbit = document.getElementById('by_orbit').checked;
  setSiteswap(siteswap, colorByOrbit, sync);
}

function initApp() {
  suggestbox = createAutocomplete(document.getElementById('input'), {
    onChange: updateSuggestion,
  });
  suggestbox.focus();

  for (const radio of document.querySelectorAll('input[name="options"]')) {
    radio.addEventListener('change', () => {
      updateSuggestion(suggestbox.getText());
    });
  }

  for (const radio of document.querySelectorAll('input[name="colors"]')) {
    radio.addEventListener('change', () => {
      if (document.getElementById('by_orbit').checked) {
        recolorByOrbit();
      } else {
        recolorRandomly();
      }
    });
  }

  document.getElementById('randomize').addEventListener('click', () => {
    updateSuggestion(suggestbox.getText());
  });

  document.getElementById('copy').addEventListener('click', copyToClipboard);

  const speedSlider = document.getElementById('animation_speed');
  const speedValue = document.getElementById('speed-value');
  const syncSpeed = () => {
    const val = Number(speedSlider.value);
    speedValue.textContent = String(val);
    setPace(val / 160);
  };
  speedSlider.addEventListener('input', syncSpeed);
  syncSpeed();

  const urlParams = new URLSearchParams(window.location.search);
  const initialPrefix = urlParams.get('prefix') || '';
  if (initialPrefix) {
    suggestbox.setText(initialPrefix);
  }
  updateSuggestion(initialPrefix);

  startAnimation(document.getElementById('canvas'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

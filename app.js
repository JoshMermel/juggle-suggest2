import { printSiteswap } from './suggest.js';
import { suggestUnified, fromLegacySiteswap } from './mhn.js';
import { randomSiteswap } from './random_siteswap.js';
import { decomposeMhnOrbits } from './orbits.js';
import {
  startAnimation,
  setMhn,
  recolorByOrbit,
  recolorRandomly,
  setPace,
  getOrbitColors,
} from './anim.js';
import { createAutocomplete } from './autocomplete.js';
import { buildOrbitGraphModelFromMhn, renderOrbitGraph } from './orbits_graph.js';
import { createPatternStore } from './storage.js';

const MAX_EXTRA_STEPS = 10;

let suggestbox;
let store;
let copyResetTimer = null;

let currentPattern = '';
let currentMhn = null;
let currentDecomposed = null;
let extraSuffixSteps = 0;

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
  const sel = document.getSelection();
  const prevRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  if (sel) {
    sel.removeAllRanges();
    if (prevRange) {
      sel.addRange(prevRange);
    }
  }
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

function updateStarButton() {
  const btn = document.getElementById('star');
  const starred = store.isStarred(currentPattern);
  btn.setAttribute('aria-pressed', String(starred));
  btn.textContent = starred ? '\u2605 Starred' : '\u2606 Star';
  btn.disabled = !currentPattern;
}

function updateStepperUI(hasPrefix, addedBeats = 0, hasError = false, lockedByStar = false) {
  const shorterBtn = document.getElementById('suffix-shorter');
  const longerBtn = document.getElementById('suffix-longer');
  const label = document.getElementById('suffix-label');

  if (!hasPrefix) {
    shorterBtn.disabled = true;
    longerBtn.disabled = true;
    label.textContent = 'Random';
    label.title = 'Enter a prefix to adjust suffix length';
    return;
  }

  shorterBtn.disabled = extraSuffixSteps <= 0;
  longerBtn.disabled = hasError || lockedByStar || extraSuffixSteps >= MAX_EXTRA_STEPS;
  label.textContent = extraSuffixSteps === 0 ? 'Shortest' : `+${extraSuffixSteps} step${extraSuffixSteps === 1 ? '' : 's'}`;
  label.title = hasError ? '' : (lockedByStar ? "Pattern ends with '*'" : `Added ${addedBeats} beat${addedBeats === 1 ? '' : 's'}`);
}

function renderCurrentOrbitGraph() {
  const container = document.getElementById('orbits-graph');
  if (!currentMhn) {
    container.replaceChildren();
    return;
  }
  const model = buildOrbitGraphModelFromMhn(currentMhn, getOrbitColors(), currentDecomposed);
  renderOrbitGraph(container, model);
}

function renderStarredList() {
  const container = document.getElementById('starred-list');
  container.replaceChildren();
  const patterns = store.getStarred();
  if (patterns.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted-note';
    empty.textContent = 'Click Star to save patterns here.';
    container.appendChild(empty);
    return;
  }

  for (const pattern of patterns) {
    const wrap = document.createElement('span');
    wrap.className = 'pattern-chip-wrap';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'pattern-chip';
    loadBtn.textContent = pattern;
    loadBtn.addEventListener('click', () => {
      extraSuffixSteps = 0;
      suggestbox.setText(pattern);
      updateSuggestion(pattern);
      suggestbox.focus();
    });
    wrap.appendChild(loadBtn);

    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'pattern-chip-remove';
    rmBtn.setAttribute('aria-label', `Unstar ${pattern}`);
    rmBtn.textContent = '\u00d7';
    rmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.removeStar(pattern);
      updateStarButton();
      renderStarredList();
    });
    wrap.appendChild(rmBtn);

    container.appendChild(wrap);
  }
}

function updateSuggestion(prefix, { rollbackStepsTo = null } = {}) {
  let suffix;
  let mhn;
  let addedBeats = 0;

  const vanilla = document.getElementById('vanilla').checked;
  if (!prefix) {
    extraSuffixSteps = 0;
    const sync = Math.random() < 0.5;
    const siteswap = randomSiteswap(vanilla, sync);
    suffix = printSiteswap(siteswap, sync);
    mhn = fromLegacySiteswap(siteswap, sync);
  } else {
    const result = suggestUnified(prefix, !vanilla, extraSuffixSteps);
    if (result.error !== undefined) {
      if (rollbackStepsTo !== null) {
        extraSuffixSteps = rollbackStepsTo;
        showError(result.error);
        updateStepperUI(true, 0, true);
        return;
      }
      suggestbox.setSuggestion('');
      showError(result.error);
      updateStepperUI(true, 0, true);
      return;
    }
    suffix = result.suffix;
    mhn = result.mhn;
    addedBeats = result.addedBeats;
  }

  const fullPattern = prefix + suffix;
  const decomposed = decomposeMhnOrbits(mhn);
  currentPattern = fullPattern;
  currentMhn = mhn;
  currentDecomposed = decomposed;

  suggestbox.setSuggestion(fullPattern);
  hideError();
  updateStepperUI(Boolean(prefix), addedBeats, false, Boolean(mhn.switchRepeat));
  updateStarButton();

  const colorByOrbit = document.getElementById('by_orbit').checked;
  setMhn(mhn, colorByOrbit, decomposed);
  renderCurrentOrbitGraph();
}

function initApp() {
  store = createPatternStore();

  suggestbox = createAutocomplete(document.getElementById('input'), {
    onChange: (txt) => {
      extraSuffixSteps = 0;
      updateSuggestion(txt);
    },
  });
  suggestbox.focus();

  for (const radio of document.querySelectorAll('input[name="options"]')) {
    radio.addEventListener('change', () => {
      extraSuffixSteps = 0;
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
      renderCurrentOrbitGraph();
    });
  }

  document.getElementById('randomize').addEventListener('click', () => {
    updateSuggestion(suggestbox.getText());
  });

  document.getElementById('copy').addEventListener('click', copyToClipboard);

  document.getElementById('star').addEventListener('click', () => {
    if (!currentPattern) {
      return;
    }
    store.toggleStar(currentPattern);
    updateStarButton();
    renderStarredList();
  });

  document.getElementById('suffix-shorter').addEventListener('click', () => {
    if (extraSuffixSteps > 0) {
      extraSuffixSteps -= 1;
      updateSuggestion(suggestbox.getText());
    }
  });

  document.getElementById('suffix-longer').addEventListener('click', () => {
    const prefix = suggestbox.getText();
    if (!prefix || extraSuffixSteps >= MAX_EXTRA_STEPS) {
      return;
    }
    const prevSteps = extraSuffixSteps;
    extraSuffixSteps += 1;
    updateSuggestion(prefix, { rollbackStepsTo: prevSteps });
  });

  const speedSlider = document.getElementById('animation_speed');
  const speedValue = document.getElementById('speed-value');
  const syncSpeed = () => {
    const val = Number(speedSlider.value);
    speedValue.textContent = String(val);
    setPace(val / 160);
  };
  speedSlider.addEventListener('input', syncSpeed);
  syncSpeed();

  renderStarredList();

  const urlParams = new URLSearchParams(window.location.search);
  const initialPrefix = urlParams.get('prefix') || '';
  if (initialPrefix) {
    suggestbox.setText(initialPrefix);
  }
  updateSuggestion(initialPrefix);

  startAnimation(document.getElementById('canvas'));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

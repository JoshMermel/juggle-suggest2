// Lightweight ghost-text autocomplete input (replaces vendored completely.js).

export function createAutocomplete(container, { placeholder = '', onChange = () => {} } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'autocomplete-wrapper';

  const hint = document.createElement('input');
  hint.type = 'text';
  hint.className = 'autocomplete-hint';
  hint.disabled = true;
  hint.tabIndex = -1;
  hint.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'autocomplete-input';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.setAttribute('autocorrect', 'off');
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Siteswap pattern');

  wrapper.appendChild(hint);
  wrapper.appendChild(input);
  container.replaceChildren(wrapper);

  let currentSuggestion = '';

  function syncHint() {
    if (currentSuggestion && currentSuggestion.startsWith(input.value)) {
      hint.value = currentSuggestion;
    } else {
      hint.value = '';
    }
    hint.scrollLeft = input.scrollLeft;
  }

  function acceptSuggestion() {
    if (!hint.value || hint.value === input.value) {
      return false;
    }
    input.value = hint.value;
    syncHint();
    onChange(input.value);
    return true;
  }

  input.addEventListener('input', () => {
    syncHint();
    onChange(input.value);
  });

  input.addEventListener('scroll', () => {
    hint.scrollLeft = input.scrollLeft;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (acceptSuggestion()) {
        e.preventDefault();
      }
    } else if (e.key === 'Enter') {
      acceptSuggestion();
    } else if (
      e.key === 'ArrowRight' &&
      input.selectionStart === input.value.length &&
      input.selectionEnd === input.value.length
    ) {
      if (acceptSuggestion()) {
        e.preventDefault();
      }
    }
  });

  return {
    input,
    getText() {
      return input.value;
    },
    setText(text) {
      input.value = text;
      syncHint();
    },
    setSuggestion(text) {
      currentSuggestion = text || '';
      syncHint();
    },
    getSuggestion() {
      return hint.value || input.value;
    },
    focus() {
      input.focus();
    },
  };
}

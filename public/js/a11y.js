const STORAGE_KEY = 'vibecr.a11y';
const DEFAULTS = {
  fontScale: 1,
  contrast: false,
  spacing: false,
  toolbarOpen: false
};

let state = { ...DEFAULTS };
let labels = {
  open: 'Otwórz ustawienia dostępności',
  opened: 'Ustawienia dostępności (otwarte)',
  region: 'Ustawienia dostępności',
  toggle: 'Dostępność',
  fontUp: 'Powiększ tekst',
  fontDown: 'Pomniejsz tekst',
  contrast: 'Kontrast',
  spacing: 'Odstępy',
  reset: 'Reset',
  collapse: 'Zwiń',
  skipContent: 'Przejdź do treści',
  skipA11y: 'Przejdź do ustawień dostępności'
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      fontScale: parsed.fontScale ?? DEFAULTS.fontScale,
      contrast: !!parsed.contrast,
      spacing: !!parsed.spacing,
      toolbarOpen: !!parsed.toolbarOpen
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function els() {
  return {
    toolbar: document.getElementById('a11y-toolbar'),
    panel: document.getElementById('a11y-toolbar-panel'),
    toggle: document.getElementById('a11y-toggle'),
    collapse: document.getElementById('a11y-collapse'),
    up: document.getElementById('a11y-font-up'),
    down: document.getElementById('a11y-font-down'),
    contrast: document.getElementById('a11y-contrast'),
    spacing: document.getElementById('a11y-spacing'),
    reset: document.getElementById('a11y-reset'),
    toggleText: document.querySelector('#a11y-toggle .a11y-toolbar-toggle-text'),
    skipContent: document.getElementById('skip-to-content'),
    skipA11y: document.getElementById('skip-to-a11y')
  };
}

function setToolbarOpen(open, opts = {}) {
  const { toolbar, panel, toggle, up } = els();
  state.toolbarOpen = !!open;
  if (!toolbar || !panel || !toggle) return;
  toolbar.classList.toggle('is-collapsed', !state.toolbarOpen);
  toolbar.classList.toggle('is-open', state.toolbarOpen);
  panel.hidden = !state.toolbarOpen;
  toggle.setAttribute('aria-expanded', state.toolbarOpen ? 'true' : 'false');
  toggle.setAttribute('aria-label', state.toolbarOpen ? labels.opened : labels.open);
  if (opts.focusPanel && state.toolbarOpen && up) {
    window.setTimeout(() => up.focus(), 0);
  } else if (opts.focusToggle) {
    window.setTimeout(() => toggle.focus(), 0);
  }
}

function applySettings() {
  const root = document.documentElement;
  const { contrast, spacing } = els();
  root.style.setProperty('--a11y-font-scale', String(state.fontScale));
  root.classList.toggle('a11y-contrast', !!state.contrast);
  root.classList.remove('a11y-underline-links');
  root.classList.toggle('a11y-spacing', !!state.spacing);
  if (contrast) contrast.setAttribute('aria-pressed', state.contrast ? 'true' : 'false');
  if (spacing) spacing.setAttribute('aria-pressed', state.spacing ? 'true' : 'false');
  persist();
}

function apply() {
  applySettings();
  setToolbarOpen(state.toolbarOpen);
}

function openToolbarFromSkip() {
  const { toolbar } = els();
  setToolbarOpen(true, { focusPanel: true });
  persist();
  if (toolbar) toolbar.focus({ preventScroll: true });
}

export function updateA11yLabels(dict) {
  const a = dict?.a11y;
  if (!a) return;
  labels = {
    open: a.open || labels.open,
    opened: a.opened || labels.opened,
    region: a.region || labels.region,
    toggle: a.toggle || labels.toggle,
    fontUp: a.fontUp || labels.fontUp,
    fontDown: a.fontDown || labels.fontDown,
    contrast: a.contrast || labels.contrast,
    spacing: a.spacing || labels.spacing,
    reset: a.reset || labels.reset,
    collapse: a.collapse || labels.collapse,
    skipContent: a.skipContent || labels.skipContent,
    skipA11y: a.skipA11y || labels.skipA11y
  };
  const {
    toolbar, toggle, toggleText, up, down, contrast, spacing, reset, collapse, skipContent, skipA11y
  } = els();
  if (toolbar) toolbar.setAttribute('aria-label', labels.region);
  if (toggle) toggle.setAttribute('aria-label', state.toolbarOpen ? labels.opened : labels.open);
  if (toggleText) toggleText.textContent = labels.toggle;
  if (up) up.setAttribute('aria-label', labels.fontUp);
  if (down) down.setAttribute('aria-label', labels.fontDown);
  if (contrast) contrast.textContent = labels.contrast;
  if (spacing) spacing.textContent = labels.spacing;
  if (reset) reset.textContent = labels.reset;
  if (collapse) collapse.textContent = labels.collapse;
  if (skipContent) skipContent.textContent = labels.skipContent;
  if (skipA11y) skipA11y.textContent = labels.skipA11y;
}

export function initA11y() {
  state = loadState();
  const {
    toolbar, toggle, collapse, up, down, contrast, spacing, reset
  } = els();

  if (toolbar && !toolbar.hasAttribute('tabindex')) {
    toolbar.setAttribute('tabindex', '-1');
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      if (state.toolbarOpen) {
        if (up) up.focus();
        return;
      }
      setToolbarOpen(true, { focusPanel: true });
      persist();
    });
  }

  if (collapse) {
    collapse.addEventListener('click', () => {
      setToolbarOpen(false, { focusToggle: true });
      persist();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !state.toolbarOpen) return;
    if (toolbar && !toolbar.contains(document.activeElement)) return;
    setToolbarOpen(false, { focusToggle: true });
    persist();
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href="#a11y-toolbar"]');
    if (!link) return;
    e.preventDefault();
    if (history.replaceState) history.replaceState(null, '', '#a11y-toolbar');
    else location.hash = 'a11y-toolbar';
    openToolbarFromSkip();
  });

  window.addEventListener('hashchange', () => {
    if (location.hash === '#a11y-toolbar') openToolbarFromSkip();
  });

  if (up) {
    up.addEventListener('click', () => {
      state.fontScale = Math.min(1.5, Math.round((state.fontScale + 0.1) * 10) / 10);
      applySettings();
    });
  }
  if (down) {
    down.addEventListener('click', () => {
      state.fontScale = Math.max(0.9, Math.round((state.fontScale - 0.1) * 10) / 10);
      applySettings();
    });
  }
  if (contrast) {
    contrast.addEventListener('click', () => {
      state.contrast = !state.contrast;
      applySettings();
    });
  }
  if (spacing) {
    spacing.addEventListener('click', () => {
      state.spacing = !state.spacing;
      applySettings();
    });
  }
  if (reset) {
    reset.addEventListener('click', () => {
      const keepOpen = state.toolbarOpen;
      state = { ...DEFAULTS, toolbarOpen: keepOpen };
      apply();
    });
  }

  apply();
  if (location.hash === '#a11y-toolbar') openToolbarFromSkip();
}

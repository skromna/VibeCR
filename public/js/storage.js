import { $ } from './dom.js';

// =====================================================================
// Projekty (skróty) — WYŁĄCZNIE w localStorage tego komputera
// =====================================================================
export const PROJECTS_KEY = 'vibecr.projects';
export const LEGACY_PROJECTS_KEY = 'gitvibe.projects';

// Limity chroniące przed złośliwym/uszkodzonym plikiem importu
export const MAX_PROJECTS = 500;
export const MAX_LABEL_LEN = 80;
export const MAX_PATH_LEN = 1024;
export const MAX_IMPORT_BYTES = 256 * 1024;

// Buduje bezpieczny obiekt projektu: tylko jawne pola (bez prototype pollution),
// bez znaków kontrolnych, z twardymi limitami długości.
export function sanitizeProjectEntry(item, fallbackId) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const rawPath = typeof item.path === 'string' ? item.path : '';
  const rawLabel = typeof item.label === 'string' ? item.label : '';
  const cleanPath = rawPath.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleanPath || cleanPath.length > MAX_PATH_LEN) return null;
  const fallbackLabel = cleanPath.split(/[\\/]/).filter(Boolean).pop() || cleanPath;
  const label = (rawLabel.replace(/[\u0000-\u001f\u007f]/g, '').trim() || fallbackLabel).slice(0, MAX_LABEL_LEN);
  const id = Number.isFinite(item.id) && item.id > 0 ? item.id : fallbackId;
  return { id, label, path: cleanPath };
}

// Filtruje listę do wyłącznie poprawnych, unikalnych wpisów (bezpieczne dla danych z zewnątrz)
export function sanitizeProjects(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list.slice(0, MAX_PROJECTS)) {
    const clean = sanitizeProjectEntry(item, Date.now() + out.length);
    if (!clean) continue;
    const key = clean.path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function loadProjectsLocal() {
  try {
    let raw = localStorage.getItem(PROJECTS_KEY);
    if (raw === null) {
      // Migracja ze starej nazwy aplikacji (Local GitVibe Reviewer)
      raw = localStorage.getItem(LEGACY_PROJECTS_KEY);
      if (raw !== null) localStorage.setItem(PROJECTS_KEY, raw);
    }
    const parsed = JSON.parse(raw || '[]');
    return sanitizeProjects(parsed);
  } catch { return []; }
}

export function saveProjectsLocal(list) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  } catch {
    void 0;
  }
}

export const LLM_KEY = 'vibecr.llm';
export const LEGACY_LLM_KEY = 'gitvibe.llm';

export const UI_KEY = 'vibecr.ui';
export const LEGACY_UI_KEY = 'gitvibe.ui';

export function loadUIConfig() {
  try {
    let raw = localStorage.getItem(UI_KEY);
    if (raw === null) {
      raw = localStorage.getItem(LEGACY_UI_KEY);
      if (raw !== null) localStorage.setItem(UI_KEY, raw);
    }
    const parsed = JSON.parse(raw || '{}');
    return parsed;
  } catch { return {}; }
}

export function saveUIConfig(patch) {
  try {
    const current = loadUIConfig();
    const next = { ...current, ...(patch || {}) };
    localStorage.setItem(UI_KEY, JSON.stringify(next));
    return next;
  } catch { return patch || {}; }
}

export const LLM_PRESETS = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-flash-latest',
    needKey: true
  },
  claude: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    needKey: true
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needKey: true
  },
  opencode: {
    baseUrl: 'http://127.0.0.1:4096',
    model: 'opencode/deepseek-v4.1-flash-free',
    needKey: false
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5-coder:7b',
    needKey: false
  },
  lmstudio: {
    baseUrl: 'http://localhost:1234/v1',
    model: '',
    needKey: false
  }
};

export function loadLLMConfig() {
  try {
    let raw = localStorage.getItem(LLM_KEY);
    if (raw === null) {
      // Migracja ze starej nazwy aplikacji (Local GitVibe Reviewer)
      raw = localStorage.getItem(LEGACY_LLM_KEY);
      if (raw !== null) localStorage.setItem(LLM_KEY, raw);
    }
    const parsed = JSON.parse(raw || '{}');
    const config = { provider: 'gemini', baseUrl: '', apiKey: '', model: '', useAI: false, ...parsed };
    // Migracja: wycofany domyślny model Gemini -> alias śledzący najnowszy model flash
    if (config.provider === 'gemini' && config.model === 'gemini-2.5-flash') {
      config.model = LLM_PRESETS.gemini.model;
    }
    if (config.provider === 'opencode') {
      const model = String(config.model || '').trim();
      if (!model || /glm-4-9b/i.test(model)) {
        config.model = LLM_PRESETS.opencode.model;
      }
    }
    return config;
  } catch { return { provider: 'gemini', baseUrl: '', apiKey: '', model: '', useAI: false }; }
}

export function saveLLMConfig() {
  const config = {
    provider: $('llmProvider').value,
    baseUrl: $('llmBaseUrl').value.trim(),
    apiKey: $('llmApiKey').value.trim(),
    model: $('llmModel').value.trim(),
    useAI: $('useAIInput').checked
  };
  try {
    localStorage.setItem(LLM_KEY, JSON.stringify(config));
  } catch {
    void 0;
  }
  return config;
}

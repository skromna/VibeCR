const fs = require('fs');
const path = require('path');
const { sanitizeCustomStandards, sanitizeBasePrompt } = require('./standards');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'review-settings.local.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeLocalReviewSettings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let largeFileLines;
  const n = Number(src.largeFileLines);
  if (Number.isFinite(n) && n > 0) {
    largeFileLines = Math.min(2000, Math.max(100, Math.floor(n)));
  }
  const prompts = src.basePrompts && typeof src.basePrompts === 'object' ? src.basePrompts : {};
  return {
    app: 'VibeCR',
    type: 'review-settings',
    version: 1,
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : new Date().toISOString(),
    largeFileLines,
    largeFileSkipCss: src.largeFileSkipCss === true || src.largeFileSkipCss === 'true',
    customStandards: sanitizeCustomStandards(src.customStandards || ''),
    basePrompts: {
      pl: sanitizeBasePrompt(prompts.pl || ''),
      en: sanitizeBasePrompt(prompts.en || '')
    }
  };
}

function loadLocalReviewSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    if (!raw.trim()) return null;
    return normalizeLocalReviewSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveLocalReviewSettings(payload) {
  ensureDataDir();
  const next = normalizeLocalReviewSettings({
    ...payload,
    updatedAt: new Date().toISOString()
  });
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, SETTINGS_FILE);
  } catch {
    fs.copyFileSync(tmp, SETTINGS_FILE);
    try { fs.unlinkSync(tmp); } catch { void 0; }
  }
  return next;
}

module.exports = {
  SETTINGS_FILE,
  loadLocalReviewSettings,
  saveLocalReviewSettings,
  normalizeLocalReviewSettings
};

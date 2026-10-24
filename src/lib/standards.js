const path = require('path');

const MAX_CUSTOM_STANDARDS = 2000;
const MAX_BASE_PROMPT = 30000;

const patternDefs = require(path.join(__dirname, '..', '..', 'shared', 'injection-patterns.json'));
const INJECTION_PATTERNS = patternDefs.map((p) => new RegExp(p.pattern, p.flags));

function sanitizeCustomStandards(input) {
  if (typeof input !== 'string') return '';
  let s = input.normalize('NFC');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.replace(/[\u200B-\u200D\u202A-\u202E\u2060\uFEFF]/g, '');
  s = s.replace(/```+/g, "'''");
  s = s.replace(/<\/?(system|assistant|user|prompt|instruction)[^>]*>/gi, '');
  for (const re of INJECTION_PATTERNS) {
    s = s.replace(re, '[filtered]');
  }
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.slice(0, MAX_CUSTOM_STANDARDS).trim();
}

function sanitizeBasePrompt(input) {
  if (typeof input !== 'string') return '';
  let s = input.normalize('NFC');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.replace(/[\u200B-\u200D\u202A-\u202E\u2060\uFEFF]/g, '');
  s = s.replace(/\n{4,}/g, '\n\n\n');
  return s.slice(0, MAX_BASE_PROMPT).trim();
}

function normalizeReviewOptions(body) {
  const src = body && typeof body === 'object' ? body : {};
  let largeFileLines;
  const rawLines = Number(src.largeFileLines);
  if (Number.isFinite(rawLines) && rawLines > 0) {
    largeFileLines = Math.min(2000, Math.max(100, Math.floor(rawLines)));
  }
  return {
    largeFileLines,
    largeFileSkipCss: src.largeFileSkipCss === true || src.largeFileSkipCss === 'true',
    customStandards: sanitizeCustomStandards(src.customStandards || ''),
    lang: src.lang === 'en' ? 'en' : 'pl'
  };
}

module.exports = {
  MAX_CUSTOM_STANDARDS,
  MAX_BASE_PROMPT,
  sanitizeCustomStandards,
  sanitizeBasePrompt,
  normalizeReviewOptions
};

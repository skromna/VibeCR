const MAX_CUSTOM_STANDARDS = 2000;

const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)\b/gi,
  /\b(system|assistant|developer)\s*:\s*/gi,
  /\bdo\s+not\s+follow\s+(the\s+)?(system|user)\b/gi,
  /\b(override|bypass)\s+(all\s+)?(safety|rules?|instructions?)\b/gi,
  /\bignoruj\s+(wszystkie\s+)?(poprzednie\s+)?(instrukcje|polecenia|zasady)\b/gi,
  /\b(nie\s+stosuj|pomijaj)\s+(systemowych\s+)?(instrukcji|zasad)\b/gi
];

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
  sanitizeCustomStandards,
  normalizeReviewOptions
};

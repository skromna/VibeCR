export function extractJSON(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const arrStart = cleaned.indexOf('[');
  const objStart = cleaned.indexOf('{');
  const lang = typeof document !== 'undefined' && document.documentElement.getAttribute('lang') === 'en'
    ? 'en'
    : 'pl';
  const errMsg = lang === 'en'
    ? 'Model response does not contain JSON.'
    : 'Odpowiedź modelu nie zawiera JSON.';

  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    const arrEnd = cleaned.lastIndexOf(']');
    if (arrEnd === -1 || arrEnd <= arrStart) throw new Error(errMsg);
    return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
  }

  const start = objStart;
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(errMsg);
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function normalizeAIResult(raw) {
  const result = { critical: [], framework: [], runtime: [], quality: [], stack: { languages: [], frameworks: [] } };

  const cleanList = (v) => Array.isArray(v)
    ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 40)).slice(0, 20)
    : [];
  if (raw.stack && typeof raw.stack === 'object') {
    result.stack.languages = cleanList(raw.stack.languages);
    result.stack.frameworks = cleanList(raw.stack.frameworks);
  }

  const keys = [
    ['critical', raw.critical, Infinity],
    ['framework', raw.framework || raw.react, 25],
    ['runtime', raw.runtime || raw.node, 25],
    ['quality', raw.quality, 25]
  ];
  for (const [cat, arr, max] of keys) {
    if (!Array.isArray(arr)) continue;
    const items = Number.isFinite(max) ? arr.slice(0, max) : arr;
    for (const item of items) {
      if (item && item.title && item.file) {
        result[cat].push({
          file: String(item.file),
          title: String(item.title).slice(0, 300),
          description: String(item.description || '').slice(0, 1000),
          fix: String(item.fix || '').slice(0, 4000),
          source: 'ai'
        });
      }
    }
  }
  return result;
}

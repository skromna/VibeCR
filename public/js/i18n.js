import { state } from './state.js';

export async function loadLocale(lang) {
  if (lang === 'en') {
    try {
      const res = await fetch('/i18n/en.json');
      return await res.json();
    } catch { return {}; }
  }
  try {
    const res = await fetch('/i18n/pl.json');
    return await res.json();
  } catch { return {}; }
}

export function t(key, vars) {
  let val = getByPath(state.i18n, key);
  if (val === undefined || val === null) val = key;
  if (vars && typeof val === 'string') {
    val = val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  }
  return val;
}

export function applyTranslations(dict, root = document) {
  if (!dict) return;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = getByPath(dict, key);
    if (val !== undefined && val !== null) el.textContent = val;
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    const val = getByPath(dict, key);
    if (val !== undefined && val !== null) el.innerHTML = val;
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const pair = el.getAttribute('data-i18n-attr').split('|');
    if (pair.length !== 2) return;
    const attr = pair[0].trim();
    const key = pair[1].trim();
    const val = getByPath(dict, key);
    if (val !== undefined && val !== null) el.setAttribute(attr, val);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = getByPath(dict, key);
    if (val !== undefined && val !== null) el.setAttribute('placeholder', val);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    const val = getByPath(dict, key);
    if (val !== undefined && val !== null) el.setAttribute('title', val);
  });
}

function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

export const i18n = { loadLocale, applyTranslations, t };

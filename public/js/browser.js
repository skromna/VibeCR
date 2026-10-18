import { $, escapeHtml } from './dom.js';
import { state } from './state.js';
import { saveProjectsLocal } from './storage.js';
import { renderPresets, markActivePreset } from './presets.js';
import { checkGitInfo } from './gitinfo.js';
import { t } from './i18n.js';

export function openBrowser() {
  $('browserModal').style.display = 'flex';
  $('browserError').style.display = 'none';
  const start = $('repoPathInput').value.trim() || 'C:\\';
  browseTo(start);
}

export function closeBrowser() {
  $('browserModal').style.display = 'none';
}

export async function browseTo(dirPath) {
  const listEl = $('browserList');
  const pathEl = $('browserPathInput');
  const errEl = $('browserError');
  errEl.style.display = 'none';
  listEl.innerHTML = `<div class="browser-empty">${escapeHtml(t('browser.loading'))}</div>`;

  try {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(dirPath)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.browserState.path = data.path;
    pathEl.value = data.path;

    const items = [];
    if (data.parent) {
      items.push(`<div class="browser-item" data-dir="${escapeHtml(data.parent)}"><span class="folder-icon">&#128193;</span> ${escapeHtml(t('browser.up'))}</div>`);
    }
    data.dirs.forEach((dir) => {
      const full = data.path ? data.path.replace(/[\\\/]+$/, '') + '\\' + dir : dir;
      items.push(`<div class="browser-item" data-dir="${escapeHtml(full)}"><span class="folder-icon">&#128193;</span> ${escapeHtml(dir)}</div>`);
    });
    listEl.innerHTML = items.length
      ? items.join('')
      : `<div class="browser-empty">${escapeHtml(t('browser.empty'))}</div>`;
    listEl.querySelectorAll('.browser-item').forEach((el) => {
      el.addEventListener('click', () => browseTo(el.dataset.dir));
    });
  } catch (err) {
    listEl.innerHTML = '';
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

export function browseToInput() {
  const val = $('browserPathInput').value.trim();
  if (val) browseTo(val);
}

export function useBrowsedPath() {
  $('repoPathInput').value = state.browserState.path;
  markActivePreset();
  closeBrowser();
  checkGitInfo();
}

export function addShortcutFromBrowser() {
  if (!state.browserState.path) return;
  const defaultName = state.browserState.path.split(/[\\\/]/).filter(Boolean).pop() || state.browserState.path;
  const label = prompt(t('browser.shortcutName'), defaultName);
  if (label === null) return;

  if (state.projects.some((p) => p.path.toLowerCase() === state.browserState.path.toLowerCase())) {
    alert(t('browser.shortcutExists'));
    return;
  }
  state.projects.push({ id: Date.now(), label: label.trim().slice(0, 80) || defaultName, path: state.browserState.path });
  saveProjectsLocal(state.projects);
  renderPresets();
  closeBrowser();
}

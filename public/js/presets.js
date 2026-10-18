import { $, escapeHtml } from './dom.js';
import { state } from './state.js';
import {
  saveProjectsLocal,
  sanitizeProjects,
  MAX_PROJECTS,
  MAX_IMPORT_BYTES
} from './storage.js';
import { checkGitInfo } from './gitinfo.js';
import { t } from './i18n.js';

export function renderPresets() {
  const wrap = $('presetProjects');
  wrap.innerHTML = state.projects.map((p) => `
    <span class="preset-wrap">
      <button type="button" data-path="${escapeHtml(p.path)}" data-action="select" class="preset-btn" title="${escapeHtml(p.path)}">
        ${escapeHtml(p.label)}
        <span class="preset-delete" data-delete-id="${Number(p.id)}" title="${escapeHtml(t('input.deleteShortcut'))}">&times;</span>
      </button>
    </span>
  `).join('') + `
    <button type="button" data-action="browse" class="preset-add">${escapeHtml(t('input.addProject'))}</button>
  `;
  markActivePreset();
}

export function markActivePreset() {
  const current = $('repoPathInput').value.trim().toLowerCase();
  document.querySelectorAll('.preset-btn').forEach((b) => {
    b.classList.toggle('active', (b.dataset.path || '').toLowerCase() === current);
  });
}

export function selectPreset(btn) {
  $('repoPathInput').value = btn.dataset.path;
  markActivePreset();
  checkGitInfo();
}

export function deleteProject(event, id) {
  event.stopPropagation();
  const project = state.projects.find((p) => p.id === id);
  if (!project || !confirm(t('input.deleteConfirm', { label: project.label, path: project.path }))) return;
  state.projects = state.projects.filter((p) => p.id !== id);
  saveProjectsLocal(state.projects);
  renderPresets();
}

export function exportProjects() {
  const payload = {
    app: 'VibeCR',
    type: 'projects',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: state.projects.map((p) => ({ label: p.label, path: p.path }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vibecr-projekty-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function triggerImportProjects() {
  const input = $('importProjectsFile');
  input.value = '';
  input.click();
}

export async function importProjectsFile(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error(t('errors.fileTooLarge'));

    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(t('errors.invalidJson'));
    }

    const rawList = Array.isArray(data)
      ? data
      : (data && typeof data === 'object' && Array.isArray(data.projects) ? data.projects : null);
    if (!rawList) throw new Error(t('errors.invalidStructure'));

    const incoming = sanitizeProjects(rawList);
    if (!incoming.length) throw new Error(t('errors.noValidPaths'));

    const existing = new Set(state.projects.map((p) => p.path.toLowerCase()));
    const added = [];
    for (const p of incoming) {
      if (existing.has(p.path.toLowerCase())) continue;
      existing.add(p.path.toLowerCase());
      added.push({ id: Date.now() + state.projects.length + added.length, label: p.label, path: p.path });
    }
    if (!added.length) {
      renderPresets();
      alert(t('alerts.importNone', { count: incoming.length }));
      return;
    }

    state.projects = state.projects.concat(added).slice(0, MAX_PROJECTS);
    saveProjectsLocal(state.projects);
    renderPresets();
    const skipped = incoming.length - added.length;
    alert(t('alerts.importOk', {
      count: added.length,
      skipped: skipped ? t('alerts.importSkipped', { count: skipped }) : ''
    }));
  } catch (err) {
    alert(t('alerts.importFail', { error: err.message }));
  }
}

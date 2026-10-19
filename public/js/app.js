import { $ } from './dom.js';
import { state } from './state.js';
import { loadProjectsLocal, saveLLMConfig, LLM_PRESETS, loadUIConfig, saveUIConfig } from './storage.js';
import {
  buildReviewPrompt,
  extractJSON,
  normalizeAIResult,
  getDefaultBasePrompt,
  sanitizeBasePrompt,
  MAX_BASE_PROMPT
} from './prompt.js';
import { loadLocale, applyTranslations, t } from './i18n.js';
import { checkGitInfo } from './gitinfo.js';
import {
  renderPresets,
  markActivePreset,
  selectPreset,
  deleteProject,
  exportProjects,
  triggerImportProjects,
  importProjectsFile
} from './presets.js';
import {
  renderReport,
  mergeIssues,
  dismissIssue,
  clearCategory,
  restoreIssues,
  copyFix,
  copyAllIssues,
  copyFixBtn,
  dismissBtn,
  updateReportTitles
} from './report.js';
import {
  openBrowser,
  closeBrowser,
  browseToInput,
  useBrowsedPath,
  addShortcutFromBrowser
} from './browser.js';
import {
  applyLLMConfig,
  onProviderChange,
  refreshOpenCodeModels,
  testLLM,
  startOpenCodeServer,
  stopOpenCodeServer,
  callLLM,
  syncProviderUi
} from './providers.js';
import { initA11y, updateA11yLabels } from './a11y.js';
import { sanitizeCustomStandards, MAX_CUSTOM_STANDARDS } from './standards.js';

function getUiLang() {
  const ui = loadUIConfig();
  if (ui.lang === 'en' || ui.lang === 'pl') return ui.lang;
  return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'pl';
}

function getStoredBasePrompts(ui = loadUIConfig()) {
  const prompts = ui.basePrompts && typeof ui.basePrompts === 'object' ? ui.basePrompts : {};
  return {
    pl: typeof prompts.pl === 'string' ? prompts.pl : '',
    en: typeof prompts.en === 'string' ? prompts.en : ''
  };
}

function readBasePromptFromEditor() {
  const input = $('basePromptInput');
  return sanitizeBasePrompt(input ? input.value : '');
}

function readReviewSettings() {
  const lfInput = $('largeFileLinesInput');
  const skipCss = $('largeFileSkipCssInput');
  const standards = $('customStandardsInput');
  const lang = getUiLang();
  const basePrompts = getStoredBasePrompts();
  const edited = readBasePromptFromEditor();
  const defaultPrompt = getDefaultBasePrompt(lang);
  basePrompts[lang] = edited && edited !== defaultPrompt ? edited : '';
  let largeFileLines;
  if (lfInput && lfInput.value) {
    const v = Number(lfInput.value);
    if (Number.isFinite(v) && v > 0) largeFileLines = Math.min(2000, Math.max(100, Math.floor(v)));
  }
  return {
    largeFileLines,
    largeFileSkipCss: !!(skipCss && skipCss.checked),
    customStandards: sanitizeCustomStandards(standards ? standards.value : ''),
    basePrompt: basePrompts[lang] || '',
    basePrompts
  };
}

function setLocalSettingsStatus(message) {
  const el = $('localSettingsStatus');
  if (el) el.textContent = message || '';
}

function formatSettingsTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(getUiLang() === 'en' ? 'en-GB' : 'pl-PL');
  } catch {
    return iso;
  }
}

function reviewSettingsFromUi(ui = loadUIConfig()) {
  const prompts = getStoredBasePrompts(ui);
  return {
    largeFileLines: ui.largeFileLines,
    largeFileSkipCss: !!ui.largeFileSkipCss,
    customStandards: sanitizeCustomStandards(ui.customStandards || ''),
    basePrompts: prompts
  };
}

function hasLocalReviewContent(settings) {
  if (!settings) return false;
  if (settings.customStandards) return true;
  if (settings.basePrompts?.pl || settings.basePrompts?.en) return true;
  if (typeof settings.largeFileLines !== 'undefined') return true;
  if (settings.largeFileSkipCss) return true;
  return false;
}

async function syncReviewSettingsToDisk(settings) {
  try {
    const res = await fetch('/api/review-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        largeFileLines: settings.largeFileLines,
        largeFileSkipCss: settings.largeFileSkipCss,
        customStandards: settings.customStandards,
        basePrompts: settings.basePrompts
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) throw new Error('restart');
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    setLocalSettingsStatus(t('reviewSettings.localSaved', {
      at: formatSettingsTime(data.settings?.updatedAt)
    }));
    return data.settings || null;
  } catch (err) {
    if (err?.message === 'restart') {
      setLocalSettingsStatus(t('reviewSettings.localSaveRestart'));
    } else {
      setLocalSettingsStatus(t('reviewSettings.localSaveFailed'));
    }
    return null;
  }
}

function persistReviewSettings() {
  const settings = readReviewSettings();
  saveUIConfig({
    largeFileLines: settings.largeFileLines,
    largeFileSkipCss: settings.largeFileSkipCss,
    customStandards: settings.customStandards,
    basePrompts: settings.basePrompts
  });
  updateStandardsCounter();
  updateBasePromptCounter();
  syncReviewSettingsToDisk(settings);
  return settings;
}

async function loadReviewSettingsFromDisk() {
  try {
    const res = await fetch('/api/review-settings');
    if (!res.ok) return null;
    const data = await res.json();
    return data.exists ? data.settings : null;
  } catch {
    return null;
  }
}

async function hydrateReviewSettings() {
  const localUi = loadUIConfig();
  const disk = await loadReviewSettingsFromDisk();
  if (disk) {
    saveUIConfig({
      largeFileLines: disk.largeFileLines,
      largeFileSkipCss: disk.largeFileSkipCss,
      customStandards: disk.customStandards,
      basePrompts: disk.basePrompts
    });
    applyReviewSettings(loadUIConfig());
    setLocalSettingsStatus(t('reviewSettings.localLoaded', {
      at: formatSettingsTime(disk.updatedAt)
    }));
    return;
  }
  applyReviewSettings(localUi);
  const fromBrowser = reviewSettingsFromUi(localUi);
  if (hasLocalReviewContent(fromBrowser)) {
    await syncReviewSettingsToDisk(fromBrowser);
  }
}

function exportReviewStandards() {
  const settings = persistReviewSettings();
  const payload = {
    app: 'VibeCR',
    type: 'review-settings',
    version: 1,
    exportedAt: new Date().toISOString(),
    customStandards: settings.customStandards,
    largeFileLines: settings.largeFileLines,
    largeFileSkipCss: settings.largeFileSkipCss,
    basePrompts: settings.basePrompts
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vibecr-standardy-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function triggerImportReviewStandards() {
  const input = $('importStandardsFile');
  if (!input) return;
  input.value = '';
  input.click();
}

async function importReviewStandardsFile(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    let incoming;
    const trimmed = text.trim();
    if (!trimmed) throw new Error('empty');
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      incoming = parsed.settings && typeof parsed.settings === 'object'
        ? parsed.settings
        : parsed;
      if (typeof incoming.customStandards !== 'string' && typeof incoming.standards === 'string') {
        incoming = { ...incoming, customStandards: incoming.standards };
      }
    } else {
      incoming = { customStandards: trimmed };
    }
    const current = readReviewSettings();
    const merged = {
      largeFileLines: incoming.largeFileLines ?? current.largeFileLines,
      largeFileSkipCss: typeof incoming.largeFileSkipCss === 'boolean'
        ? incoming.largeFileSkipCss
        : current.largeFileSkipCss,
      customStandards: sanitizeCustomStandards(
        typeof incoming.customStandards === 'string'
          ? incoming.customStandards
          : current.customStandards
      ),
      basePrompts: {
        pl: typeof incoming.basePrompts?.pl === 'string'
          ? sanitizeBasePrompt(incoming.basePrompts.pl)
          : current.basePrompts.pl,
        en: typeof incoming.basePrompts?.en === 'string'
          ? sanitizeBasePrompt(incoming.basePrompts.en)
          : current.basePrompts.en
      }
    };
    saveUIConfig(merged);
    applyReviewSettings(loadUIConfig());
    await syncReviewSettingsToDisk(merged);
    setLocalSettingsStatus(t('reviewSettings.importOk'));
  } catch (err) {
    setLocalSettingsStatus(t('reviewSettings.importFailed', {
      error: err?.message || String(err)
    }));
  }
}

function updateStandardsCounter() {
  const el = $('customStandardsCount');
  const input = $('customStandardsInput');
  if (!el || !input) return;
  const len = sanitizeCustomStandards(input.value).length;
  el.textContent = `${len} / ${MAX_CUSTOM_STANDARDS}`;
}

function updateBasePromptCounter() {
  const el = $('basePromptCount');
  const input = $('basePromptInput');
  if (!el || !input) return;
  const len = sanitizeBasePrompt(input.value).length;
  el.textContent = `${len} / ${MAX_BASE_PROMPT}`;
}

function loadBasePromptIntoEditor(ui = loadUIConfig(), lang = getUiLang()) {
  const input = $('basePromptInput');
  if (!input) return;
  const stored = getStoredBasePrompts(ui)[lang];
  const sanitized = sanitizeBasePrompt(stored || '');
  input.value = sanitized || getDefaultBasePrompt(lang);
  updateBasePromptCounter();
}

function resetBasePrompt() {
  if (!confirm(t('reviewSettings.basePromptResetConfirm'))) return;
  const lang = getUiLang();
  const basePrompts = getStoredBasePrompts();
  basePrompts[lang] = '';
  saveUIConfig({ basePrompts });
  const input = $('basePromptInput');
  if (input) input.value = getDefaultBasePrompt(lang);
  updateBasePromptCounter();
  persistReviewSettings();
}

function applyReviewSettings(ui) {
  const lf = $('largeFileLinesInput');
  if (lf && typeof ui.largeFileLines !== 'undefined') {
    lf.value = String(ui.largeFileLines);
  }
  const skipCss = $('largeFileSkipCssInput');
  if (skipCss) skipCss.checked = !!ui.largeFileSkipCss;
  const standards = $('customStandardsInput');
  if (standards) standards.value = sanitizeCustomStandards(ui.customStandards || '');
  updateStandardsCounter();
  loadBasePromptIntoEditor(ui);
}

async function fetchAIIssues(repoPath, scope, compareBranch, includeTests, lang, reviewOpts) {
  const res = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, scope, compareBranch, includeTests, lang })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);

  if (!data.files.length) return { ai: { critical: [], framework: [], runtime: [], quality: [] }, sentFiles: 0, truncated: false };

  const config = saveLLMConfig();
  const prompt = buildReviewPrompt(data.files, lang, reviewOpts);
  const reply = await callLLM(config, prompt);
  return { ai: normalizeAIResult(extractJSON(reply)), sentFiles: data.files.length, truncated: data.truncated };
}

async function runReview() {
  const repoPath = state.repoInput.value.trim();
  const compareBranch = $('compareBranchInput').value.trim();
  const includeTests = $('includeTestsInput').checked;
  const scope = document.querySelector('input[name="scope"]:checked').value;

  if (!repoPath) {
    alert(t('alerts.needPath'));
    return;
  }

  const llmConfig = saveLLMConfig();
  const useAI = $('useAIInput').checked;
  const lang = getUiLang();

  const runBtn = $('runBtn');
  runBtn.disabled = true;
  const statusText = $('gitStatusText');
  const prevStatus = statusText.textContent;

  try {
    await checkGitInfo();

    statusText.className = 'status-work';
    statusText.textContent = t('status.heuristic');
    const reviewOpts = persistReviewSettings();
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath,
        scope,
        compareBranch,
        includeTests,
        largeFileLines: reviewOpts.largeFileLines,
        largeFileSkipCss: reviewOpts.largeFileSkipCss,
        customStandards: reviewOpts.customStandards,
        lang
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    let aiResult = { critical: [], framework: [], runtime: [], quality: [] };
    let aiInfoText = '';

    if (useAI) {
      const preset = LLM_PRESETS[llmConfig.provider];
      if (preset?.needKey && !llmConfig.apiKey) {
        alert(t('alerts.needApiKey'));
      } else {
        statusText.className = 'status-work';
        statusText.textContent = t('status.aiRunning', { provider: llmConfig.provider });
        try {
          const aiData = await fetchAIIssues(repoPath, scope, compareBranch, includeTests, lang, reviewOpts);
          aiResult = aiData.ai;
          const aiCount = aiResult.critical.length + aiResult.framework.length + aiResult.runtime.length + aiResult.quality.length;
          aiInfoText = t('report.aiAdded', {
            model: llmConfig.model,
            count: aiCount,
            files: aiData.sentFiles,
            truncated: aiData.truncated ? t('report.aiTruncated') : ''
          });
        } catch (aiErr) {
          aiInfoText = t('report.aiUnavailable', { error: aiErr.message });
        }
      }
    }

    const srvStack = data.detected || { languages: [], frameworks: [] };
    const aiStack = aiResult.stack || { languages: [], frameworks: [] };
    const uniqStack = (arr) => Array.from(new Set((arr || []).map((s) => String(s).trim()).filter(Boolean)));
    const detected = {
      languages: uniqStack([].concat(srvStack.languages, aiStack.languages)),
      frameworks: uniqStack([].concat(srvStack.frameworks, aiStack.frameworks))
    };

    state.lastReport = {
      isRepo: data.isRepo !== false,
      branch: data.isRepo === false ? t('report.branchNoGit') : (data.branch || t('report.branchNoCommits')),
      scannedFilesCount: data.scannedFilesCount,
      detected,
      critical: mergeIssues(data.critical, aiResult.critical),
      framework: mergeIssues(data.framework || data.react, aiResult.framework),
      runtime: mergeIssues(data.runtime || data.node, aiResult.runtime),
      quality: mergeIssues(data.quality || [], aiResult.quality),
      aiInfoText
    };

    $('resultsSection').style.display = 'block';
    $('scannedCount').textContent = state.lastReport.scannedFilesCount;

    state.reportBackup = {
      critical: state.lastReport.critical.slice(),
      framework: state.lastReport.framework.slice(),
      runtime: state.lastReport.runtime.slice(),
      quality: state.lastReport.quality.slice()
    };

    updateReportTitles();
    const languages = detected.languages.join(', ') || t('report.stackUnknown');
    const frameworks = detected.frameworks.length
      ? t('report.stackFrameworks', { list: detected.frameworks.join(', ') })
      : '';
    const aiInfo = $('aiInfo');
    if (aiInfo) aiInfo.textContent = t('report.stack', { languages, frameworks }) + aiInfoText;

    renderReport();

    statusText.className = 'status-ok';
    statusText.textContent = prevStatus;
  } catch (err) {
    alert(err.message);
    statusText.className = 'status-err';
    statusText.textContent = err.message;
  } finally {
    runBtn.disabled = false;
  }
}

function wireEvents() {
  $('exportProjectsBtn').addEventListener('click', exportProjects);
  $('importProjectsBtn').addEventListener('click', triggerImportProjects);
  $('importProjectsFile').addEventListener('change', importProjectsFile);

  $('presetProjects').addEventListener('click', (e) => {
    const del = e.target.closest('[data-delete-id]');
    if (del) {
      deleteProject(e, Number(del.dataset.deleteId));
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'select') selectPreset(btn);
    else if (btn.dataset.action === 'browse') openBrowser();
  });

  $('openBrowserBtn').addEventListener('click', openBrowser);
  $('checkFolderBtn').addEventListener('click', checkGitInfo);
  $('repoPathInput').addEventListener('change', checkGitInfo);

  $('llmProvider').addEventListener('change', onProviderChange);
  $('llmRefreshModels').addEventListener('click', refreshOpenCodeModels);
  $('testLLMBtn').addEventListener('click', testLLM);
  $('llmStartOpencode').addEventListener('click', startOpenCodeServer);
  $('llmStopOpencode').addEventListener('click', stopOpenCodeServer);
  $('useAIInput').addEventListener('change', saveLLMConfig);

  $('runBtn').addEventListener('click', runReview);
  $('copyAllBtn').addEventListener('click', copyAllIssues);
  const lfInput = $('largeFileLinesInput');
  if (lfInput) lfInput.addEventListener('change', persistReviewSettings);
  const skipCssInput = $('largeFileSkipCssInput');
  if (skipCssInput) skipCssInput.addEventListener('change', persistReviewSettings);
  const standardsInput = $('customStandardsInput');
  if (standardsInput) {
    standardsInput.addEventListener('input', updateStandardsCounter);
    standardsInput.addEventListener('change', persistReviewSettings);
    standardsInput.addEventListener('blur', () => {
      standardsInput.value = sanitizeCustomStandards(standardsInput.value);
      persistReviewSettings();
    });
  }
  const exportStandardsBtn = $('exportStandardsBtn');
  if (exportStandardsBtn) exportStandardsBtn.addEventListener('click', exportReviewStandards);
  const importStandardsBtn = $('importStandardsBtn');
  if (importStandardsBtn) importStandardsBtn.addEventListener('click', triggerImportReviewStandards);
  const importStandardsFile = $('importStandardsFile');
  if (importStandardsFile) importStandardsFile.addEventListener('change', importReviewStandardsFile);
  const basePromptInput = $('basePromptInput');
  if (basePromptInput) {
    basePromptInput.addEventListener('input', updateBasePromptCounter);
    basePromptInput.addEventListener('change', persistReviewSettings);
    basePromptInput.addEventListener('blur', () => {
      basePromptInput.value = sanitizeBasePrompt(basePromptInput.value) || getDefaultBasePrompt(getUiLang());
      persistReviewSettings();
    });
  }
  const resetBasePromptBtn = $('resetBasePromptBtn');
  if (resetBasePromptBtn) resetBasePromptBtn.addEventListener('click', resetBasePrompt);
  const themeBtn = $('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = getActiveTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      saveUIConfig({ theme: next });
    });
  }
  const langBtn = $('langToggleBtn');
  if (langBtn) {
    langBtn.addEventListener('click', async () => {
      persistReviewSettings();
      const next = (document.documentElement.getAttribute('lang') || 'pl') === 'pl' ? 'en' : 'pl';
      document.documentElement.setAttribute('lang', next);
      langBtn.textContent = next === 'en' ? 'EN' : 'PL';
      langBtn.setAttribute('aria-pressed', next === 'en' ? 'true' : 'false');
      saveUIConfig({ lang: next });
      await applyLocale();
    });
  }
  $('resultsSection').addEventListener('click', (e) => {
    const dismiss = e.target.closest('.' + dismissBtn);
    if (dismiss) {
      dismissIssue(dismiss.dataset.category, Number(dismiss.dataset.index));
      return;
    }
    const clear = e.target.closest('[data-clear-category]');
    if (clear) {
      clearCategory(clear.dataset.clearCategory);
      return;
    }
    if (e.target.closest('#restoreIssuesBtn')) {
      restoreIssues();
      return;
    }
    const copy = e.target.closest('.' + copyFixBtn);
    if (copy) copyFix(copy, copy.dataset.fix);
  });

  $('browserCloseBtn').addEventListener('click', closeBrowser);
  $('browseGoBtn').addEventListener('click', browseToInput);
  $('browseUseBtn').addEventListener('click', useBrowsedPath);
  $('browseAddBtn').addEventListener('click', addShortcutFromBrowser);
  $('browserModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBrowser();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBrowser();
  });
}

function getActiveTheme() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  const themeBtn = $('themeToggleBtn');
  if (themeBtn) {
    const label = next === 'dark'
      ? (state.i18n?.nav?.themeLight || 'Tryb jasny')
      : (state.i18n?.nav?.themeDark || 'Tryb ciemny');
    themeBtn.textContent = label;
    themeBtn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
  }
}

async function applyLocale() {
  const ui = loadUIConfig();
  const lang = ui.lang === 'en' ? 'en' : 'pl';
  const dict = await loadLocale(lang);
  state.i18n = dict;
  applyTranslations(dict);
  updateA11yLabels(dict);
  applyTheme(getActiveTheme());
  syncProviderUi();
  renderPresets();
  updateReportTitles();
  loadBasePromptIntoEditor(ui, lang);
  if (state.lastReport) {
    const detected = state.lastReport.detected || { languages: [], frameworks: [] };
    const languages = detected.languages.join(', ') || t('report.stackUnknown');
    const frameworks = detected.frameworks.length
      ? t('report.stackFrameworks', { list: detected.frameworks.join(', ') })
      : '';
    const aiInfo = $('aiInfo');
    if (aiInfo) {
      aiInfo.textContent = t('report.stack', { languages, frameworks }) + (state.lastReport.aiInfoText || '');
    }
    renderReport();
  }
  if ($('repoPathInput')?.value.trim()) checkGitInfo();
}

async function init() {
  state.repoInput = $('repoPathInput');
  state.projects = loadProjectsLocal();
  wireEvents();
  initA11y();

  const ui = loadUIConfig();
  applyReviewSettings(ui);
  const initialTheme = ui.theme === 'dark' || ui.theme === 'light'
    ? ui.theme
    : getActiveTheme();
  applyTheme(initialTheme);
  if (ui.lang === 'en') {
    document.documentElement.setAttribute('lang', 'en');
    const lb = $('langToggleBtn');
    if (lb) { lb.textContent = 'EN'; lb.setAttribute('aria-pressed', 'true'); }
  } else {
    document.documentElement.setAttribute('lang', 'pl');
    const lb = $('langToggleBtn');
    if (lb) { lb.textContent = 'PL'; lb.setAttribute('aria-pressed', 'false'); }
  }

  await applyLocale();
  await hydrateReviewSettings();
  applyLLMConfig();

  if (state.projects.length) {
    state.repoInput.value = state.projects[0].path;
    markActivePreset();
  }
  checkGitInfo();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

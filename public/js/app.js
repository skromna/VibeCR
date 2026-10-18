import { $ } from './dom.js';
import { state } from './state.js';
import { loadProjectsLocal, saveLLMConfig, LLM_PRESETS, loadUIConfig, saveUIConfig } from './storage.js';
import { buildReviewPrompt, extractJSON, normalizeAIResult } from './prompt.js';
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

function getUiLang() {
  const ui = loadUIConfig();
  if (ui.lang === 'en' || ui.lang === 'pl') return ui.lang;
  return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'pl';
}

async function fetchAIIssues(repoPath, scope, compareBranch, includeTests, lang) {
  const res = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, scope, compareBranch, includeTests, lang })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);

  if (!data.files.length) return { ai: { critical: [], framework: [], runtime: [], quality: [] }, sentFiles: 0, truncated: false };

  const config = saveLLMConfig();
  const prompt = buildReviewPrompt(data.files, lang);
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
    const largeFileLinesInput = $('largeFileLinesInput');
    const largeFileLines = largeFileLinesInput && largeFileLinesInput.value
      ? Number(largeFileLinesInput.value)
      : undefined;
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath, scope, compareBranch, includeTests, largeFileLines, lang })
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
          const aiData = await fetchAIIssues(repoPath, scope, compareBranch, includeTests, lang);
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
  if (lfInput) {
    lfInput.addEventListener('change', () => {
      const v = Number(lfInput.value);
      if (Number.isFinite(v) && v > 0) saveUIConfig({ largeFileLines: Math.min(2000, Math.floor(v)) });
      else saveUIConfig({ largeFileLines: undefined });
    });
  }
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
  const lf = $('largeFileLinesInput');
  if (lf && typeof ui.largeFileLines !== 'undefined') {
    lf.value = String(ui.largeFileLines);
  }
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

import { $, escapeHtml } from './dom.js';
import { state } from './state.js';
import { t } from './i18n.js';

export const copyFixBtn = 'copy-fix-btn';
export const dismissBtn = 'dismiss-issue-btn';

const CATEGORIES = {
  critical: { list: 'listCritical', count: 'countCritical' },
  framework: { list: 'listFramework', count: 'countFramework' },
  runtime: { list: 'listRuntime', count: 'countRuntime' },
  quality: { list: 'listQuality', count: 'countQuality' }
};

export function renderIssueCard(issue, category, index) {
  const sourceBadge = issue.source === 'ai'
    ? '<span class="source-badge source-ai">AI</span>'
    : `<span class="source-badge source-heur">${escapeHtml(t('report.heuristic'))}</span>`;
  return `
    <div class="issue-card">
      <div class="flex flex-wrap items-center justify-between gap-s10">
        <div>
          <h3 class="issue-title">${escapeHtml(issue.title)}${sourceBadge}</h3>
          <p class="issue-file">${escapeHtml(issue.file)}</p>
        </div>
        <div class="flex gap-s5" style="flex: 0 0 auto;">
          <button data-fix="${escapeHtml(issue.fix || '')}" class="btn btn-subtle ${copyFixBtn}" title="${escapeHtml(t('report.copyFixTitle'))}">
            ${escapeHtml(t('report.copyFix'))}
          </button>
          <button data-category="${category}" data-index="${index}" class="btn btn-subtle ${dismissBtn}" title="${escapeHtml(t('report.removeTitle'))}">
            ${escapeHtml(t('report.remove'))}
          </button>
        </div>
      </div>
      <p class="issue-desc">${escapeHtml(issue.description)}</p>
      <pre class="issue-fix"><code>${escapeHtml(issue.fix || '')}</code></pre>
    </div>
  `;
}

export function renderCategory(category) {
  const meta = CATEGORIES[category];
  if (!meta) return;
  const issues = state.lastReport ? state.lastReport[category] : [];
  $(meta.count).textContent = issues.length;
  const emptyMsg = t('report.empty');
  $(meta.list).innerHTML = issues.length
    ? issues.map((issue, i) => renderIssueCard(issue, category, i)).join('')
    : '<p class="empty-msg">' + escapeHtml(emptyMsg) + '</p>';
  updateReportControls();
}

export function renderReport() {
  Object.keys(CATEGORIES).forEach(renderCategory);
}

export function updateReportTitles() {
  if (!state.lastReport) {
    const critical = $('titleCritical');
    const framework = $('titleFramework');
    const runtime = $('titleRuntime');
    const quality = $('titleQuality');
    if (critical) critical.textContent = t('report.critical');
    if (framework) framework.textContent = t('report.framework');
    if (runtime) runtime.textContent = t('report.runtime');
    if (quality) quality.textContent = t('report.quality');
    return;
  }
  const detected = state.lastReport.detected || { languages: [], frameworks: [] };
  const fwLabel = detected.frameworks.length ? ` (${detected.frameworks.join(', ')})` : '';
  const rtLabel = detected.languages.length ? ` (${detected.languages.join(', ')})` : '';
  $('titleCritical').textContent = t('report.critical');
  $('titleFramework').textContent = t('report.framework') + fwLabel;
  $('titleRuntime').textContent = t('report.runtime') + rtLabel;
  $('titleQuality').textContent = t('report.quality');
}

function removedCount() {
  if (!state.reportBackup || !state.lastReport) return 0;
  return Object.keys(CATEGORIES).reduce((total, cat) => {
    const before = state.reportBackup[cat] ? state.reportBackup[cat].length : 0;
    const now = state.lastReport[cat] ? state.lastReport[cat].length : 0;
    return total + Math.max(0, before - now);
  }, 0);
}

function updateReportControls() {
  document.querySelectorAll('[data-clear-category]').forEach((btn) => {
    const list = state.lastReport ? state.lastReport[btn.dataset.clearCategory] : null;
    btn.disabled = !list || list.length === 0;
  });
  const restore = $('restoreIssuesBtn');
  if (restore) restore.disabled = removedCount() === 0;
}

export function dismissIssue(category, index) {
  if (!state.lastReport || !Array.isArray(state.lastReport[category])) return;
  if (index < 0 || index >= state.lastReport[category].length) return;
  state.lastReport[category].splice(index, 1);
  renderCategory(category);
}

export function clearCategory(category) {
  if (!state.lastReport || !Array.isArray(state.lastReport[category])) return;
  state.lastReport[category] = [];
  renderCategory(category);
}

export function restoreIssues() {
  if (!state.lastReport || !state.reportBackup) return;
  Object.keys(CATEGORIES).forEach((cat) => {
    state.lastReport[cat] = (state.reportBackup[cat] || []).slice();
    renderCategory(cat);
  });
}

export function mergeIssues(heuristic, ai) {
  const seen = new Set(heuristic.map((i) => `${i.file}|${i.title}`.toLowerCase()));
  const merged = [...heuristic.map((i) => ({ ...i, source: 'heur' }))];
  for (const issue of ai) {
    const key = `${issue.file}|${issue.title}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(issue);
    }
  }
  return merged;
}

export function copyFix(btn, fix) {
  navigator.clipboard.writeText(fix || '');
  const original = btn.textContent;
  btn.textContent = t('report.copied');
  setTimeout(() => { btn.textContent = original; }, 1800);
}

export function formatSection(title, issues, startIndex) {
  if (!issues.length) return null;
  const lines = [`## ${title} (${issues.length})`];
  issues.forEach((issue, i) => {
    lines.push(`${startIndex + i}. ${issue.title}${issue.source === 'ai' ? ' [AI]' : ''}`);
    lines.push(`   ${t('report.copyFile', { file: issue.file })}`);
    lines.push(`   ${t('report.copyDesc', { desc: issue.description })}`);
    lines.push(`   ${t('report.copyFixLabel')}`);
    String(issue.fix || '').split('\n').forEach((line) => lines.push(`   | ${line}`));
    lines.push('');
  });
  return lines.join('\n');
}

export async function copyAllIssues() {
  if (!state.lastReport) {
    alert(t('alerts.runFirst'));
    return;
  }

  const det = state.lastReport.detected || { languages: [], frameworks: [] };
  const languages = det.languages.join(', ') || t('report.stackUnknown');
  const frameworks = det.frameworks.length ? t('report.stackFrameworks', { list: det.frameworks.join(', ') }) : '';
  const stack = languages + frameworks;
  const header = [
    t('report.copyHeader'),
    t('report.copyProject', { path: $('repoPathInput').value.trim() }),
    t('report.copyBranch', { branch: state.lastReport.branch }),
    t('report.copyStack', { stack }),
    t('report.copyScanned', { count: state.lastReport.scannedFilesCount }),
    t('report.copyCounts', {
      critical: state.lastReport.critical.length,
      framework: state.lastReport.framework.length,
      runtime: state.lastReport.runtime.length,
      quality: state.lastReport.quality.length
    }),
    ''
  ].join('\n');

  const sections = [
    formatSection(t('report.critical'), state.lastReport.critical, 1),
    formatSection(t('report.framework'), state.lastReport.framework, state.lastReport.critical.length + 1),
    formatSection(t('report.runtime'), state.lastReport.runtime, state.lastReport.critical.length + state.lastReport.framework.length + 1),
    formatSection(t('report.quality'), state.lastReport.quality, state.lastReport.critical.length + state.lastReport.framework.length + state.lastReport.runtime.length + 1)
  ].filter(Boolean);

  const total = state.lastReport.critical.length + state.lastReport.framework.length + state.lastReport.runtime.length + state.lastReport.quality.length;
  const text = total ? header + '\n' + sections.join('\n') : header + '\n' + t('report.noIssues');
  await navigator.clipboard.writeText(text);
  const btn = $('copyAllBtn');
  const original = btn.textContent;
  btn.textContent = t('report.copied');
  setTimeout(() => { btn.textContent = original; }, 1800);
}

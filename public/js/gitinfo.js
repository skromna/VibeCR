import { $ } from './dom.js';
import { t } from './i18n.js';

export async function checkGitInfo() {
  const repoPath = $('repoPathInput').value.trim();
  const statusText = $('gitStatusText');
  const badge = $('branchBadge');
  const branchName = $('branchName');

  if (!repoPath) return;

  try {
    const res = await fetch('/api/git-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    const diffRadio = document.querySelector('input[name="scope"][value="diff"]');
    const allRadio = document.querySelector('input[name="scope"][value="all"]');

    if (!data.isRepo) {
      badge.style.display = 'none';
      if (diffRadio) { diffRadio.disabled = true; diffRadio.checked = false; }
      if (allRadio) allRadio.checked = true;
      statusText.className = 'field-hint';
      statusText.textContent = t('git.notRepo');
      return;
    }

    if (diffRadio) diffRadio.disabled = false;
    badge.style.display = 'inline-flex';
    const branch = data.currentBranch || t('report.branchNoCommits');
    branchName.textContent = branch;
    statusText.className = 'status-ok';
    statusText.textContent = t('git.connected', { branch, count: data.modifiedCount });
  } catch (err) {
    badge.style.display = 'none';
    statusText.className = 'status-err';
    statusText.textContent = err.message;
  }
}

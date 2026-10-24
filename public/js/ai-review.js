import { saveLLMConfig } from './storage.js';
import { buildReviewPrompt, extractJSON, normalizeAIResult } from './prompt.js';
import { callLLM } from './providers.js';

export async function mapCfFindings(findings, lang) {
  const res = await fetch('/api/security-audit/map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ findings, lang })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'map failed');
  return data;
}

export async function fetchAIIssues(repoPath, scope, compareBranch, includeTests, lang, reviewOpts, securityMode) {
  let files;
  let truncated = false;
  let securityPromptExtras = '';

  if (securityMode) {
    const res = await fetch('/api/security-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath, scope, compareBranch, includeTests, lang })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    files = data.files || [];
    truncated = !!data.truncated;
    securityPromptExtras = data.securityPromptExtras || '';
  } else {
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath, scope, compareBranch, includeTests, lang })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    files = data.files || [];
    truncated = !!data.truncated;
  }

  if (!files.length) {
    return {
      ai: { critical: [], framework: [], runtime: [], quality: [] },
      sentFiles: 0,
      truncated: false,
      securityMeta: null
    };
  }

  const config = saveLLMConfig();
  const prompt = buildReviewPrompt(files, lang, {
    ...reviewOpts,
    securityPromptExtras
  });
  const reply = await callLLM(config, prompt);
  const parsed = extractJSON(reply);

  if (Array.isArray(parsed)) {
    const mapped = await mapCfFindings(parsed, lang);
    return {
      ai: mapped.report,
      sentFiles: files.length,
      truncated,
      securityMeta: {
        soft: !!mapped.soft,
        meta: mapped.meta,
        validation: mapped.validation
      }
    };
  }

  return {
    ai: normalizeAIResult(parsed),
    sentFiles: files.length,
    truncated,
    securityMeta: null
  };
}

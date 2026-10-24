const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { collectFiles, isGitRepo } = require('../lib/git');
const { detectStack } = require('../lib/stack');
const {
  validateFindings,
  validateCoverageLedger,
  mapFindingsToReport,
  softMapFindings,
  buildSecurityPromptExtras
} = require('../lib/cfSecurity');
const { asyncHandler, httpError } = require('../lib/asyncHandler');

const router = express.Router();

function resolveFindingsPayload(body) {
  if (!body || typeof body !== 'object') return null;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.findings)) return body.findings;
  if (body.settings && Array.isArray(body.settings.findings)) return body.settings.findings;
  return null;
}

function resolveLedgerPayload(body) {
  if (!body || typeof body !== 'object') return null;
  if (Array.isArray(body.coverageLedger)) return body.coverageLedger;
  if (Array.isArray(body.ledger)) return body.ledger;
  return null;
}

router.post('/security-audit/validate', (req, res) => {
  const findings = resolveFindingsPayload(req.body);
  const ledger = resolveLedgerPayload(req.body);
  if (!findings && !ledger) {
    return res.status(400).json({ error: 'Provide findings array and/or coverageLedger' });
  }
  const out = {};
  if (findings) out.findings = validateFindings(findings);
  if (ledger) out.coverageLedger = validateCoverageLedger(ledger);
  const ok = (!findings || out.findings.ok) && (!ledger || out.coverageLedger.ok);
  res.status(ok ? 200 : 422).json({ ok, ...out });
});

router.post('/security-audit/import', (req, res) => {
  const lang = req.body && req.body.lang === 'en' ? 'en' : 'pl';
  const findings = resolveFindingsPayload(req.body);
  if (!findings) {
    return res.status(400).json({
      error: lang === 'en'
        ? 'Invalid findings payload (expected JSON array).'
        : 'Nieprawidłowy payload findings (oczekiwana tablica JSON).'
    });
  }

  const validation = validateFindings(findings);
  const mapped = mapFindingsToReport(findings, lang);
  const ledger = resolveLedgerPayload(req.body);
  let ledgerValidation = null;
  if (ledger) ledgerValidation = validateCoverageLedger(ledger);

  res.status(validation.ok ? 200 : 422).json({
    ok: validation.ok,
    validation,
    ledgerValidation,
    report: mapped.report,
    meta: mapped.meta
  });
});

router.post('/security-audit/map', (req, res) => {
  const lang = req.body && req.body.lang === 'en' ? 'en' : 'pl';
  const findings = resolveFindingsPayload(req.body);
  if (!findings) {
    return res.status(400).json({ error: 'Invalid findings payload' });
  }
  const result = softMapFindings(findings, lang);
  res.json({
    ok: true,
    soft: result.soft,
    validation: result.validation,
    report: result.report,
    meta: result.meta
  });
});

router.post('/security-audit', asyncHandler(async (req, res) => {
  const {
    repoPath,
    scope,
    compareBranch,
    includeTests,
    lang: rawLang,
    findings: bodyFindings
  } = req.body || {};
  const lang = rawLang === 'en' ? 'en' : 'pl';

  if (bodyFindings) {
    const findings = resolveFindingsPayload({ findings: bodyFindings });
    if (!findings) {
      throw httpError(400, 'Invalid findings payload');
    }
    const result = softMapFindings(findings, lang);
    return res.json({
      ok: true,
      mode: 'map',
      soft: result.soft,
      validation: result.validation,
      report: result.report,
      meta: result.meta
    });
  }

  if (!repoPath || !fs.existsSync(repoPath)) {
    throw httpError(400, lang === 'en' ? 'Invalid local path.' : 'Nieprawidłowa ścieżka lokalna.');
  }

  try {
    const filesToAnalyze = await collectFiles(repoPath, scope, compareBranch, includeTests, lang);
    const detected = detectStack(filesToAnalyze);
    const promptPack = buildSecurityPromptExtras(detected, lang);

    const MAX_FILES = 40;
    const MAX_CHARS = 15000;
    const unread = lang === 'en' ? '/* unreadable file — skipped */' : '/* nieczytelny plik — pominięto */';
    const trunc = lang === 'en' ? '\n/* ... truncated */' : '\n/* ... skrócone */';
    const slice = filesToAnalyze.slice(0, MAX_FILES);
    const files = await Promise.all(slice.map(async (filePath) => {
      let content;
      try {
        content = await fsp.readFile(filePath, 'utf-8');
      } catch {
        content = unread;
      }
      return {
        path: path.relative(repoPath, filePath).split(path.sep).join('/'),
        content: content.length > MAX_CHARS
          ? `${content.slice(0, MAX_CHARS)}${trunc}`
          : content
      };
    }));

    res.json({
      ok: true,
      mode: 'prepare',
      isRepo: isGitRepo(repoPath),
      detected,
      files,
      totalFiles: filesToAnalyze.length,
      truncated: filesToAnalyze.length > MAX_FILES,
      securityPromptExtras: promptPack.extras,
      attackDocs: promptPack.docs
    });
  } catch (err) {
    if (err.expose) throw err;
    throw httpError(
      err.statusCode || 500,
      `${lang === 'en' ? 'Security audit error: ' : 'Błąd audytu bezpieczeństwa: '}${err.message}`
    );
  }
}));

module.exports = router;

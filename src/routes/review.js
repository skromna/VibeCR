const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { runGit, isGitRepo, collectFiles } = require('../lib/git');
const { analyzeFileContent } = require('../lib/analysis');
const { detectStack } = require('../lib/stack');
const { normalizeReviewOptions } = require('../lib/standards');
const { asyncHandler, httpError } = require('../lib/asyncHandler');

const router = express.Router();

router.post('/git-info', (req, res) => {
  const { repoPath } = req.body;
  const lang = req.body && req.body.lang === 'en' ? 'en' : 'pl';
  if (!repoPath || !fs.existsSync(repoPath)) {
    return res.status(400).json({
      error: lang === 'en' ? 'The given path does not exist on disk.' : 'Podana ścieżka nie istnieje na dysku.'
    });
  }

  if (!isGitRepo(repoPath)) {
    return res.json({ isRepo: false, currentBranch: null, modifiedCount: 0 });
  }

  try {
    const currentBranch = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const statusOutput = runGit(repoPath, ['status', '--short']);
    const modifiedCount = statusOutput ? statusOutput.split('\n').length : 0;

    res.json({ isRepo: true, currentBranch, modifiedCount });
  } catch {
    res.json({ isRepo: true, currentBranch: null, modifiedCount: 0 });
  }
});

router.post('/review', asyncHandler(async (req, res) => {
  const { repoPath, scope, compareBranch, includeTests } = req.body;
  const reviewOpts = normalizeReviewOptions(req.body);
  const uiLang = reviewOpts.lang;

  if (!repoPath || !fs.existsSync(repoPath)) {
    throw httpError(400, uiLang === 'en' ? 'Invalid local path.' : 'Nieprawidłowa ścieżka lokalna.');
  }

  try {
    const isRepo = isGitRepo(repoPath);
    let currentBranch = null;
    if (isRepo) {
      try {
        currentBranch = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      } catch {
        currentBranch = null;
      }
    }
    const filesToAnalyze = await collectFiles(repoPath, scope, compareBranch, includeTests, uiLang);

    const report = {
      isRepo,
      branch: currentBranch,
      scannedFilesCount: filesToAnalyze.length,
      detected: detectStack(filesToAnalyze),
      critical: [],
      framework: [],
      runtime: [],
      quality: []
    };

    for (const filePath of filesToAnalyze) {
      let content;
      try {
        content = await fsp.readFile(filePath, 'utf-8');
      } catch {
        continue;
      }
      const fileIssues = analyzeFileContent(filePath, content, {
        largeFileLines: reviewOpts.largeFileLines,
        largeFileSkipCss: reviewOpts.largeFileSkipCss,
        lang: uiLang
      });
      report.critical.push(...fileIssues.critical);
      report.framework.push(...fileIssues.framework);
      report.runtime.push(...fileIssues.runtime);
      report.quality.push(...fileIssues.quality);
    }

    res.json(report);
  } catch (err) {
    if (err.expose) throw err;
    const prefix = uiLang === 'en' ? 'Analysis error: ' : 'Błąd podczas analizy: ';
    throw httpError(err.statusCode || 500, `${prefix}${err.message}`);
  }
}));

router.post('/files', asyncHandler(async (req, res) => {
  const { repoPath, scope, compareBranch, includeTests } = req.body;
  const reviewOpts = normalizeReviewOptions(req.body);
  const uiLang = reviewOpts.lang;

  if (!repoPath || !fs.existsSync(repoPath)) {
    throw httpError(400, uiLang === 'en' ? 'Invalid local path.' : 'Nieprawidłowa ścieżka lokalna.');
  }

  try {
    const filesToAnalyze = await collectFiles(repoPath, scope, compareBranch, includeTests, uiLang);

    const MAX_FILES = 40;
    const MAX_CHARS = 15000;
    const unread = uiLang === 'en' ? '/* unreadable file — skipped */' : '/* nieczytelny plik — pominięto */';
    const truncatedMark = uiLang === 'en' ? '\n/* ... truncated */' : '\n/* ... skrócone */';

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
        content: content.length > MAX_CHARS ? content.slice(0, MAX_CHARS) + truncatedMark : content
      };
    }));

    res.json({ files, totalFiles: filesToAnalyze.length, truncated: filesToAnalyze.length > MAX_FILES });
  } catch (err) {
    if (err.expose) throw err;
    const prefix = uiLang === 'en' ? 'Error collecting files: ' : 'Błąd podczas zbierania plików: ';
    throw httpError(err.statusCode || 500, `${prefix}${err.message}`);
  }
}));

module.exports = router;

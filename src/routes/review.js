const express = require('express');
const fs = require('fs');
const path = require('path');
const { runGit, isGitRepo, collectFiles } = require('../lib/git');
const { analyzeFileContent } = require('../lib/analysis');
const { detectStack } = require('../lib/stack');
const { normalizeReviewOptions } = require('../lib/standards');

const router = express.Router();

// Wykrywanie aktualnego brancha i liczby zmian po wklejeniu ścieżki.
// Działa również dla folderów bez Git (zwraca isRepo: false).
router.post('/git-info', (req, res) => {
  const { repoPath } = req.body;
  if (!repoPath || !fs.existsSync(repoPath)) {
    return res.status(400).json({ error: 'Podana ścieżka nie istnieje na dysku.' });
  }

  if (!isGitRepo(repoPath)) {
    return res.json({ isRepo: false, currentBranch: null, modifiedCount: 0 });
  }

  try {
    const currentBranch = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const statusOutput = runGit(repoPath, ['status', '--short']);
    const modifiedCount = statusOutput ? statusOutput.split('\n').length : 0;

    res.json({ isRepo: true, currentBranch, modifiedCount });
  } catch (err) {
    // Folder jest repo, ale np. bez commitów (HEAD nie istnieje) — nadal można skanować
    res.json({ isRepo: true, currentBranch: null, modifiedCount: 0 });
  }
});

// Główne skanowanie heurystyczne (git diff lub cała aplikacja)
router.post('/review', (req, res) => {
  const { repoPath, scope, compareBranch, includeTests } = req.body;
  const reviewOpts = normalizeReviewOptions(req.body);
  const uiLang = reviewOpts.lang;

  if (!repoPath || !fs.existsSync(repoPath)) {
    return res.status(400).json({ error: uiLang === 'en' ? 'Invalid local path.' : 'Nieprawidłowa ścieżka lokalna.' });
  }

  try {
    const isRepo = isGitRepo(repoPath);
    let currentBranch = null;
    if (isRepo) {
      try {
        currentBranch = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      } catch (e) {
        currentBranch = null;
      }
    }
    const filesToAnalyze = collectFiles(repoPath, scope, compareBranch, includeTests);

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

    filesToAnalyze.forEach((filePath) => {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        return;
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
    });

    res.json(report);
  } catch (err) {
    const prefix = uiLang === 'en' ? 'Analysis error: ' : 'Błąd podczas analizy: ';
    res.status(err.statusCode || 500).json({ error: `${prefix}${err.message}` });
  }
});

// Zawartość plików do analizy AI (limit: 40 plików x 15 000 znaków).
// Treść trafia tylko do przeglądarki, która wysyła ją DIREKTNIE do wybranego
// dostawcy AI — klucz API i kod nigdy nie przechodzą przez ten serwer.
router.post('/files', (req, res) => {
  const { repoPath, scope, compareBranch, includeTests } = req.body;

  if (!repoPath || !fs.existsSync(repoPath)) {
    return res.status(400).json({ error: 'Nieprawidłowa ścieżka lokalna.' });
  }

  try {
    const filesToAnalyze = collectFiles(repoPath, scope, compareBranch, includeTests);

    const MAX_FILES = 40;
    const MAX_CHARS = 15000;

    const files = filesToAnalyze.slice(0, MAX_FILES).map((filePath) => {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        content = '/* nieczytelny plik — pominięto */';
      }
      return {
        path: path.relative(repoPath, filePath).split(path.sep).join('/'),
        content: content.length > MAX_CHARS ? content.slice(0, MAX_CHARS) + '\n/* ... skrócone */' : content
      };
    });

    res.json({ files, totalFiles: filesToAnalyze.length, truncated: filesToAnalyze.length > MAX_FILES });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: `Błąd podczas zbierania plików: ${err.message}` });
  }
});

module.exports = router;

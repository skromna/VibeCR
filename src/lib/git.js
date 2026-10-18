const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getProjectFiles, isAnalyzableFile, isTestFile } = require('./scanner');

// Bezpieczne wywoływanie Gita: bez powłoki systemowej (brak podatności na command injection)
function runGit(repoPath, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    }).trim();
  } catch (err) {
    throw new Error(err.stderr || err.message);
  }
}

// Walidacja nazwy brancha / revision przed użyciem w argumentach Gita
function isValidGitRef(ref) {
  return typeof ref === 'string' && ref.length <= 255 && /^[A-Za-z0-9._\-/]+$/.test(ref) && !ref.includes('..');
}

// Sprawdzenie, czy plik z diff-a na pewno leży wewnątrz repozytorium (ochrona przed ../)
function isInsideRepo(repoPath, fullPath) {
  const root = path.resolve(repoPath);
  const resolved = path.resolve(fullPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

// Sprawdzenie, czy folder jest repozytorium Git (pozwala analizować też zwykłe foldery)
function isGitRepo(repoPath) {
  try {
    return runGit(repoPath, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch (e) {
    return false;
  }
}

// Zbieranie listy plików do analizy (wspólne dla /api/review i /api/files).
// Folder bez Git → zawsze skanujemy całość (diff nie ma sensu).
function collectFiles(repoPath, scope, compareBranch, includeTests) {
  let filesToAnalyze = [];

  if (scope === 'diff' && isGitRepo(repoPath)) {
    let target = 'HEAD';
    if (compareBranch && compareBranch.trim() !== '') {
      target = compareBranch.trim();
      if (!isValidGitRef(target)) {
        const err = new Error('Nieprawidłowa nazwa brancha (dozwolone: litery, cyfry, . _ - / ).');
        err.statusCode = 400;
        throw err;
      }
    }

    try {
      // --relative zwraca ścieżki względem repoPath (ważne, gdy folder jest podkatalogiem repo)
      const diffFilesRaw = runGit(repoPath, ['diff', '--name-only', '--relative', target]);
      const untrackedRaw = runGit(repoPath, ['ls-files', '--others', '--exclude-standard']);

      const combined = new Set([
        ...diffFilesRaw.split('\n').filter(Boolean),
        ...untrackedRaw.split('\n').filter(Boolean)
      ]);

      filesToAnalyze = Array.from(combined)
        .map((relPath) => path.resolve(repoPath, relPath))
        .filter((fullPath) =>
          isInsideRepo(repoPath, fullPath) &&
          fs.existsSync(fullPath) &&
          isAnalyzableFile(fullPath)
        );
    } catch (e) {
      // np. repo bez commitów (brak HEAD) albo problem z Git — analizujemy cały folder
      filesToAnalyze = getProjectFiles(repoPath);
    }
  } else {
    filesToAnalyze = getProjectFiles(repoPath);
  }

  if (!includeTests) {
    filesToAnalyze = filesToAnalyze.filter((filePath) => !isTestFile(filePath));
  }

  return filesToAnalyze;
}

module.exports = {
  runGit,
  isValidGitRef,
  isInsideRepo,
  isGitRepo,
  collectFiles
};

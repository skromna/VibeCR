const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getProjectFiles, isAnalyzableFileSync, isTestFile } = require('./scanner');

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

function isValidGitRef(ref) {
  return typeof ref === 'string'
    && ref.length <= 255
    && /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(ref)
    && !ref.includes('..');
}

function isInsideRepo(repoPath, fullPath) {
  const root = path.resolve(repoPath);
  const resolved = path.resolve(fullPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function isGitRepo(repoPath) {
  try {
    return runGit(repoPath, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch {
    return false;
  }
}

async function collectFiles(repoPath, scope, compareBranch, includeTests, lang = 'pl') {
  let filesToAnalyze = [];
  const hasCompare = !!(compareBranch && String(compareBranch).trim());
  const en = lang === 'en';

  if (scope === 'diff' && isGitRepo(repoPath)) {
    let target = 'HEAD';
    if (hasCompare) {
      target = String(compareBranch).trim();
      if (!isValidGitRef(target)) {
        const err = new Error(en
          ? 'Invalid branch name (letters, digits, . _ - /; must not start with "-").'
          : 'Nieprawidłowa nazwa brancha (dozwolone: litery, cyfry, . _ - /; nie może zaczynać się od "-").');
        err.statusCode = 400;
        throw err;
      }
    }

    try {
      const diffFilesRaw = runGit(repoPath, ['diff', '--name-only', '--relative', '--no-ext-diff', target, '--']);
      const untrackedRaw = runGit(repoPath, ['ls-files', '--others', '--exclude-standard']);

      const combined = new Set([
        ...diffFilesRaw.split('\n').filter(Boolean),
        ...untrackedRaw.split('\n').filter(Boolean)
      ]);

      filesToAnalyze = Array.from(combined)
        .map((relPath) => path.resolve(repoPath, relPath))
        .filter((fullPath) => {
          if (!isInsideRepo(repoPath, fullPath) || !fs.existsSync(fullPath)) return false;
          try {
            if (fs.lstatSync(fullPath).isSymbolicLink()) return false;
          } catch {
            return false;
          }
          return isAnalyzableFileSync(fullPath);
        });
    } catch (e) {
      if (e && e.statusCode) throw e;
      if (hasCompare) {
        const err = new Error(en
          ? `Failed to get diff against "${target}": ${e.message}`
          : `Nie udało się pobrać diff względem „${target}”: ${e.message}`);
        err.statusCode = 400;
        throw err;
      }
      filesToAnalyze = await getProjectFiles(repoPath);
    }
  } else {
    filesToAnalyze = await getProjectFiles(repoPath);
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

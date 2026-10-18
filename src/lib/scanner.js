const fs = require('fs');
const path = require('path');

// Rozszerzenia plików źródłowych, które analizujemy (uniwersalnie: dowolny język/framework)
const SOURCE_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.py', '.rb', '.php', '.go', '.java', '.kt', '.kts', '.cs', '.rs',
  '.c', '.h', '.cpp', '.cc', '.hpp', '.swift', '.dart', '.scala', '.lua',
  '.pl', '.r', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
  '.yml', '.yaml', '.json', '.toml', '.ini', '.conf'
]);

// Pliki, które pomijamy mimo pasującego rozszerzenia (locki, zależności generowane)
const LOCK_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'composer.lock',
  'poetry.lock', 'cargo.lock', 'gemfile.lock', 'npm-shrinkwrap.json'
]);

// Górny limit rozmiaru pliku (chroni przed czytaniem binariów / wygenerowanych monolitów)
const MAX_FILE_SIZE = 400 * 1024;

// Domyślny próg linii dla reguły "duży plik" w analizie jakościowej
const DEFAULT_LARGE_FILE_LINES = 400;

// Katalogi pomijane podczas rekurencyjnego skanowania
const IGNORED_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.nuxt', '.svelte-kit', 'vendor', 'target', '__pycache__', '.venv', 'venv',
  'out', '.output', 'storybook-static', 'generated', 'gen', 'docs'
];

// Dodatkowe maski katalogów do pominięcia wg nazwy ścieżki (normalizacja /)
const IGNORED_PATH_FRAGMENTS = [
  '/dist/',
  '/build/',
  '/out/',
  '/generated/',
  '/gen/',
  '/coverage/',
  '/.next/',
  '/target/',
  '/vendor/',
  '/__pycache__/',
  '/.output/',
  '/storybook-static/'
];

function pathHasIgnoredFragment(p) {
  if (typeof p !== 'string') return false;
  const normalized = p.replace(/\\/g, '/').toLowerCase();
  return IGNORED_PATH_FRAGMENTS.some((f) => normalized.includes(f));
}

// Czy plik nadaje się do analizy (rozszerzenie + brak locków/minified + rozsądny rozmiar)
function isAnalyzableFile(fullPath) {
  const name = path.basename(fullPath).toLowerCase();
  if (LOCK_FILES.has(name)) return false;
  if (/\.min\.(js|css)$/.test(name)) return false;
  if (!SOURCE_EXTS.has(path.extname(fullPath).toLowerCase())) return false;
  try {
    if (pathHasIgnoredFragment(fullPath)) return false;
    return fs.statSync(fullPath).size <= MAX_FILE_SIZE;
  } catch (e) {
    return false;
  }
}

// Rekurencyjne skanowanie plików projektu (z pominięciem node_modules, .git, dist, build).
// Odporny na błędy: nieczytelne katalogi/pliki są pomijane zamiast przerywać analizę.
function getProjectFiles(dirPath, arrayOfFiles = []) {
  let files;
  try {
    files = fs.readdirSync(dirPath);
  } catch (e) {
    return arrayOfFiles; // brak uprawnień / usunięty katalog — pomijamy
  }

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      return; // np. zerwane dowiązanie symboliczne
    }
      if (stat.isDirectory()) {
        if (!IGNORED_DIRS.includes(file) && !pathHasIgnoredFragment(fullPath)) {
          getProjectFiles(fullPath, arrayOfFiles);
        }
      } else if (isAnalyzableFile(fullPath)) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

// Wykrywanie plików testowych (*.test.*, *.spec.*, katalogi testowe)
function isTestFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    /\.(test|spec)\.[jt]sx?$/.test(normalized) ||
    /\/(__tests__|tests|test|__mocks__|e2e|playwright|cypress)\//.test(normalized)
  );
}

module.exports = {
  SOURCE_EXTS,
  LOCK_FILES,
  MAX_FILE_SIZE,
  DEFAULT_LARGE_FILE_LINES,
  IGNORED_DIRS,
  IGNORED_PATH_FRAGMENTS,
  pathHasIgnoredFragment,
  isAnalyzableFile,
  getProjectFiles,
  isTestFile
};

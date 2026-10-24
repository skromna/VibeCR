const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const SOURCE_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.svelte',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.py', '.rb', '.php', '.go', '.java', '.kt', '.kts', '.cs', '.rs',
  '.c', '.h', '.cpp', '.cc', '.hpp', '.swift', '.dart', '.scala', '.lua',
  '.pl', '.r', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
  '.yml', '.yaml', '.json', '.toml', '.ini', '.conf'
]);

const LOCK_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'composer.lock',
  'poetry.lock', 'cargo.lock', 'gemfile.lock', 'npm-shrinkwrap.json'
]);

const MAX_FILE_SIZE = 400 * 1024;
const DEFAULT_LARGE_FILE_LINES = 400;

const IGNORED_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.nuxt', '.svelte-kit', 'vendor', 'target', '__pycache__', '.venv', 'venv',
  'out', '.output', 'storybook-static', 'generated', 'gen', 'docs'
];

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

async function isAnalyzableFile(fullPath) {
  const name = path.basename(fullPath).toLowerCase();
  if (LOCK_FILES.has(name)) return false;
  if (/\.min\.(js|css)$/.test(name)) return false;
  if (!SOURCE_EXTS.has(path.extname(fullPath).toLowerCase())) return false;
  try {
    if (pathHasIgnoredFragment(fullPath)) return false;
    const st = await fsp.lstat(fullPath);
    if (st.isSymbolicLink() || !st.isFile()) return false;
    return st.size <= MAX_FILE_SIZE;
  } catch {
    return false;
  }
}

function isAnalyzableFileSync(fullPath) {
  const name = path.basename(fullPath).toLowerCase();
  if (LOCK_FILES.has(name)) return false;
  if (/\.min\.(js|css)$/.test(name)) return false;
  if (!SOURCE_EXTS.has(path.extname(fullPath).toLowerCase())) return false;
  try {
    if (pathHasIgnoredFragment(fullPath)) return false;
    const st = fs.lstatSync(fullPath);
    if (st.isSymbolicLink() || !st.isFile()) return false;
    return st.size <= MAX_FILE_SIZE;
  } catch {
    return false;
  }
}

async function getProjectFiles(dirPath, arrayOfFiles = []) {
  let entries;
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return arrayOfFiles;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    let st;
    try {
      st = await fsp.lstat(fullPath);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (!IGNORED_DIRS.includes(entry.name) && !pathHasIgnoredFragment(fullPath)) {
        await getProjectFiles(fullPath, arrayOfFiles);
      }
    } else if (st.isFile() && await isAnalyzableFile(fullPath)) {
      arrayOfFiles.push(fullPath);
    }
  }

  return arrayOfFiles;
}

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
  isAnalyzableFileSync,
  getProjectFiles,
  isTestFile
};

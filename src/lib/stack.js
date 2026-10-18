const path = require('path');

// Rozszerzenie → język (etykieta dla UI)
const EXT_LANG = {
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.vue': 'JavaScript', '.svelte': 'JavaScript',
  '.html': 'HTML', '.htm': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.sass': 'SCSS', '.less': 'LESS',
  '.py': 'Python', '.rb': 'Ruby', '.php': 'PHP', '.go': 'Go', '.java': 'Java',
  '.kt': 'Kotlin', '.kts': 'Kotlin', '.cs': 'C#', '.rs': 'Rust',
  '.c': 'C', '.h': 'C/C++', '.cpp': 'C++', '.cc': 'C++', '.hpp': 'C++',
  '.swift': 'Swift', '.dart': 'Dart', '.scala': 'Scala', '.lua': 'Lua',
  '.pl': 'Perl', '.r': 'R', '.sql': 'SQL',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell', '.ps1': 'PowerShell', '.bat': 'Batch', '.cmd': 'Batch',
  '.yml': 'YAML', '.yaml': 'YAML', '.json': 'JSON', '.toml': 'TOML', '.ini': 'INI', '.conf': 'Config'
};

// Plik manifestu → środowisko/runtime (etykieta dla UI)
const MANIFEST_RUNTIME = {
  'package.json': 'Node.js', 'tsconfig.json': 'Node.js',
  'pom.xml': 'Java', 'build.gradle': 'Java', 'build.gradle.kts': 'Java',
  'requirements.txt': 'Python', 'pyproject.toml': 'Python', 'pipfile': 'Python', 'manage.py': 'Python (Django)',
  'go.mod': 'Go', 'composer.json': 'PHP', 'cargo.toml': 'Rust', 'gemfile': 'Ruby'
};

// Wykrywanie stosu technologicznego na podstawie zebranych plików (przezroczystość CR)
function detectStack(files) {
  const languages = new Set();
  const frameworks = new Set();

  for (const filePath of files) {
    const name = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();

    if (EXT_LANG[ext]) languages.add(EXT_LANG[ext]);
    if (ext === '.tsx' || ext === '.jsx') frameworks.add('React');
    if (ext === '.vue') frameworks.add('Vue');
    if (ext === '.svelte') frameworks.add('Svelte');
    if (name === 'angular.json') frameworks.add('Angular');
    if (name === 'next.config.js' || name === 'next.config.mjs' || name === 'next.config.ts') frameworks.add('Next.js');

    if (MANIFEST_RUNTIME[name]) languages.add(MANIFEST_RUNTIME[name]);
    if (/\.csproj$/.test(name) || /\.sln$/.test(name)) languages.add('.NET');
  }

  // Node.js jeśli w ogóle mamy pliki JS/TS (front lub back)
  if (languages.has('JavaScript') || languages.has('TypeScript')) languages.add('Node.js');

  return { languages: Array.from(languages), frameworks: Array.from(frameworks) };
}

module.exports = { EXT_LANG, MANIFEST_RUNTIME, detectStack };

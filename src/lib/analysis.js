const path = require('path');
const { DEFAULT_LARGE_FILE_LINES } = require('./scanner');

function stripCommentsAndLiterals(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\\\n])+\/[gimsuy]*/g, '/re/');
}

function getLargeFileThreshold(opts) {
  const t = opts && opts.largeFileLines;
  if (typeof t === 'number' && Number.isFinite(t) && t > 0) {
    return Math.min(10000, Math.floor(t));
  }
  return DEFAULT_LARGE_FILE_LINES;
}

function resolveLang(opts) {
  return opts && opts.lang === 'en' ? 'en' : 'pl';
}

const MSG = {
  pl: {
    secretTitle: 'Wykryto potencjalny zahardkodowany klucz API lub hasło w kodzie',
    secretDesc: 'Dane wrażliwe nigdy nie powinny trafiać bezpośrednio do repozytorium.',
    secretFix: '// Przenieś wartość do pliku .env i odczytaj ją bezpiecznie:\nconst SECRET_KEY = process.env.SECRET_KEY;\nif (!SECRET_KEY) throw new Error(\'Brak zmiennej środowiskowej SECRET_KEY\');',
    xssTitle: 'Ryzyko podatności XSS / Code Injection (eval lub dangerouslySetInnerHTML)',
    xssDesc: 'Wykonywanie niezaufanego kodu lub wstrzykiwanie surowego HTML otwiera lukę bezpieczeństwa.',
    xssFix: '// Zamiast eval() użyj JSON.parse() dla danych:\nconst safeData = JSON.parse(rawInput);\n\n// W React renderuj tekst bezpośrednio w JSX lub użyj biblioteki DOMPurify:\nimport DOMPurify from \'dompurify\';\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlString) }} />',
    keyTitle: 'Renderowanie listy przez .map() bez atrybutu "key"',
    keyDesc: 'Brak unikalnego klucza powoduje problemy z wydajnością i błędne odświeżanie stanu komponentów w React.',
    keyFix: '{items.map((item) => (\n  <TwojKomponent key={item.id} data={item} />\n))}',
    useEffectTitle: 'Bezpośrednie użycie funkcji async wewnątrz useEffect',
    useEffectDesc: 'Hook useEffect oczekuje funkcji czyszczącej lub niczego, a funkcja async zawsze zwraca Promise.',
    useEffectFix: 'useEffect(() => {\n  let isMounted = true;\n  async function fetchData() {\n    const res = await api.getData();\n    if (isMounted) setData(res);\n  }\n  fetchData();\n  return () => { isMounted = false; };\n}, []);',
    consoleTitle: 'Pozostawione wywołania console.log() w komponencie React',
    consoleDesc: 'Logi debugowania w warstwie widoku mogą wyciekać strukturę danych w przeglądarce użytkownika i zaśmiecają konsolę.',
    consoleFix: '// Usuń console.log przed commitem lub owiń go w warunek środowiskowy:\nif (process.env.NODE_ENV === \'development\') {\n  console.debug(\'Debug state:\', state);\n}',
    syncTitle: 'Blokujące wywołania synchroniczne (fs.*Sync) w kodzie obsługującym ruch',
    syncDesc: 'Jeśli te wywołania trafiają się w ścieżce requestu, zatrzymują event loop dla wszystkich użytkowników. W CLI i konfiguracji są nieszkodliwe — zweryfikuj kontekst przed poprawą.',
    syncFix: '// W ścieżce requestu zamień na wersję asynchroniczną:\nimport { readFile } from \'fs/promises\';\nconst data = await readFile(filePath, \'utf-8\');\n\n// Jeśli to celowo jednorazowy odczyt przy starcie/CLI — zostaw i skasuj tę uwagę.',
    asyncTitle: 'Asynchroniczny handler Expressa bez obsługi błędów',
    asyncDesc: 'Ten plik wygląda na warstwę routingu (używa res.*/next()) i zawiera async/await bez try/catch, .catch(), wrappera ani error middleware. Nieobsłużony wyjątek z await sprawi, że odpowiedź HTTP nigdy nie zostanie wysłana.',
    asyncFix: '// Opcja A — zawijaj handlery wrapperem (np. express-async-errors + istniejący globalErrorHandler):\nrouter.get(\'/x\', asyncHandler(async (req, res) => {\n  const data = await service.getX();\n  res.json(data);\n}));\n\n// Opcja B — try/catch w handlerze:\nrouter.get(\'/x\', async (req, res, next) => {\n  try {\n    const data = await service.getX();\n    res.json(data);\n  } catch (err) {\n    next(err); // trafia do error middleware zamiast wisieć w tle\n  }\n});\n\n// Jeśli błędy obsługuje już warstwa niżej (wrapper / error middleware) — skasuj tę uwagę.',
    largeTitle: (lineCount) => `Duży plik (${lineCount} linii) — rozważ podział`,
    largeDesc: (max) => `Plik przekracza ${max} linii, co utrudnia czytanie, testowanie i code review. Jeśli grupuje kilka odpowiedzialności (logika, I/O, walidacja, konfiguracja), warto rozważyć podział na mniejsze moduły. Oceń sam, czy podział jest uzasadniony — nie dziel spójnego pliku na siłę.`,
    largeFix: '// Podziel wg pojedynczej odpowiedzialności (Single Responsibility), np.:\n//  - dostęp do danych / I/O   -> data.js\n//  - logika biznesowa         -> service.js\n//  - walidacja / typy         -> validation.js\n// Każdy moduł trzymaj w jednej odpowiedzialności i eksportuj tylko to, co potrzebne.'
  },
  en: {
    secretTitle: 'Potential hardcoded API key or password found in code',
    secretDesc: 'Sensitive data should never be committed directly to the repository.',
    secretFix: '// Move the value to a .env file and read it safely:\nconst SECRET_KEY = process.env.SECRET_KEY;\nif (!SECRET_KEY) throw new Error(\'Missing SECRET_KEY environment variable\');',
    xssTitle: 'XSS / Code Injection risk (eval or dangerouslySetInnerHTML)',
    xssDesc: 'Executing untrusted code or injecting raw HTML opens a security vulnerability.',
    xssFix: '// Prefer JSON.parse() instead of eval() for data:\nconst safeData = JSON.parse(rawInput);\n\n// In React, render text in JSX or sanitize with DOMPurify:\nimport DOMPurify from \'dompurify\';\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlString) }} />',
    keyTitle: 'List rendered with .map() without a "key" attribute',
    keyDesc: 'Missing unique keys hurt performance and can cause incorrect React state updates.',
    keyFix: '{items.map((item) => (\n  <YourComponent key={item.id} data={item} />\n))}',
    useEffectTitle: 'Async function used directly inside useEffect',
    useEffectDesc: 'useEffect expects a cleanup function or nothing; an async function always returns a Promise.',
    useEffectFix: 'useEffect(() => {\n  let isMounted = true;\n  async function fetchData() {\n    const res = await api.getData();\n    if (isMounted) setData(res);\n  }\n  fetchData();\n  return () => { isMounted = false; };\n}, []);',
    consoleTitle: 'Leftover console.log() calls in a React component',
    consoleDesc: 'Debug logs in the UI layer may leak data structures in the user browser and clutter the console.',
    consoleFix: '// Remove console.log before commit or guard it with an environment check:\nif (process.env.NODE_ENV === \'development\') {\n  console.debug(\'Debug state:\', state);\n}',
    syncTitle: 'Blocking synchronous calls (fs.*Sync) in request-handling code',
    syncDesc: 'If these calls run on a request path, they block the event loop for all users. In CLI and config they are usually fine — verify the context before changing anything.',
    syncFix: '// On a request path, switch to the async API:\nimport { readFile } from \'fs/promises\';\nconst data = await readFile(filePath, \'utf-8\');\n\n// If this is an intentional one-off read at startup/CLI — keep it and dismiss this note.',
    asyncTitle: 'Async Express handler without error handling',
    asyncDesc: 'This file looks like an Express routing layer (uses res.*/next()) and has async/await without try/catch, .catch(), a wrapper, or error middleware. An unhandled await rejection means the HTTP response may never be sent.',
    asyncFix: '// Option A — wrap handlers (e.g. express-async-errors + existing globalErrorHandler):\nrouter.get(\'/x\', asyncHandler(async (req, res) => {\n  const data = await service.getX();\n  res.json(data);\n}));\n\n// Option B — try/catch in the handler:\nrouter.get(\'/x\', async (req, res, next) => {\n  try {\n    const data = await service.getX();\n    res.json(data);\n  } catch (err) {\n    next(err); // goes to error middleware instead of hanging\n  }\n});\n\n// If a lower layer already handles errors (wrapper / error middleware) — dismiss this note.',
    largeTitle: (lineCount) => `Large file (${lineCount} lines) — consider splitting`,
    largeDesc: (max) => `The file exceeds ${max} lines, which makes reading, testing, and code review harder. If it mixes several responsibilities (logic, I/O, validation, config), consider splitting into smaller modules. Judge whether a split is justified — do not force-split a coherent file.`,
    largeFix: '// Split by single responsibility, e.g.:\n//  - data access / I/O        -> data.js\n//  - business logic           -> service.js\n//  - validation / types       -> validation.js\n// Keep each module focused and export only what is needed.'
  }
};

function analyzeFileContent(filePath, content, opts) {
  const issues = { critical: [], framework: [], runtime: [], quality: [] };
  const m = MSG[resolveLang(opts)];

  const fileName = path.basename(filePath);
  const code = stripCommentsAndLiterals(content);

  if (/(api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{8,}['"]/i.test(content)) {
    issues.critical.push({
      file: filePath,
      title: m.secretTitle,
      description: m.secretDesc,
      fix: m.secretFix
    });
  }

  if (/\beval\s*\(/.test(code) || /dangerouslySetInnerHTML/.test(code)) {
    issues.critical.push({
      file: filePath,
      title: m.xssTitle,
      description: m.xssDesc,
      fix: m.xssFix
    });
  }

  if (/\.map\s*\(\s*\(?[^)]*\)?\s*=>\s*<[A-Za-z]/.test(content) && !/key\s*=/.test(content)) {
    issues.framework.push({
      file: filePath,
      title: m.keyTitle,
      description: m.keyDesc,
      fix: m.keyFix
    });
  }

  if (/useEffect\s*\(\s*async\b/.test(content)) {
    issues.framework.push({
      file: filePath,
      title: m.useEffectTitle,
      description: m.useEffectDesc,
      fix: m.useEffectFix
    });
  }

  if ((filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) && /console\.log\s*\(/.test(content)) {
    issues.framework.push({
      file: filePath,
      title: m.consoleTitle,
      description: m.consoleDesc,
      fix: m.consoleFix
    });
  }

  const isCliScript = /\bprocess\.exit\s*\(/.test(content) && /\bprocess\.argv\b/.test(content);
  const isConfigLike = fileName.includes('config');
  if (
    /fs\.(readFileSync|writeFileSync|existsSync)/.test(content) &&
    !isConfigLike &&
    !isCliScript &&
    !/^(index|main|server|app)\.[jt]sx?$/.test(fileName)
  ) {
    issues.runtime.push({
      file: filePath,
      title: m.syncTitle,
      description: m.syncDesc,
      fix: m.syncFix
    });
  }

  const hasAsyncAwait = /async\s+function|\basync\s*\([^)]*\)\s*=>/.test(content) && /\bawait\s+/.test(content);
  if (hasAsyncAwait) {
    const hasTry = /\btry\s*\{/.test(content);
    const hasCatch = /\.catch\s*\(/.test(content);
    const hasAsyncWrapper = /\b(asyncHandler|wrapAsync|catchAsync|handleAsync|asyncWrapper|wrap)\s*\(/.test(content) || /\b(asyncHandler|wrapAsync|catchAsync)\b.*from/.test(content);
    const hasErrorMiddleware = /use\s*\(\s*(async\s+)?(function\s*)?\(\s*err\s*,/.test(content) || /\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/.test(content);
    const isRouteLayer = /\bres\.(json|send|end|redirect|status)\s*\(/.test(content) || /\bnext\s*\(\s*\)/.test(content);

    if (isRouteLayer && !hasTry && !hasCatch && !hasAsyncWrapper && !hasErrorMiddleware) {
      issues.runtime.push({
        file: filePath,
        title: m.asyncTitle,
        description: m.asyncDesc,
        fix: m.asyncFix
      });
    }
  }

  const MAX_LINES_QUALITY = getLargeFileThreshold(opts);
  const lineCount = (content.replace(/\r?\n$/, '')).split('\n').length;
  if (lineCount > MAX_LINES_QUALITY) {
    issues.quality.push({
      file: filePath,
      title: m.largeTitle(lineCount),
      description: m.largeDesc(MAX_LINES_QUALITY),
      fix: m.largeFix
    });
  }

  return issues;
}

module.exports = { stripCommentsAndLiterals, analyzeFileContent };

const path = require('path');
const { DEFAULT_LARGE_FILE_LINES } = require('./scanner');

function stripCommentsAndLiterals(content) {
  const MAX_SCAN_LEN = 64 * 1024;
  const src = typeof content === 'string' && content.length > MAX_SCAN_LEN
    ? content.slice(0, MAX_SCAN_LEN)
    : (content || '');
  return src
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

function pushIssue(bucket, filePath, title, description, fix) {
  bucket.push({ file: filePath, title, description, fix });
}

function isDeclaredIdent(content, name) {
  const re = new RegExp(
    `(?:\\b(?:const|let|var|function|class)\\s+${name}\\b|\\b(?:async\\s+)?function\\s*\\([^)]*\\b${name}\\b|\\((?:[^)]*,\\s*)?${name}\\b|\\b${name}\\s*=>)`,
    'm'
  );
  return re.test(content);
}

const MSG = {
  pl: {
    secretTitle: 'Wykryto potencjalny zahardkodowany klucz API lub hasło w kodzie',
    secretDesc: 'Dane wrażliwe nigdy nie powinny trafiać bezpośrednio do repozytorium.',
    secretFix: '// Przenieś wartość do pliku .env i odczytaj ją bezpiecznie:\nconst SECRET_KEY = process.env.SECRET_KEY;\nif (!SECRET_KEY) throw new Error(\'Brak zmiennej środowiskowej SECRET_KEY\');',
    xssTitle: 'Ryzyko podatności XSS / Code Injection (eval lub dangerouslySetInnerHTML)',
    xssDesc: 'Wykonywanie niezaufanego kodu lub wstrzykiwanie surowego HTML otwiera lukę bezpieczeństwa.',
    xssFix: '// Zamiast eval() użyj JSON.parse() dla danych:\nconst safeData = JSON.parse(rawInput);\n\n// W React renderuj tekst bezpośrednio w JSX lub użyj biblioteki DOMPurify:\nimport DOMPurify from \'dompurify\';\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlString) }} />',
    xssInnerTitle: 'XSS: dane użytkownika wstawiane do innerHTML bez escape',
    xssInnerDesc: 'Fragment HTML budowany przez konkatenację zawiera niezescapowaną wartość. Atakujący może wstrzyknąć skrypt (np. w polu autora/nazwy).',
    xssInnerFix: 'item.innerHTML = \'<strong>\' + escapeHtml(comment.author) + \'</strong><p>\' + escapeHtml(comment.text) + \'</p>\';\n// albo użyj textContent / createElement zamiast innerHTML.',
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
    asyncFix: '// Opcja A — zawijaj handlery wrapperem (np. express-async-errors + istniejący globalErrorHandler):\nrouter.get(\'/x\', asyncHandler(async (req, res) => {\n  const data = await service.getX();\n  res.json(data);\n}));\n\n// Opcja B — try/catch w handlerze:\nrouter.get(\'/x\', async (req, res, next) => {\n  try {\n    const data = await service.getX();\n    res.json(data);\n  } catch (err) {\n    next(err);\n  }\n});',
    emptyCatchTitle: 'Pusty blok catch — połykane wyjątki',
    emptyCatchDesc: 'Puste catch {} ukrywa błędy i utrudnia diagnostykę. Błąd może przejść niezauważony w produkcji.',
    emptyCatchFix: 'catch (err) {\n  console.error(\'Nie udało się zapisać:\', err);\n  // albo: throw err / next(err) / return res.status(500).json({ error: \'...\' });\n}',
    silentCatchTitle: 'Ciche połykanie błędów Promise (.catch(() => {}))',
    silentCatchDesc: 'Pusty handler .catch ukrywa awarie sieci/API — użytkownik i monitoring nie widzą problemu.',
    silentCatchFix: '.catch((err) => {\n  console.error(err);\n  showMessage(\'Operacja nie powiodła się.\', true);\n});',
    stackLeakTitle: 'Wyciek stack trace w odpowiedzi HTTP',
    stackLeakDesc: 'Zwracanie err.stack do klienta ujawnia ścieżki i szczegóły implementacji — ułatwia atakującemu rekonesans.',
    stackLeakFix: 'sendJson(res, 500, { error: \'Wewnętrzny błąd serwera\' });\n// stack loguj tylko po stronie serwera: console.error(err);',
    redosTitle: 'new RegExp() z wejścia użytkownika — ryzyko ReDoS',
    redosDesc: 'Budowanie wyrażenia regularnego z niezaufanego query/body pozwala na catastrophic backtracking i DoS procesu Node.',
    redosFix: 'const escaped = q.replace(/[.*+?^${}()|[\\]\\\\]/g, \'\\\\$&\');\nconst pattern = new RegExp(escaped, \'i\');\n// albo użyj zwykłego includes()/indexOf zamiast RegExp.',
    looseEqTitle: 'Luźne porównanie == przy identyfikatorze',
    looseEqDesc: '== robi koercję typów (\"1\" == 1). Przy ID z URL/params łatwo o subtelne błędy; preferuj === po znormalizowaniu typu.',
    looseEqFix: 'const idx = items.findIndex((c) => c.id === Number(id));',
    hasMoreTitle: 'Podejrzany warunek hasMore / paginacji (off-by-one)',
    hasMoreDesc: 'Warunek w stylu offset + limit <= total zwykle zwraca hasMore=true na ostatniej stronie (gdy offset+limit === total), co psuje „ładuj więcej”.',
    hasMoreFix: 'hasMore: offset + limit < total',
    validationStatusTitle: 'Walidacja zwraca HTTP 200 z polem error',
    validationStatusDesc: 'Błąd walidacji powinien mieć 4xx (zwykle 400). Status 200 z { error } myli klientów i monitoring.',
    validationStatusFix: 'sendJson(res, 400, { error: \'Autor i treść są wymagane.\' });',
    consolePiiTitle: 'console.log z danymi żądania / użytkownika (PII)',
    consolePiiDesc: 'Logowanie body, autora, e-maila lub URL z query może wyciekać dane osobowe do logów.',
    consolePiiFix: '// Nie loguj pełnego body. W dev najwyżej zanonimizuj:\nconsole.debug(\'New comment\', { authorLen: data.author?.length, textLen: data.text?.length });',
    bodyLimitTitle: 'Brak limitu rozmiaru body przy ręcznym zbieraniu chunków',
    bodyLimitDesc: 'Doklejanie req.on(\'data\') do stringa bez limitu pozwala na DoS przez ogromne body.',
    bodyLimitFix: 'const MAX_BODY = 64 * 1024;\nlet raw = \'\';\nreq.on(\'data\', (chunk) => {\n  raw += chunk;\n  if (raw.length > MAX_BODY) {\n    req.destroy();\n  }\n});',
    rateLimitStubTitle: 'Martwy stub rate limitingu (TODO / zawsze true)',
    rateLimitStubDesc: 'Funkcja rate limit wygląda na niezaimplementowaną (TODO lub zawsze zwraca true) — ochrona przed floodem nie działa.',
    rateLimitStubFix: '// Zaimplementuj limit (np. licznik per IP w pamięci/Redis) albo użyj middleware:\n// npm i express-rate-limit',
    raceIdTitle: 'Ryzyko race condition przy ID = length + 1 po await',
    raceIdDesc: 'Generowanie id z array.length po await umożliwia zduplikowane ID przy równoległych requestach.',
    raceIdFix: 'let nextId = 1;\n// ...\nconst id = nextId++;\n// albo UUID / AUTO_INCREMENT w bazie',
    undefIdentTitle: 'Użycie niezadeklarowanego identyfikatora (ryzyko ReferenceError)',
    undefIdentDesc: 'Wywołanie metody na zmiennej, której nie ma w zakresie (np. literówka względem parametru event), kończy się ReferenceError w runtime.',
    undefIdentFix: 'const deleteBtn = event.target.closest(\'.delete-btn\');',
    encodeUriTitle: 'Brak encodeURIComponent przy składaniu URL z query',
    encodeUriDesc: 'Wstawianie surowego tekstu wyszukiwania do URL psuje zapytanie przy znakach specjalnych i może otworzyć wektory injection w query.',
    encodeUriFix: 'const url = `${API}?offset=${offset}&limit=${PAGE_SIZE}&q=${encodeURIComponent(searchQuery)}`;',
    fetchOkTitle: 'Odczyt res.json() bez sprawdzenia res.ok',
    fetchOkDesc: 'Przy HTTP 4xx/5xx body też bywa JSON — bez res.ok aplikacja traktuje błąd jak sukces.',
    fetchOkFix: 'const res = await fetch(url);\nif (!res.ok) throw new Error(`HTTP ${res.status}`);\nconst data = await res.json();',
    localStorageTitle: 'localStorage bez obsługi wyjątków',
    localStorageDesc: 'W trybie prywatnym / przy zablokowanym storage getItem/setItem rzuca — brak try/catch crashuje skrypt.',
    localStorageFix: 'try {\n  localStorage.setItem(\'author\', value);\n} catch {\n  /* storage niedostępny */\n}',
    largeTitle: (lineCount) => `Duży plik (${lineCount} linii) — rozważ podział`,
    largeDesc: (max) => `Plik przekracza ${max} linii, co utrudnia czytanie, testowanie i code review. Jeśli grupuje kilka odpowiedzialności (logika, I/O, walidacja, konfiguracja), warto rozważyć podział na mniejsze moduły. Oceń sam, czy podział jest uzasadniony — nie dziel spójnego pliku na siłę.`,
    largeFix: '// Podziel wg pojedynczej odpowiedzialności (Single Responsibility), np.:\n//  - dostęp do danych / I/O   -> data.js\n//  - logika biznesowa         -> service.js\n//  - walidacja / typy         -> validation.js'
  },
  en: {
    secretTitle: 'Potential hardcoded API key or password found in code',
    secretDesc: 'Sensitive data should never be committed directly to the repository.',
    secretFix: '// Move the value to a .env file and read it safely:\nconst SECRET_KEY = process.env.SECRET_KEY;\nif (!SECRET_KEY) throw new Error(\'Missing SECRET_KEY environment variable\');',
    xssTitle: 'XSS / Code Injection risk (eval or dangerouslySetInnerHTML)',
    xssDesc: 'Executing untrusted code or injecting raw HTML opens a security vulnerability.',
    xssFix: '// Prefer JSON.parse() instead of eval() for data:\nconst safeData = JSON.parse(rawInput);\n\n// In React, render text in JSX or sanitize with DOMPurify:\nimport DOMPurify from \'dompurify\';\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlString) }} />',
    xssInnerTitle: 'XSS: user data inserted into innerHTML without escaping',
    xssInnerDesc: 'HTML built via string concatenation includes an unescaped value. An attacker can inject a script (e.g. via author/name fields).',
    xssInnerFix: 'item.innerHTML = \'<strong>\' + escapeHtml(comment.author) + \'</strong><p>\' + escapeHtml(comment.text) + \'</p>\';\n// or use textContent / createElement instead of innerHTML.',
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
    syncFix: '// On a request path, switch to the async API:\nimport { readFile } from \'fs/promises\';\nconst data = await readFile(filePath, \'utf-8\');',
    asyncTitle: 'Async Express handler without error handling',
    asyncDesc: 'This file looks like an Express routing layer (uses res.*/next()) and has async/await without try/catch, .catch(), a wrapper, or error middleware. An unhandled await rejection means the HTTP response may never be sent.',
    asyncFix: 'router.get(\'/x\', async (req, res, next) => {\n  try {\n    const data = await service.getX();\n    res.json(data);\n  } catch (err) {\n    next(err);\n  }\n});',
    emptyCatchTitle: 'Empty catch block — swallowed exceptions',
    emptyCatchDesc: 'Empty catch {} hides failures and makes production debugging harder.',
    emptyCatchFix: 'catch (err) {\n  console.error(\'Save failed:\', err);\n  // or: throw err / next(err) / return res.status(500).json({ error: \'...\' });\n}',
    silentCatchTitle: 'Silent Promise error swallowing (.catch(() => {}))',
    silentCatchDesc: 'An empty .catch hides network/API failures from users and monitoring.',
    silentCatchFix: '.catch((err) => {\n  console.error(err);\n  showMessage(\'Operation failed.\', true);\n});',
    stackLeakTitle: 'Stack trace leaked in HTTP response',
    stackLeakDesc: 'Returning err.stack to clients exposes paths and implementation details useful for reconnaissance.',
    stackLeakFix: 'sendJson(res, 500, { error: \'Internal server error\' });\n// log stack only server-side: console.error(err);',
    redosTitle: 'new RegExp() from user input — ReDoS risk',
    redosDesc: 'Building a RegExp from untrusted query/body enables catastrophic backtracking and Node process DoS.',
    redosFix: 'const escaped = q.replace(/[.*+?^${}()|[\\]\\\\]/g, \'\\\\$&\');\nconst pattern = new RegExp(escaped, \'i\');\n// or use includes()/indexOf instead of RegExp.',
    looseEqTitle: 'Loose == comparison on an identifier',
    looseEqDesc: '== coerces types (\"1\" == 1). With IDs from URL/params prefer === after normalizing the type.',
    looseEqFix: 'const idx = items.findIndex((c) => c.id === Number(id));',
    hasMoreTitle: 'Suspicious hasMore / pagination condition (off-by-one)',
    hasMoreDesc: 'A condition like offset + limit <= total usually keeps hasMore=true on the last page (when offset+limit === total), breaking “load more”.',
    hasMoreFix: 'hasMore: offset + limit < total',
    validationStatusTitle: 'Validation returns HTTP 200 with an error field',
    validationStatusDesc: 'Validation failures should use 4xx (usually 400). Status 200 with { error } confuses clients and monitoring.',
    validationStatusFix: 'sendJson(res, 400, { error: \'Author and text are required.\' });',
    consolePiiTitle: 'console.log with request / user data (PII)',
    consolePiiDesc: 'Logging body, author, email, or URLs with query may leak personal data into logs.',
    consolePiiFix: 'console.debug(\'New comment\', { authorLen: data.author?.length, textLen: data.text?.length });',
    bodyLimitTitle: 'No body size limit while concatenating request chunks',
    bodyLimitDesc: 'Appending req.on(\'data\') chunks to a string without a cap enables DoS via huge bodies.',
    bodyLimitFix: 'const MAX_BODY = 64 * 1024;\nlet raw = \'\';\nreq.on(\'data\', (chunk) => {\n  raw += chunk;\n  if (raw.length > MAX_BODY) req.destroy();\n});',
    rateLimitStubTitle: 'Dead rate-limiting stub (TODO / always true)',
    rateLimitStubDesc: 'The rate-limit function looks unimplemented (TODO or always returns true) — flood protection is inactive.',
    rateLimitStubFix: '// Implement a real per-IP limiter (memory/Redis) or use middleware such as express-rate-limit.',
    raceIdTitle: 'Race condition risk: ID = length + 1 after await',
    raceIdDesc: 'Generating ids from array.length after await can produce duplicate IDs under concurrent requests.',
    raceIdFix: 'let nextId = 1;\nconst id = nextId++;\n// or UUID / DB auto-increment',
    undefIdentTitle: 'Use of an undeclared identifier (ReferenceError risk)',
    undefIdentDesc: 'Calling a method on a variable that is not in scope (e.g. a typo for parameter event) throws ReferenceError at runtime.',
    undefIdentFix: 'const deleteBtn = event.target.closest(\'.delete-btn\');',
    encodeUriTitle: 'Missing encodeURIComponent when building a query URL',
    encodeUriDesc: 'Inserting raw search text into a URL breaks queries with special characters and can create query-injection vectors.',
    encodeUriFix: 'const url = `${API}?offset=${offset}&limit=${PAGE_SIZE}&q=${encodeURIComponent(searchQuery)}`;',
    fetchOkTitle: 'Reading res.json() without checking res.ok',
    fetchOkDesc: 'HTTP 4xx/5xx bodies are often JSON too — without res.ok the app treats failures as success.',
    fetchOkFix: 'const res = await fetch(url);\nif (!res.ok) throw new Error(`HTTP ${res.status}`);\nconst data = await res.json();',
    localStorageTitle: 'localStorage used without exception handling',
    localStorageDesc: 'In private mode / blocked storage, getItem/setItem throws — missing try/catch crashes the script.',
    localStorageFix: 'try {\n  localStorage.setItem(\'author\', value);\n} catch {\n  /* storage unavailable */\n}',
    largeTitle: (lineCount) => `Large file (${lineCount} lines) — consider splitting`,
    largeDesc: (max) => `The file exceeds ${max} lines, which makes reading, testing, and code review harder. If it mixes several responsibilities (logic, I/O, validation, config), consider splitting into smaller modules. Judge whether a split is justified — do not force-split a coherent file.`,
    largeFix: '// Split by single responsibility, e.g.:\n//  - data access / I/O        -> data.js\n//  - business logic           -> service.js\n//  - validation / types       -> validation.js'
  }
};

function analyzeFileContent(filePath, content, opts) {
  const issues = { critical: [], framework: [], runtime: [], quality: [] };
  const m = MSG[resolveLang(opts)];
  const fileName = path.basename(filePath);
  const code = stripCommentsAndLiterals(content);
  const isJs = /\.(jsx?|tsx?|mjs|cjs)$/i.test(filePath);

  if (/(api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{8,}['"]/i.test(content)) {
    pushIssue(issues.critical, filePath, m.secretTitle, m.secretDesc, m.secretFix);
  }

  if (/\beval\s*\(/.test(code) || /dangerouslySetInnerHTML/.test(code)) {
    pushIssue(issues.critical, filePath, m.xssTitle, m.xssDesc, m.xssFix);
  }

  if (isJs && /innerHTML\s*=/.test(content)) {
    const rawField = /\+\s*[\w$]+(?:\.[\w$]+)+\s*\+/.test(content)
      && /innerHTML[\s\S]{0,800}\+\s*[\w$]+\.(?:author|name|title|user|username|email|html|label)\b/i.test(content)
      && !/innerHTML[\s\S]{0,800}escapeHtml\s*\(\s*[\w$]+\.(?:author|name|title|user|username|email|html|label)/i.test(content);
    if (rawField) {
      pushIssue(issues.critical, filePath, m.xssInnerTitle, m.xssInnerDesc, m.xssInnerFix);
    }
  }

  if (/\.map\s*\(\s*\(?[^)]*\)?\s*=>\s*<[A-Za-z]/.test(content) && !/key\s*=/.test(content)) {
    pushIssue(issues.framework, filePath, m.keyTitle, m.keyDesc, m.keyFix);
  }

  if (/useEffect\s*\(\s*async\b/.test(content)) {
    pushIssue(issues.framework, filePath, m.useEffectTitle, m.useEffectDesc, m.useEffectFix);
  }

  if ((filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) && /console\.log\s*\(/.test(content)) {
    pushIssue(issues.framework, filePath, m.consoleTitle, m.consoleDesc, m.consoleFix);
  }

  const isCliScript = /\bprocess\.exit\s*\(/.test(content) && /\bprocess\.argv\b/.test(content);
  const isConfigLike = /config|settings|store|bootstrap|setup|init/i.test(fileName)
    || /(?:^|\/)(?:config|scripts?|bin|cli|tools?)(?:\/|$)/i.test(filePath.replace(/\\/g, '/'));
  const isEntryLike = /^(index|main|server|app|cli)\.[jt]sx?$/i.test(fileName);
  const hasBlockingFsSync = /fs\.(readFileSync|writeFileSync|readdirSync|statSync|mkdirSync|unlinkSync|rmSync|appendFileSync|copyFileSync)\b/.test(code);
  const isRequestPath = /\bres\.(json|send|end|redirect|status|render)\s*\(/.test(code)
    || /\b(req|request)\.(body|params|query|headers|method|url|path)\b/.test(code)
    || /\b(app|router|server)\.(get|post|put|patch|delete|use|all)\s*\(/.test(code)
    || /\bnext\s*\(\s*(?:err)?\s*\)/.test(code)
    || /\bhttp\.createServer\b/.test(code);
  if (hasBlockingFsSync && isRequestPath && !isConfigLike && !isCliScript && !isEntryLike) {
    pushIssue(issues.runtime, filePath, m.syncTitle, m.syncDesc, m.syncFix);
  }

  const hasAsyncAwait = /async\s+function|\basync\s*\([^)]*\)\s*=>/.test(content) && /\bawait\s+/.test(content);
  if (hasAsyncAwait) {
    const hasTry = /\btry\s*\{/.test(content);
    const hasCatch = /\.catch\s*\(/.test(content);
    const hasAsyncWrapper = /\b(asyncHandler|wrapAsync|catchAsync|handleAsync|asyncWrapper|wrap)\s*\(/.test(content)
      || /\b(asyncHandler|wrapAsync|catchAsync)\b.*from/.test(content);
    const hasErrorMiddleware = /use\s*\(\s*(async\s+)?(function\s*)?\(\s*err\s*,/.test(content)
      || /\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/.test(content);
    const isRouteLayer = /\bres\.(json|send|end|redirect|status)\s*\(/.test(content) || /\bnext\s*\(\s*\)/.test(content);

    if (isRouteLayer && !hasTry && !hasCatch && !hasAsyncWrapper && !hasErrorMiddleware) {
      pushIssue(issues.runtime, filePath, m.asyncTitle, m.asyncDesc, m.asyncFix);
    }
  }

  if (isJs && /catch\s*\([^)]*\)\s*\{\s*\}/.test(code)) {
    pushIssue(issues.runtime, filePath, m.emptyCatchTitle, m.emptyCatchDesc, m.emptyCatchFix);
  }

  if (isJs && /\.catch\s*\(\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>\s*\{\s*\}\s*\)/.test(code)) {
    pushIssue(issues.runtime, filePath, m.silentCatchTitle, m.silentCatchDesc, m.silentCatchFix);
  }

  if (isJs && /(?:stack\s*:\s*\w+\.stack|\b\w+\.stack\b)/.test(code)
    && /(?:sendJson|res\.(?:json|send|end)|writeHead)\s*\(/.test(code)
    && /(?:500|status\s*\(\s*500)/.test(content)) {
    pushIssue(issues.critical, filePath, m.stackLeakTitle, m.stackLeakDesc, m.stackLeakFix);
  }

  if (isJs && /new\s+RegExp\s*\(\s*[a-zA-Z_$][\w$]*/.test(code)
    && /(?:searchParams|req\.(?:query|body|params)|URLSearchParams|\.get\(\s*['"]q['"])/.test(content)) {
    pushIssue(issues.critical, filePath, m.redosTitle, m.redosDesc, m.redosFix);
  }

  if (isJs && /\w+\.id\s*==\s*\w+|\w+\s*==\s*\w+\.id/.test(code)) {
    pushIssue(issues.quality, filePath, m.looseEqTitle, m.looseEqDesc, m.looseEqFix);
  }

  if (isJs && /hasMore\s*:\s*[^,\n}]*\+\s*[^,\n}]*<=\s*[^,\n}]*/.test(code)
    || /hasMore\s*:\s*offset\s*\+\s*limit\s*<=\s*total/.test(content)) {
    pushIssue(issues.quality, filePath, m.hasMoreTitle, m.hasMoreDesc, m.hasMoreFix);
  }

  if (isJs && (
    /(?:sendJson|res\.json|res\.send)\s*\(\s*(?:res\s*,\s*)?200\s*,\s*\{[^}]*\berror\b/.test(content)
    || /(?:sendJson)\s*\(\s*res\s*,\s*200\s*,\s*\{[^}]*\berror\b/.test(content)
  )) {
    pushIssue(issues.runtime, filePath, m.validationStatusTitle, m.validationStatusDesc, m.validationStatusFix);
  }

  if (isJs && (
    /console\.log\s*\([^)]*(?:req\.body|\bauthor\b|\bemail\b|\bpassword\b|\busername\b|searchQuery)/i.test(content)
    || /console\.log\s*\(\s*(?:['"`][^'"`]*['"`]\s*,\s*)?(?:data|body|user|req)\b/.test(content)
  )) {
    pushIssue(issues.runtime, filePath, m.consolePiiTitle, m.consolePiiDesc, m.consolePiiFix);
  }

  if (isJs && /req\.on\s*\(\s*['"]data['"]/.test(content) && /\w+\s*\+=\s*(?:chunk|buf|data|d)\b/.test(content)
    && !/(?:MAX_BODY|maxBody|bodyLimit|bodyMax|MAX_REQUEST)|(?:raw|body|buf)\.length\s*>\s*\d+/i.test(content)) {
    pushIssue(issues.critical, filePath, m.bodyLimitTitle, m.bodyLimitDesc, m.bodyLimitFix);
  }

  if (isJs && /function\s+\w*[Rr]ate[Ll]imit\w*\s*\([^)]*\)\s*\{[\s\S]{0,200}?return\s+true\s*;?/.test(content)) {
    pushIssue(issues.quality, filePath, m.rateLimitStubTitle, m.rateLimitStubDesc, m.rateLimitStubFix);
  }

  if (isJs && /\bawait\b[\s\S]{0,240}id\s*:\s*\w+\.length\s*\+\s*1/.test(content)) {
    pushIssue(issues.critical, filePath, m.raceIdTitle, m.raceIdDesc, m.raceIdFix);
  }

  if (isJs) {
    const closestRe = /\b([a-zA-Z_$][\w$]*)\s*\.\s*closest\b/g;
    let cm;
    const reported = new Set();
    while ((cm = closestRe.exec(content))) {
      const name = cm[1];
      if (name === 'event' || name === 'e' || name === 'evt' || name === 'target' || name === 'el' || name === 'node') continue;
      if (reported.has(name)) continue;
      if (!isDeclaredIdent(content, name)) {
        reported.add(name);
        pushIssue(issues.runtime, filePath, m.undefIdentTitle, m.undefIdentDesc, m.undefIdentFix);
      }
    }
  }

  if (isJs && /(?:\?|&)q=['"]\s*\+\s*[a-zA-Z_$][\w$]*|q=['"]\s*\+\s*[a-zA-Z_$][\w$]*/.test(content)
    && !/encodeURIComponent\s*\(/.test(content)) {
    pushIssue(issues.runtime, filePath, m.encodeUriTitle, m.encodeUriDesc, m.encodeUriFix);
  }

  if (isJs && /\bfetch\s*\(/.test(code) && /await\s+\w+\.json\s*\(|\.json\s*\(\s*\)/.test(code)
    && !/\.ok\b/.test(code) && !/status\s*(?:===?|!==?)\s*2\d\d/.test(code)) {
    pushIssue(issues.runtime, filePath, m.fetchOkTitle, m.fetchOkDesc, m.fetchOkFix);
  }

  if (isJs && /localStorage\.(get|set|remove)Item\s*\(/.test(code)) {
    const hasTry = /\btry\s*\{[\s\S]{0,200}localStorage\.(get|set|remove)Item/.test(content)
      || /localStorage\.(get|set|remove)Item[\s\S]{0,80}catch\s*\(/.test(content);
    if (!hasTry) {
      pushIssue(issues.runtime, filePath, m.localStorageTitle, m.localStorageDesc, m.localStorageFix);
    }
  }

  const MAX_LINES_QUALITY = getLargeFileThreshold(opts);
  const lineCount = (content.replace(/\r?\n$/, '')).split('\n').length;
  const skipCssSplit = !!(opts && opts.largeFileSkipCss);
  const isCssLike = /\.(css|scss|sass|less)$/i.test(filePath);
  if (lineCount > MAX_LINES_QUALITY && !(skipCssSplit && isCssLike)) {
    pushIssue(issues.quality, filePath, m.largeTitle(lineCount), m.largeDesc(MAX_LINES_QUALITY), m.largeFix);
  }

  return issues;
}

module.exports = { stripCommentsAndLiterals, analyzeFileContent };

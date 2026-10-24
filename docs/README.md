# VibeCR - Dokumentacja techniczna

## 1. Cel aplikacji

VibeCR to 100% lokalny code-reviewer działający w przeglądarce. 
- **Zero-state po stronie serwera** - nie przechowuje raportów, nie zapisuje plików
- **Tylko Express** - bez build step, działające poprzez `pnpm node server.js`
- **UI jako ES modules** w `public/`
- **Lokalny proxy AI** (`/api/llm-proxy`) omijający CORS przeglądarki
- **Heurystyczna + AI analiza** kodu dowolnego języka/frameworka

## 2. Architektura

### Backend (Node.js + Express)
```
server.js
├── src/lib/
│   ├── scanner.js   # skanowanie plików, ignorowanie wygenerowanych
│   ├── git.js       # safe execFileSync, walidacje
│   ├── analysis.js  # heurystyka lokalna
│   └── stack.js     # wykrywanie stosu
└── src/routes/
    ├── review.js    # /api/review, /api/files, /api/git-info
    ├── llm.js       # /api/llm-proxy (loopback-only)
    ├── opencode.js  # integracja z lokalnym OpenCode
    └── browse.js    # przeglądarka dysku
```

### Frontend (ES modules)
```
public/
├── index.html
├── styles.css
├── i18n/{pl,en}.json
└── js/
    ├── app.js       # entry point, event wiring
    ├── state.js     # stan aplikacji
    ├── dom.js       # $/escapeHtml
    ├── storage.js   # localStorage (projects/LLM/UI)
    ├── i18n.js      # tłumaczenia
    ├── report.js    # renderowanie raportu + akcje
    ├── providers.js # LLM providers + proxy
    ├── prompt.js    # prompt dla AI
    ├── gitinfo.js   # git-info
    ├── presets.js   # skróty projektów
    └── browser.js   # modal przeglądarki
```

## 3. Kluczowe moduły backend

### `scanner.js`
- `SOURCE_EXTS` - rozpoznawane rozszerzenia źródłowe
- `IGNORED_DIRS` - katalogi ignorowane (`node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, `.nuxt`, `.svelte-kit`, `vendor`, `target`, `__pycache__`, `.venv`, `venv`, `out`, `.output`, `storybook-static`, `generated`, `gen`, `docs`)
- `IGNORED_PATH_FRAGMENTS` - dodatkowe maski ścieżek (`/dist/`, `/build/`, `/out/`, `/generated/`, `/gen/`, `/coverage/`, `/.next/`, `/target/`, `/vendor/`, `/__pycache__/`, `/.output/`, `/storybook-static/`)
- `pathHasIgnoredFragment()` - sprawdza czy ścieżka jest wygenerowana
- `getProjectFiles()` - rekurencyjne skanowanie z ignorowaniem
- `isTestFile()` - rozpoznanie plików testowych
- `DEFAULT_LARGE_FILE_LINES = 400`

### `analysis.js`
Lokalna heurystyka. Kategorie:
- `critical` - sekrety, `eval`, `dangerouslySetInnerHTML`
- `framework` - React/Vue: `.map()` bez `key`, `useEffect(async ...)`, `console.log` w `.jsx/.tsx`
- `runtime` - `fs.*Sync` w kodzie requestowym, async Express handler bez obsługi błędów
- `quality` - **duży plik** (> N linii, domyślnie 400). Licznik odporny na końcowy newline. Pomijane pliki w wygenerowanych katalogach (skaner).

Funkcje: `stripCommentsAndLiterals()`, `analyzeFileContent(filePath, content, opts)` z `opts.largeFileLines`.

### `git.js`
- `runGit(repoPath, args)` - `execFileSync('git', ..., {stdio:'pipe', windowsHide:true, maxBuffer:10MB})` bez shell
- `isValidGitRef()` - regex dla branch/revision
- `isInsideRepo()` - ochrona przed `../`
- `isGitRepo()` - `git rev-parse --is-inside-work-tree`
- `collectFiles()` - git diff + untracked lub pełne skanowanie; filtruje testy wg `includeTests`

### `review.js` routes
- `POST /api/git-info` - status repo (obsługuje repo bez commitów)
- `POST /api/review` - zwraca raport z 4 kategoriami + `detected`, `quality` uwzględnia `largeFileLines`
- `POST /api/files` - zwraca max 40 plików po 15000 znaków (do AI, tylko lokalnie)

### Cloudflare security-audit (MIT)
Vendored under `src/lib/cf-security-skill/` from [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (validators + schema + selected attack-class docs). See `ATTRIBUTION.md`.

Wrapper: `src/lib/cfSecurity.js` — `validateFindings`, `validateCoverageLedger`, `mapFindingsToReport`, `buildSecurityPromptExtras`.

Routes (`src/routes/audit.js`):
- `POST /api/security-audit/import` — import `findings.json` → raport VibeCR
- `POST /api/security-audit/validate` — sama walidacja
- `POST /api/security-audit/map` — soft-map (także niepełny schemat)
- `POST /api/security-audit` — prepare Security AI pass (pliki + attack classes) lub mapowanie findings

Mapowanie: `confirmed` (medium+) → critical; `confirmed` low/informational → quality (hardening); `needs_validation` → critical + badge verify; `rejected` pomijane.

Pełny 6-fazowy harness agentów pozostaje poza VibeCR (Cursor + upstream skill); VibeCR importuje findings i wzbogaca lokalny CR.

### `llm.js` - `/api/llm-proxy`
- Tylko loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`)
- HTTPS dowolny host; HTTP tylko loopback
- Usuwa nagłówki: `host`, `content-length`, `connection`, `origin`, `referer`, `cookie`
- Max body 10MB
- Logi: `[llm-proxy] ...`, nie loguje query string
- Zwraca odpowiedź jako `Response` (obsługuje 204/205/304)

## 4. Frontend - kluczowe elementy

### `state.js`
```js
{ repoInput, lastReport, reportBackup, browserState, projects, i18n }
```

### `storage.js`
Klucze localStorage:
- `vibecr.projects` (+ legacy `gitvibe.projects`)
- `vibecr.llm` (+ legacy `gitvibe.llm`)
- `vibecr.ui` (+ legacy `gitvibe.ui`) - przechowuje `{theme, lang, largeFileLines}`

UI config: `loadUIConfig()`, `saveUIConfig(patch)`.

### `i18n.js`
- `loadLocale(lang)` - ładuje `/i18n/pl.json` lub `/en.json`
- `applyTranslations(dict)` - wspiera `data-i18n`, `data-i18n-attr`, `data-i18n-placeholder`, `data-i18n-title`
- używane w `app.js` przy init i przełączeniu języka

### `report.js`
Kategorii 4: `critical/framework/runtime/quality`. Funkcje:
- `renderIssueCard(issue, category, index)` - karta z „Kopiuj poprawkę”, „Usuń”
- `renderCategory(category)` - renderuje listę + licznik + empty message
- `renderReport()` - wszystkie kategorie
- `dismissIssue(cat, idx)`, `clearCategory(cat)`, `restoreIssues()` - modyfikacje `state.lastReport` + `state.reportBackup`
- `mergeIssues(heuristic, ai)` - deduplikacja po `file|title`
- `copyAllIssues()` - generuje tekst raportu (z uwagą na `quality`)
- `updateReportControls()` - włącza/wyłącza przyciski „Usuń wszystkie”, „Przywróć usunięte”

### `app.js`
- `fetchAIIssues()` - pobiera `/api/files`, budzi prompt, woła `callLLM` przez proxy
- `runReview()` - główna akcja: `/api/review` (z `largeFileLines`), opcjonalnie AI, łączy wyniki, ustawia `reportBackup`, renderuje
- `applyLocale()` - ładuje i aplikuje tłumaczenia
- `init()` - ładuje UI config (theme/lang/largeFileLines), aplikuje theme/lang, ładuje projekty
- event wiring dla wszystkich przycisków

### `providers.js`
- `buildGeminiUrl(config)` - normalizacja Base URL (dodaje `/v1beta`, usuwa trailing slash/trailing `/models`), fallback model
- `llmFetch(url, init)` - kieruje zewnętrzne URL przez `/api/llm-proxy`, lokalne (relative) bezpośrednio
- `callLLM(config, prompt)` - wywołanie providerów (gemini/claude/openai/opencode/ollama/lmstudio)
- `applyLLMConfig()`, `onProviderChange()`, `syncProviderUi()` - UI konfiguracji AI

### `prompt.js`
Prompt AI z kategorią `quality` (SOLID/SRP, „wszystko w jednym”, podział na moduły/warstwy gdy uzasadniony). Schema JSON zawiera `quality`. `normalizeAIResult()` akceptuje `quality` + legacy `react/node`.

## 5. UI/UX

### index.html
- Nagłówek: tytuł + subtitle, przyciski „PL/EN”, „Tryb jasny/ciemny”, badge brancha
- Input ścieżki + przeglądaj + sprawdź
- Zakres analizy (diff/all), porównaj względem brancha, uwzględnij testy
- „Próg dużego pliku (linie)”
- Konfiguracja AI (provider/model/baseUrl/key) + test połączenia + start/stop OpenCode
- „Uzupełnij raport analizą AI”
- Raport: 4 sekcje (Krytyczne/Framework/Język i runtime/Jakość i standardy), przyciski „Usuń wszystkie”, „Przywróć usunięte”, „Kopiuj wszystkie uwagi”

### styles.css
- CSS variables: `:root` + `[data-theme="dark"]`
- `@media (prefers-color-scheme: dark)` fallback gdy nie ustawiono `data-theme`
- `color-scheme: light dark`
- `:focus-visible` (WCAG)
- Style dla `.option-row`, `.section-clear-btn`, `.dismiss-issue-btn`, `.issue-card`, modal

### Dostępność (WCAG)
- `aria-pressed` dla przełączników języka/trybu
- `aria-label` dla przycisków
- `:focus-visible`
- `color-scheme`
- semantyczne elementy HTML

## 6. Konfiguracja i uruchomienie

```bash
pnpm install
pnpm node server.js
# http://localhost:3333
```

Wymagania: Node.js >= 18 (testowane na v24.11.1), pnpm.

## 7. Bezpieczeństwo

- Brak CORS (same-origin)
- Tylko eksplicitne route’y
- `execFileSync` bez shell
- Walidacje ścieżek/branchy (`isInsideRepo`, `isValidGitRef`)
- HTML escaping (`escapeHtml`)
- `/api/llm-proxy` tylko loopback + restrykcje nagłówków + limit 10MB
- Zero persistence serwera
- Klucze API tylko w `localStorage` przeglądarki
- Kod trafia do AI wyłącznie przy zaznaczonym checkboxie

## 8. Zmiany wprowadzane przy rozwoju (kontekst bieżący)

- Dodano kategorię `quality` (end-to-end)
- Konfigurowalny próg dużego pliku + ignorowanie wygenerowanych katalogów
- i18n PL/EN + theme toggle + a11y
- Dark mode dla wszystkich kluczowych elementów UI
- Per-issue dismiss + clear section + restore all

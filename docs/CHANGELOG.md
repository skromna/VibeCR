# VibeCR - Changelog

## v0.9.0 (obecna)
### Backend
- Dodana kategoria `quality` z regułą "duży plik" (>400 linii domyślnie). Licznik odporny na końcowy newline.
- Konfigurowalny `largeFileLines` (100–2000) przez API i UI.
- Rozszerzone ignorowanie wygenerowanych katalogów: `out`, `.output`, `storybook-static`, `generated`, `gen`, `docs` + fragmenty ścieżek (`/generated/`, `/.output/` itd.)
- `analyzeFileContent(filePath, content, opts)` z przekazywaniem progu

### Frontend
- System i18n (PL/EN) - pliki JSON w `public/i18n/`, dynamiczne tłumaczenie (data-i18n*)
- Theme toggle (light/dark) z CSS variables, `color-scheme: light dark`, `prefers-color-scheme` fallback
- Dostępność (WCAG): `aria-pressed`, `aria-label`, `:focus-visible`
- Dark mode dla wszystkich elementów (karty, pola, modale, listy przeglądarki)
- UI: pole "Próg dużego pliku (linie)", przełączniki języka/trybu
- `report.js`: tłumaczenia empty/copy/remove
- `state.js`: pole `i18n`

### UX
- 4 kategorie raportu (Krytyczne, Framework, Język i runtime, Jakość i standardy)
- Per-issue dismiss, clear section, restore all
- Zachowanie zero-state, zero persistence po stronie serwera

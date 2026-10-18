# VibeCR - Dokumentacja API

## POST /api/git-info
Sprawdza stan repozytorium.

Body:
```json
{ "repoPath": "C:\\projekty\\app" }
```

Response:
```json
{ "isRepo": true, "currentBranch": "main", "modifiedCount": 3 }
```
lub dla folderu bez git: `{ "isRepo": false, "currentBranch": null, "modifiedCount": 0 }`

## POST /api/review
Główne skanowanie heurystyczne.

Body:
```json
{
  "repoPath": "...",
  "scope": "diff|all",
  "compareBranch": "main",
  "includeTests": false,
  "largeFileLines": 400
}
```

Response:
```json
{
  "isRepo": true,
  "branch": "main",
  "scannedFilesCount": 10,
  "detected": { "languages": ["JavaScript"], "frameworks": ["React"] },
  "critical": [...],
  "framework": [...],
  "runtime": [...],
  "quality": [...]
}
```

## POST /api/files
Zbiera pliki do wysłania AI (maks. 40 plików × 15000 znaków).

Body: jak `/api/review` (bez `largeFileLines` wpływającego na heurystykę)

Response:
```json
{ "files": [{"path": "src/app.js", "content": "..."}], "totalFiles": 55, "truncated": true }
```

## POST /api/llm-proxy
Lokalny proxy do dostawców AI. **Tylko loopback**.

Body: dowolne (forwardowane). Nagłówki usuwane: host, content-length, connection, origin, referer, cookie. Max 10MB.

Query/URL przekazywany zgodnie z wywołaniem.

## POST /api/opencode-detect|start|stop|status
Integracja z lokalnym OpenCode (detekcja binarki, start/stop serwera na porcie 4096).

## GET/POST /api/browse
Przeglądarka folderów lokalnego dysku.

## Statyczne
`GET /` → `public/index.html`, `/styles.css`, `/js/*`, `/i18n/*`

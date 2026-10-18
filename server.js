const express = require('express');
const path = require('path');

const reviewRoutes = require('./src/routes/review');
const opencode = require('./src/routes/opencode');
const browseRoutes = require('./src/routes/browse');
const llmRoutes = require('./src/routes/llm');

const app = express();

// Bez CORS: API dostępne wyłącznie same-origin (UI serwowane z tego samego serwera).
// Dzięki temu żadna zewnętrzna strona WWW nie może skanować dysku przez ten serwer.
// Proxy AI przyjmuje większe ciała (prompt z kodem) — rejestrowane przed globalnym limitem.
app.use('/api/llm-proxy', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '100kb' }));

// UI serwowane wyłącznie z katalogu public/ — nie ujawniamy server.js ani node_modules.
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, { index: ['index.html'] }));

// API
app.use('/api', reviewRoutes);
app.use('/api', opencode.router);
app.use('/api', browseRoutes);
app.use('/api', llmRoutes);

const PORT = 3333;

// Uwaga: serwer jest w pełni "stanowy-zero" — nie zapisuje żadnych danych
// użytkownika (ścieżki, skróty, konfiguracja AI żyją wyłącznie w localStorage
// przeglądarki po stronie klienta).
app.listen(PORT, () => {
  console.log(`🚀 VibeCR działa pod adresem: http://localhost:${PORT}`);
});

// Sprzątanie: nie zostawiamy osieroconego serwera OpenCode po zamknięciu VibeCR
process.on('exit', opencode.shutdown);

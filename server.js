const express = require('express');
const path = require('path');

const reviewRoutes = require('./src/routes/review');
const opencode = require('./src/routes/opencode');
const browseRoutes = require('./src/routes/browse');
const llmRoutes = require('./src/routes/llm');
const settingsRoutes = require('./src/routes/settings');

const app = express();

// Bez CORS: API dostępne wyłącznie same-origin (UI serwowane z tego samego serwera).
// Dzięki temu żadna zewnętrzna strona WWW nie może skanować dysku przez ten serwer.
// Proxy AI przyjmuje większe ciała (prompt z kodem) — rejestrowane przed globalnym limitem.
app.use('/api/llm-proxy', express.json({ limit: '10mb' }));
app.use('/api/review-settings', express.json({ limit: '256kb' }));
app.use(express.json({ limit: '100kb' }));

// UI serwowane wyłącznie z katalogu public/ — nie ujawniamy server.js ani node_modules.
const PUBLIC_DIR = path.join(__dirname, 'public');
// HTML zawsze świeży (bez cache przeglądarki) — zmiany widoczne natychmiast po F5.
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, must-revalidate');
  }
  next();
});
app.use(express.static(PUBLIC_DIR, { index: ['index.html'] }));

// API
app.use('/api', reviewRoutes);
app.use('/api', opencode.router);
app.use('/api', browseRoutes);
app.use('/api', llmRoutes);
app.use('/api', settingsRoutes);

const PORT = 3333;

const server = app.listen(PORT, () => {
  console.log(`🚀 VibeCR działa pod adresem: http://localhost:${PORT}`);
  console.log('📁 Lokalne ustawienia CR: data/review-settings.local.json');
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} jest zajęty — zamknij poprzedni proces VibeCR albo zwolnij port, potem uruchom ponownie.`);
    process.exit(1);
  }
  console.error('❌ Nie udało się uruchomić serwera:', err.message || err);
  process.exit(1);
});

process.on('exit', opencode.shutdown);

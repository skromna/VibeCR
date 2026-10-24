const express = require('express');
const path = require('path');

const reviewRoutes = require('./src/routes/review');
const opencode = require('./src/routes/opencode');
const browseRoutes = require('./src/routes/browse');
const llmRoutes = require('./src/routes/llm');
const settingsRoutes = require('./src/routes/settings');
const auditRoutes = require('./src/routes/audit');

const app = express();
app.disable('x-powered-by');
app.set('env', 'production');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

app.use('/api/llm-proxy', express.json({ limit: '10mb' }));
app.use('/api/security-audit', express.json({ limit: '1mb' }));
app.use('/api/review-settings', express.json({ limit: '256kb' }));
app.use(express.json({ limit: '100kb' }));

const PUBLIC_DIR = path.join(__dirname, 'public');
const SHARED_DIR = path.join(__dirname, 'shared');
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, must-revalidate');
  }
  next();
});
app.use('/shared', express.static(SHARED_DIR));
app.use(express.static(PUBLIC_DIR, { index: ['index.html'] }));

app.use('/api', reviewRoutes);
app.use('/api', opencode.router);
app.use('/api', browseRoutes);
app.use('/api', llmRoutes);
app.use('/api', settingsRoutes);
app.use('/api', auditRoutes);

app.use((err, req, res, next) => {
  const status = err.statusCode
    || err.status
    || (err.type === 'entity.parse.failed' || err.type === 'entity.too.large' ? (err.status || 400) : 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  console.error('Błąd żądania:', err.message);
  if (res.headersSent) return next(err);
  const lang = (req.body && req.body.lang === 'en') || (req.query && req.query.lang === 'en') ? 'en' : 'pl';
  const expose = err.expose === true || (safeStatus >= 400 && safeStatus < 500);
  res.status(safeStatus).json({
    error: expose && err.message
      ? err.message
      : (lang === 'en' ? 'Internal server error.' : 'Wewnętrzny błąd serwera.')
  });
});

const PORT = 3333;

const server = app.listen(PORT, '127.0.0.1', () => {
  console.info(`VibeCR: http://localhost:${PORT}`);
  console.info('Lokalne ustawienia CR: review-settings.local.json (katalog data)');
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

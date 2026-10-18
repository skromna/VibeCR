const express = require('express');
const { execFileSync, spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Wykrywanie lokalnego serwera OpenCode (TUI potrafi nasłuchiwać na losowym porcie,
// dlatego sam port 4096 to za mało — skanujemy porty procesów "opencode" na tej maszynie).
function findOpenCodePorts() {
  const ports = new Set([4096]);
  try {
    if (process.platform === 'win32') {
      const netstat = execFileSync('netstat', ['-ano'], { encoding: 'utf-8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      const tasklist = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf-8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      const opencodePids = new Set(
        tasklist
          .split(/\r?\n/)
          .map((line) => line.split('","').map((c) => c.replace(/"/g, '')))
          .filter((cols) => cols[0] && cols[0].toLowerCase().includes('opencode'))
          .map((cols) => cols[1])
      );
      netstat.split(/\r?\n/).forEach((line) => {
        const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (m && opencodePids.has(m[2])) ports.add(Number(m[1]));
      });
    } else {
      const ss = execFileSync('ss', ['-ltnpH'], { encoding: 'utf-8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      ss.split(/\r?\n/).forEach((line) => {
        if (line.includes('opencode')) {
          const m = line.match(/:(\d+)\s/);
          if (m) ports.add(Number(m[1]));
        }
      });
    }
  } catch (e) {
    // brak netstat/ss nie jest błędem krytycznym — zostaje kandydat 4096
  }
  return [...ports];
}

// Odpytywanie /global/health serwera OpenCode: "ok" | "auth" (401 — złe hasło) | "no"
function probeOpenCode(port, password, username) {
  return new Promise((resolve) => {
    const headers = {};
    if (password) {
      headers.Authorization = 'Basic ' + Buffer.from(`${username || 'opencode'}:${password}`).toString('base64');
    }
    const req = http.get({ host: '127.0.0.1', port, path: '/global/health', headers, timeout: 1500 }, (r) => {
      let body = '';
      r.on('data', (d) => (body += d));
      r.on('end', () => {
        if (r.statusCode === 200 && /healthy|version/i.test(body)) resolve('ok');
        else if (r.statusCode === 401 || r.statusCode === 403) resolve('auth');
        else resolve('no');
      });
    });
    req.on('timeout', () => { req.destroy(); resolve('no'); });
    req.on('error', () => resolve('no'));
  });
}

// Automatyczne wykrycie działającego serwera OpenCode (dowolny lokalny port).
// Próbujemy hasła podanego przez klienta ORAZ hasła z lokalnego środowiska
// (OPENCODE_SERVER_PASSWORD) — TUI generuje je losowo przy każdym uruchomieniu.
router.post('/opencode-detect', async (req, res) => {
  const bodyPassword = typeof req.body.password === 'string' ? req.body.password : '';
  const envPassword = process.env.OPENCODE_SERVER_PASSWORD || '';
  const username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
  const passwords = [...new Set([bodyPassword, envPassword])];

  try {
    const candidates = findOpenCodePorts();
    let authPort = null;
    for (const port of candidates) {
      for (const password of passwords) {
        const status = await probeOpenCode(port, password, username);
        if (status === 'ok') {
          return res.json({
            port,
            baseUrl: `http://127.0.0.1:${port}`,
            authRequired: !!password,
            username,
            password: password || ''
          });
        }
        if (status === 'auth' && !authPort) authPort = port;
      }
    }
    if (authPort) {
      return res.json({
        port: authPort,
        baseUrl: `http://127.0.0.1:${authPort}`,
        authRequired: true,
        username,
        error: `Znaleziono serwer OpenCode na porcie ${authPort}, ale hasło jest nieprawidłowe. Ustaw OPENCODE_SERVER_PASSWORD w środowisku VibeCR albo uruchom: opencode serve --port 4096`
      });
    }
    res.status(404).json({ error: 'Nie znaleziono działającego serwera OpenCode. Uruchom: opencode serve --port 4096' });
  } catch (err) {
    res.status(500).json({ error: `Błąd wykrywania OpenCode: ${err.message}` });
  }
});

// ── Zarządzanie lokalnym serwerem OpenCode (opcjonalne, na żądanie) ──────────
// Pozwala ominąć problem losowego hasła sidecara aplikacji desktop: startujemy
// własny serwer bez Basic auth. Korzysta z tej samej konfiguracji OpenCode,
// więc logowanie do dostawców (w tym OAuth/SSO) działa tak samo.
let managedOpenCode = null;

function findOpenCodeBinary() {
  const candidates = [
    process.env.OPENCODE_BIN,
    process.platform === 'win32'
      ? path.join(os.homedir(), '.opencode', 'bin', 'opencode.exe')
      : path.join(os.homedir(), '.opencode', 'bin', 'opencode')
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'opencode'; // fallback: ze zmiennej PATH
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Start lokalnego serwera OpenCode na porcie 4096 (bez hasła) i oczekiwanie na health
router.post('/opencode-start', async (req, res) => {
  const port = 4096;
  try {
    if (await probeOpenCode(port, '') === 'ok') {
      return res.json({ baseUrl: `http://127.0.0.1:${port}`, alreadyRunning: true });
    }

    if (!managedOpenCode) {
      const bin = findOpenCodeBinary();
      const env = { ...process.env };
      // Bez hasła — żeby VibeCR mógł się połączyć bez znajomości OPENCODE_SERVER_PASSWORD
      delete env.OPENCODE_SERVER_PASSWORD;
      delete env.OPENCODE_SERVER_USERNAME;

      managedOpenCode = spawn(bin, ['serve', '--port', String(port), '--hostname', '127.0.0.1'], {
        cwd: os.homedir(),
        env,
        windowsHide: true,
        stdio: 'ignore'
      });
      managedOpenCode.on('error', (err) => {
        managedOpenCode.spawnError = err;
      });
      managedOpenCode.on('exit', () => {
        managedOpenCode = null;
      });
    }

    for (let i = 0; i < 40; i++) {
      if (managedOpenCode && managedOpenCode.spawnError) {
        return res.status(500).json({
          error: `Nie znaleziono polecenia "opencode" (${managedOpenCode.spawnError.message}). Uruchom ręcznie: opencode serve --port 4096`
        });
      }
      if (await probeOpenCode(port, '') === 'ok') {
        return res.json({ baseUrl: `http://127.0.0.1:${port}`, started: true });
      }
      await delay(500);
    }
    res.status(504).json({ error: 'Serwer OpenCode nie wystartował w 20 s. Spróbuj ręcznie: opencode serve --port 4096' });
  } catch (err) {
    res.status(500).json({ error: `Błąd uruchamiania OpenCode: ${err.message}` });
  }
});

// Zatrzymanie serwera uruchomionego przez VibeCR
router.post('/opencode-stop', (req, res) => {
  if (managedOpenCode) {
    try { managedOpenCode.kill(); } catch (e) { /* ignoruj */ }
    managedOpenCode = null;
    return res.json({ stopped: true });
  }
  res.json({ stopped: false, note: 'VibeCR nie uruchamiał tego serwera.' });
});

// Status lokalnego serwera OpenCode
router.get('/opencode-status', async (req, res) => {
  const running = (await probeOpenCode(4096, '')) === 'ok';
  res.json({ running, managed: !!managedOpenCode, baseUrl: running ? 'http://127.0.0.1:4096' : null });
});

// Sprzątanie: nie zostawiamy osieroconego serwera OpenCode po zamknięciu VibeCR
function shutdown() {
  if (managedOpenCode) {
    try { managedOpenCode.kill(); } catch (e) { /* ignoruj */ }
    managedOpenCode = null;
  }
}

module.exports = { router, shutdown };

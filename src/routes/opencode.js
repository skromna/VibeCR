const express = require('express');
const { execFile, spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { asyncHandler, httpError } = require('../lib/asyncHandler');

const router = express.Router();

function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function findOpenCodePorts() {
  const ports = new Set([4096]);
  try {
    if (process.platform === 'win32') {
      const [netstat, tasklist] = await Promise.all([
        execFileAsync('netstat', ['-ano']),
        execFileAsync('tasklist', ['/FO', 'CSV', '/NH'])
      ]);
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
      const ss = await execFileAsync('ss', ['-ltnpH']);
      ss.split(/\r?\n/).forEach((line) => {
        if (line.includes('opencode')) {
          const m = line.match(/:(\d+)\s/);
          if (m) ports.add(Number(m[1]));
        }
      });
    }
  } catch {
    void 0;
  }
  return [...ports];
}

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

function msg(lang, pl, en) {
  return lang === 'en' ? en : pl;
}

router.post('/opencode-detect', asyncHandler(async (req, res) => {
  const lang = req.body && req.body.lang === 'en' ? 'en' : 'pl';
  const bodyPassword = typeof req.body.password === 'string' ? req.body.password : '';
  const envPassword = process.env.OPENCODE_SERVER_PASSWORD || '';
  const username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
  const passwords = [...new Set(['', bodyPassword, envPassword])];

  try {
    const candidates = await findOpenCodePorts();
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
            passwordProvided: !!envPassword
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
        passwordProvided: false,
        error: msg(
          lang,
          `Znaleziono serwer OpenCode na porcie ${authPort}, ale hasło jest nieprawidłowe. Ustaw OPENCODE_SERVER_PASSWORD w środowisku VibeCR albo uruchom: opencode serve --port 4096`,
          `Found OpenCode on port ${authPort}, but the password is invalid. Set OPENCODE_SERVER_PASSWORD in the VibeCR environment or run: opencode serve --port 4096`
        )
      });
    }
    throw httpError(404, msg(
      lang,
      'Nie znaleziono działającego serwera OpenCode. Uruchom: opencode serve --port 4096',
      'No running OpenCode server found. Start: opencode serve --port 4096'
    ));
  } catch (err) {
    if (err.expose) throw err;
    throw httpError(500, msg(lang, `Błąd wykrywania OpenCode: ${err.message}`, `OpenCode detection error: ${err.message}`));
  }
}));

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
  return 'opencode';
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

router.post('/opencode-start', asyncHandler(async (req, res) => {
  const lang = req.body && req.body.lang === 'en' ? 'en' : 'pl';
  const port = 4096;
  const envPassword = process.env.OPENCODE_SERVER_PASSWORD || '';
  const username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
  try {
    const openProbe = await probeOpenCode(port, envPassword, username);
    if (openProbe === 'ok') {
      return res.json({ baseUrl: `http://127.0.0.1:${port}`, alreadyRunning: true });
    }
    if (openProbe === 'auth' || (await probeOpenCode(port, '', username)) === 'auth') {
      throw httpError(409, msg(
        lang,
        `Port ${port} jest zajęty przez OpenCode wymagający hasła. Ustaw OPENCODE_SERVER_PASSWORD albo zatrzymaj ten proces.`,
        `Port ${port} is occupied by an OpenCode instance that requires a password. Set OPENCODE_SERVER_PASSWORD or stop that process.`
      ));
    }
    const busy = await probeOpenCode(port, '', username);
    if (busy !== 'no' && busy !== 'ok') {
      throw httpError(409, msg(
        lang,
        `Port ${port} jest zajęty. Zatrzymaj istniejący proces albo użyj wykrytego serwera.`,
        `Port ${port} is busy. Stop the existing process or use the detected server.`
      ));
    }

    if (!managedOpenCode) {
      const bin = findOpenCodeBinary();
      const env = { ...process.env };
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
        throw httpError(500, msg(
          lang,
          `Nie znaleziono polecenia "opencode" (${managedOpenCode.spawnError.message}). Uruchom ręcznie: opencode serve --port 4096`,
          `Could not find "opencode" (${managedOpenCode.spawnError.message}). Run manually: opencode serve --port 4096`
        ));
      }
      if (await probeOpenCode(port, '') === 'ok') {
        return res.json({ baseUrl: `http://127.0.0.1:${port}`, started: true });
      }
      await delay(500);
    }
    throw httpError(504, msg(
      lang,
      'Serwer OpenCode nie wystartował w 20 s. Spróbuj ręcznie: opencode serve --port 4096',
      'OpenCode server did not start within 20 s. Try manually: opencode serve --port 4096'
    ));
  } catch (err) {
    if (err.expose) throw err;
    throw httpError(500, msg(lang, `Błąd uruchamiania OpenCode: ${err.message}`, `OpenCode start error: ${err.message}`));
  }
}));

router.post('/opencode-stop', (req, res) => {
  if (managedOpenCode) {
    try { managedOpenCode.kill(); } catch { void 0; }
    managedOpenCode = null;
    return res.json({ stopped: true });
  }
  res.json({ stopped: false, note: 'VibeCR nie uruchamiał tego serwera.' });
});

router.get('/opencode-status', asyncHandler(async (req, res) => {
  const envPassword = process.env.OPENCODE_SERVER_PASSWORD || '';
  const username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
  const running = (await probeOpenCode(4096, envPassword, username)) === 'ok'
    || (await probeOpenCode(4096, '', username)) === 'ok';
  res.json({ running, managed: !!managedOpenCode, baseUrl: running ? 'http://127.0.0.1:4096' : null });
}));

function shutdown() {
  if (managedOpenCode) {
    try { managedOpenCode.kill(); } catch { void 0; }
    managedOpenCode = null;
  }
}

module.exports = { router, shutdown };

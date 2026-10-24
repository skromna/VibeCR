const express = require('express');
const dns = require('dns').promises;
const net = require('net');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

const MAX_BODY = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120000;

function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function errorBody(message) {
  return { error: { message } };
}

function isPrivateOrLocalIp(address) {
  if (!address) return true;
  const ip = String(address).replace(/^::ffff:/i, '').toLowerCase();
  if (ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }
  if (net.isIP(ip) === 6) {
    if (ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
    return false;
  }
  return true;
}

function attachOpenCodeAuth(target, safeHeaders) {
  const host = target.hostname.toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal) return;
  if (safeHeaders.Authorization || safeHeaders.authorization) return;
  const pass = process.env.OPENCODE_SERVER_PASSWORD || '';
  if (!pass) return;
  const user = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
  safeHeaders.Authorization = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

router.post('/llm-proxy', asyncHandler(async (req, res) => {
  if (!isLoopback(req.ip || '')) {
    return res.status(403).json(errorBody('Proxy AI jest dostępne wyłącznie lokalnie.'));
  }

  const { url, method = 'POST', headers = {}, body } = req.body || {};
  if (typeof url !== 'string' || !url) {
    return res.status(400).json(errorBody('Brak adresu URL żądania.'));
  }

  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).json(errorBody('Nieprawidłowy adres URL żądania.'));
  }

  const host = target.hostname.toLowerCase();
  const isLoopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (target.protocol === 'http:') {
    if (!isLoopbackHost) {
      return res.status(400).json(errorBody('Nieszyfrowane połączenie http dozwolone jest tylko dla hostów lokalnych.'));
    }
  } else if (target.protocol !== 'https:') {
    return res.status(400).json(errorBody('Dozwolone są wyłącznie adresy http/https.'));
  }

  if (!isLoopbackHost) {
    let addrs;
    try {
      addrs = await dns.lookup(host, { all: true });
    } catch {
      return res.status(400).json(errorBody('Nie można rozwiązać nazwy hosta.'));
    }
    if (!addrs.length) {
      return res.status(400).json(errorBody('Nie można rozwiązać nazwy hosta.'));
    }
    if (addrs.some((a) => isPrivateOrLocalIp(a.address))) {
      return res.status(400).json(errorBody('Dostęp do sieci prywatnej jest zabroniony.'));
    }
  }

  const safeHeaders = {};
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string') continue;
      const lower = key.toLowerCase();
      if (['host', 'content-length', 'connection', 'origin', 'referer', 'cookie'].includes(lower)) continue;
      safeHeaders[key] = value;
    }
  }
  attachOpenCodeAuth(target, safeHeaders);

  const payload = typeof body === 'string' ? body : (body == null ? undefined : JSON.stringify(body));
  if (payload && Buffer.byteLength(payload) > MAX_BODY) {
    return res.status(413).json(errorBody('Żądanie jest za duże.'));
  }

  const verb = String(method).toUpperCase();
  const sendBody = verb === 'GET' || verb === 'HEAD' ? undefined : payload;

  console.log(`[llm-proxy] ${verb} ${target.origin}${target.pathname}`);

  try {
    const upstream = await fetch(target, {
      method: verb,
      headers: safeHeaders,
      body: sendBody,
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      const snippet = String(text || '').replace(/\s+/g, ' ').slice(0, 240);
      console.log(`[llm-proxy] <- ${upstream.status} ${target.origin}${target.pathname}${snippet ? ` ${snippet}` : ''}`);
    }
    const nullBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(nullBody ? '' : text);
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.code === 'ABORT_ERR');
    res.status(timedOut ? 504 : 502).json(errorBody(
      timedOut
        ? `Przekroczono limit czasu odpowiedzi dostawcy (${host}).`
        : `Błąd połączenia z dostawcą (${host}): ${err.message}`
    ));
  }
}));

module.exports = router;

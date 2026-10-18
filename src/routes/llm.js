const express = require('express');

const router = express.Router();

// Maksymalny rozmiar przekazywanego żądania (prompt z kodem bywa duży).
const MAX_BODY = 10 * 1024 * 1024;

// Proxy działa wyłącznie dla połączeń z tej samej maszyny (localhost) — nie robimy
// z serwera otwartego pośrednika dla sieci lokalnej.
function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function errorBody(message) {
  return { error: { message } };
}

// Przekazuje żądanie do zewnętrznego dostawcy AI (po stronie Node, bez ograniczeń CORS
// przeglądarki). Używane, gdy bezpośrednie połączenie z przeglądarki jest blokowane
// (firmowe proxy/agent, rozszerzenia).
router.post('/llm-proxy', async (req, res) => {
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
    // Nieszyfrowane http tylko do modeli lokalnych.
    if (!isLoopbackHost) {
      return res.status(400).json(errorBody('Nieszyfrowane połączenie http dozwolone jest tylko dla hostów lokalnych.'));
    }
  } else if (target.protocol !== 'https:') {
    return res.status(400).json(errorBody('Dozwolone są wyłącznie adresy http/https.'));
  }

  // Przepuszczamy nagłówki dostawcy, ale odcinamy te, które dotyczą naszej własnej sesji/transportu.
  const safeHeaders = {};
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string') continue;
      const lower = key.toLowerCase();
      if (['host', 'content-length', 'connection', 'origin', 'referer', 'cookie'].includes(lower)) continue;
      safeHeaders[key] = value;
    }
  }

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
      redirect: 'manual'
    });
    if (!upstream.ok) {
      console.log(`[llm-proxy] <- ${upstream.status} ${target.origin}${target.pathname}`);
    }
    const text = await upstream.text();
    const nullBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(nullBody ? '' : text);
  } catch (err) {
    res.status(502).json(errorBody(`Błąd połączenia z dostawcą (${host}): ${err.message}`));
  }
});

module.exports = router;

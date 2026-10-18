import { $, escapeHtml } from './dom.js';
import { LLM_PRESETS, loadLLMConfig, saveLLMConfig } from './storage.js';
import { t } from './i18n.js';

function isNoConnectionError(err) {
  const msg = String(err?.message || '');
  return msg.startsWith(t('errors.noConnectionPrefix')) || msg.startsWith('Brak połączenia') || msg.startsWith('No connection');
}

// Żądania do zewnętrznych dostawców kierujemy przez lokalny serwer VibeCR (same-origin),
// bo przeglądarka bywa blokowana przy bezpośrednich połączeniach (firmowe proxy/agent,
// rozszerzenia). Node używa własnego stosu sieciowego. Ścieżki względne (/api/...) wołamy wprost.
export async function llmFetch(url, options = {}) {
  const origin = url.split('?')[0].split('/').slice(0, 3).join('/');

  if (url.startsWith('/')) {
    try {
      return await fetch(url, options);
    } catch (err) {
      throw new Error(t('errors.noLocalServer', { detail: err.message }));
    }
  }

  try {
    const res = await fetch('/api/llm-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        method: (options.method || 'GET').toUpperCase(),
        headers: options.headers || {},
        body: typeof options.body === 'string' ? options.body : undefined
      })
    });
    const text = await res.text();
    const nullBody = res.status === 204 || res.status === 205 || res.status === 304;
    return new Response(nullBody ? null : text, {
      status: res.status,
      statusText: res.statusText,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' }
    });
  } catch (err) {
    throw new Error(t('errors.noProxyConnection', { origin, detail: err.message }));
  }
}

// Odporny odczyt JSON — serwery AI potrafią zwrócić 401/404 z pustym ciałem,
// co bez tego zamieniało się w enigmatyczne "Unexpected end of JSON input".
export async function readJson(res, context) {
  const text = await res.text();
  if (!text) {
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? t('errors.authHint') : '';
      throw new Error(t('errors.httpEmpty', {
        context,
        status: res.status,
        statusText: res.statusText || '',
        hint
      }).trim());
    }
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${context} — serwer zwrócił nieprawidłową odpowiedź (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

export function openCodeHeaders(config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    const [user, pass] = config.apiKey.includes(':')
      ? [config.apiKey.slice(0, config.apiKey.indexOf(':')), config.apiKey.slice(config.apiKey.indexOf(':') + 1)]
      : ['opencode', config.apiKey];
    headers['Authorization'] = 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)));
  }
  return headers;
}

// Auto-wykrywanie portu lokalnego serwera OpenCode (TUI bywa na losowym porcie, nie 4096).
// Backend VibeCR sprawdza porty procesów "opencode" na tej maszynie.
export async function resolveOpenCodeBaseUrl(config) {
  try {
    const res = await fetch('/api/opencode-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: config.apiKey || '' })
    });
    const data = await res.json();
    const canUse = !!data.baseUrl && (!data.authRequired || data.password);
    if (canUse) {
      $('llmBaseUrl').value = data.baseUrl;
      config.baseUrl = data.baseUrl;
    }
    if (typeof data.password === 'string' && (data.password || !data.authRequired)) {
      // Backend odczytał hasło z lokalnego środowiska (OPENCODE_SERVER_PASSWORD)
      const key = data.username && data.username !== 'opencode' ? `${data.username}:${data.password}` : data.password;
      $('llmApiKey').value = key;
      config.apiKey = key;
      saveLLMConfig();
      return Object.assign({}, data, { appliedPassword: true });
    }
    // Znaleziono tylko serwer wymagający hasła, którego nie znamy — nie nadpisujemy pola,
    // żeby użytkownik nie stracił wpisanego portu, i zwracamy czytelny powód.
    if (data.error && !canUse) return { error: data.error };
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

// Odczyt listy modeli z serwera OpenCode (używane z ponowieniem po auto-detekcji)
export async function fetchOpenCodeProviders(config) {
  const res = await llmFetch(`${config.baseUrl}/config/providers`, { headers: openCodeHeaders(config) });
  const data = await readJson(res, 'OpenCode (lista modeli)');
  if (!res.ok) throw new Error(data?.error?.message || `OpenCode HTTP ${res.status}`);
  return data;
}

// Pobranie listy modeli z lokalnego serwera OpenCode do listy podpowiedzi
export async function refreshOpenCodeModels() {
  const config = saveLLMConfig();
  const status = $('llmTestStatus');
  status.textContent = t('status.fetchModels');
  status.className = 'status-work';
  try {
    let data;
    try {
      data = await fetchOpenCodeProviders(config);
    } catch (firstErr) {
      const det = await resolveOpenCodeBaseUrl(config);
      if (!det.baseUrl || det.error) throw new Error(det.error || firstErr.message);
      data = await fetchOpenCodeProviders(config);
    }

    const options = [];
    for (const provider of data.providers || []) {
      for (const modelId of Object.keys(provider.models || {})) {
        options.push(`<option value="${escapeHtml(provider.id)}/${escapeHtml(modelId)}">`);
      }
    }
    $('llmModelList').innerHTML = options.join('');
    status.textContent = options.length
      ? t('status.modelsFound', { count: options.length })
      : t('status.modelsEmpty');
    status.className = options.length ? 'status-ok' : 'status-err';
  } catch (err) {
    status.textContent = t('status.modelsError', { error: err.message });
    status.className = 'status-err';
  }
}

// Natywne API lokalnego serwera OpenCode (opencode serve): sesja -> prompt -> odpowiedź
export async function openCodeReview(config, prompt) {
  const headers = openCodeHeaders(config);
  const sRes = await llmFetch(`${config.baseUrl}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'VibeCR Review' })
  });
  const session = await readJson(sRes, 'OpenCode (tworzenie sesji)');
  if (!sRes.ok) {
    const hint = sRes.status === 401 || sRes.status === 403 ? t('errors.opencodePasswordHint') : '';
    throw new Error(session?.error?.message
      ? `${session.error.message}${hint}`
      : t('errors.opencodeHttpSession', { status: sRes.status, hint }));
  }

  try {
    const body = { parts: [{ type: 'text', text: prompt }] };
    if (config.model && config.model.includes('/')) {
      const slash = config.model.indexOf('/');
      body.model = { providerID: config.model.slice(0, slash), modelID: config.model.slice(slash + 1) };
    }
    const mRes = await llmFetch(`${config.baseUrl}/session/${session.id}/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await readJson(mRes, 'OpenCode (analiza)');
    if (!mRes.ok) throw new Error(data?.error?.message || t('errors.opencodeHttpPrompt', { status: mRes.status }));
    if (data.info && data.info.error) {
      const err = data.info.error;
      throw new Error(t('errors.opencodeModelError', {
        message: err.data?.message || err.name || t('errors.opencodeModelFallback')
      }));
    }
    const text = (data.parts || []).filter((p) => p.type === 'text').map((p) => p.text || '').join('');
    if (!text.trim()) {
      throw new Error(t('errors.opencodeNoContent'));
    }
    return text;
  } finally {
    // Sprzątnięcie sesji po analizie (niezależnie od wyniku)
    llmFetch(`${config.baseUrl}/session/${session.id}`, { method: 'DELETE', headers }).catch(() => {});
  }
}

// Buduje poprawny adres generateContent, odporny na: brakujące /v1(beta) w Base URL,
// końcowe ukośniki, doklejone /models oraz pusty/wycofany model.
function buildGeminiUrl(config) {
  let base = String(config.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) base = LLM_PRESETS.gemini.baseUrl;
  base = base.replace(/\/models$/, '');
  if (!/\/v1(beta)?$/.test(base)) base += '/v1beta';
  const model = String(config.model || '').trim() || LLM_PRESETS.gemini.model;
  return `${base}/models/${model}:generateContent`;
}

export async function callLLM(config, prompt) {
  const provider = config.provider;

  if (provider === 'gemini') {
    if (!config.apiKey) throw new Error(t('errors.noGeminiKey'));
    const url = buildGeminiUrl(config);
    const res = await llmFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
    });
    const data = await readJson(res, 'Gemini');
    if (!res.ok) throw new Error(data.error?.message || `Gemini HTTP ${res.status}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider === 'claude') {
    if (!config.apiKey) throw new Error(t('errors.noClaudeKey'));
    const res = await llmFetch(`${config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 8000,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await readJson(res, 'Claude');
    if (!res.ok) throw new Error(data.error?.message || `Claude HTTP ${res.status}`);
    return (data.content || []).map((c) => c.text || '').join('');
  }

  if (provider === 'opencode') {
    try {
      return await openCodeReview(config, prompt);
    } catch (err) {
      // Jeśli nie ma połączenia, spróbuj wykryć faktyczny port serwera i powtórz raz
      if (!isNoConnectionError(err)) throw err;
      const det = await resolveOpenCodeBaseUrl(config);
      if (!det.baseUrl || det.error) throw new Error(det.error || err.message);
      return await openCodeReview(config, prompt);
    }
  }

  // openai / ollama / lmstudio — zgodne z OpenAI Chat Completions
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  const res = await llmFetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await readJson(res, 'Model AI');
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content || '';
}

export async function testLLM() {
  const config = saveLLMConfig();
  const status = $('llmTestStatus');
  status.textContent = t('status.testing');
  status.className = 'status-work';
  try {
    if (config.provider === 'opencode') {
      const tryHealth = async (url) => {
        const res = await llmFetch(`${url}/global/health`, { headers: openCodeHeaders(config) });
        const data = await readJson(res, 'OpenCode').catch(() => ({}));
        return { res, data };
      };
      let baseUrl = config.baseUrl;
      let result;
      try {
        result = await tryHealth(baseUrl);
      } catch (connErr) {
        // Pod wpisanym portem nikt nie nasłuchuje — sprawdźmy, czy OpenCode działa pod innym
        const det = await resolveOpenCodeBaseUrl(config);
        if (!det.baseUrl || det.error) throw new Error(det.error || connErr.message);
        baseUrl = det.baseUrl;
        result = await tryHealth(baseUrl);
      }
      if (!result.res.ok || result.data.healthy === false) {
        const det = await resolveOpenCodeBaseUrl(config);
        if (det.baseUrl && !det.error && det.baseUrl !== baseUrl) {
          baseUrl = det.baseUrl;
          result = await tryHealth(baseUrl);
        } else if (det.error) {
          throw new Error(det.error);
        }
      }
      if (!result.res.ok || result.data.healthy === false) {
        throw new Error(result.data?.error?.message || t('errors.opencodeHealth', { status: result.res.status }));
      }
      const wasDetected = baseUrl !== config.baseUrl;
      let port = '';
      try { port = ` (port ${new URL(baseUrl).port})`; } catch {}
      status.textContent = t('status.opencodeConnected', {
        version: result.data.version || '',
        port,
        detected: wasDetected ? t('status.opencodeDetected') : ''
      });
      status.className = 'status-ok';
      return;
    }
    const reply = await callLLM(config, 'Reply with exactly one word: OK');
    status.textContent = t('status.connected', { reply: reply.trim().slice(0, 40) });
    status.className = 'status-ok';
  } catch (err) {
    status.textContent = t('status.error', { error: err.message });
    status.className = 'status-err';
  }
}

// Uruchomienie lokalnego serwera OpenCode przez backend VibeCR (bez hasła, z Twoim SSO)
export async function startOpenCodeServer() {
  const status = $('llmTestStatus');
  status.textContent = t('status.startingOc');
  status.className = 'status-work';
  try {
    const res = await fetch('/api/opencode-start', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    $('llmBaseUrl').value = data.baseUrl;
    $('llmApiKey').value = '';
    saveLLMConfig();
    $('llmStopOpencode').style.display = 'inline';

    status.textContent = data.alreadyRunning
      ? t('status.ocAlreadyRunning')
      : t('status.ocStarted');
    status.className = 'status-ok';
    await testLLM();
  } catch (err) {
    status.textContent = t('status.error', { error: err.message });
    status.className = 'status-err';
  }
}

export async function stopOpenCodeServer() {
  const status = $('llmTestStatus');
  try {
    const res = await fetch('/api/opencode-stop', { method: 'POST' });
    const data = await res.json();
    $('llmStopOpencode').style.display = 'none';
    status.textContent = data.stopped ? t('status.ocStopped') : (data.note || t('status.ocNothingToStop'));
    status.className = 'field-hint';
  } catch (err) {
    status.textContent = t('status.error', { error: err.message });
    status.className = 'status-err';
  }
}

export function syncProviderUi() {
  const isOpencode = $('llmProvider').value === 'opencode';
  $('llmRefreshModels').style.display = isOpencode ? 'inline' : 'none';
  $('llmStartOpencode').style.display = isOpencode ? 'inline' : 'none';
  if (!isOpencode) $('llmStopOpencode').style.display = 'none';
  $('apiKeyHint').textContent = isOpencode
    ? t('ai.apiKeyHintOpencode')
    : t('ai.apiKeyHintLocal');
  if (!isOpencode) {
    $('llmModelList').innerHTML = '';
  }
}

export function applyLLMConfig() {
  const config = loadLLMConfig();
  $('llmProvider').value = config.provider;
  $('llmBaseUrl').value = config.baseUrl || (LLM_PRESETS[config.provider] || {}).baseUrl || '';
  $('llmModel').value = config.model || (LLM_PRESETS[config.provider] || {}).model || '';
  $('llmApiKey').value = config.apiKey || '';
  $('useAIInput').checked = !!config.useAI;
  syncProviderUi();
}

export function onProviderChange() {
  const provider = $('llmProvider').value;
  const preset = LLM_PRESETS[provider];
  if (preset) {
    $('llmBaseUrl').value = preset.baseUrl;
    $('llmModel').value = preset.model;
  }
  syncProviderUi();
  saveLLMConfig();
}

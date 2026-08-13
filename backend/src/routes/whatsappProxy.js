const http2 = require('http2');
const http = require('http');
const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_AUTHORITY, HTTP2_HEADER_STATUS } = http2.constants;

const TARGET_HOST = 'web.whatsapp.com';
const TARGET_ORIGIN = 'https://' + TARGET_HOST;
const PREFIX = '/wa';

// Headers that must not be forwarded / are connection-scoped.
const HOP_BY_HOP = new Set([
  'connection', 'proxy-connection', 'keep-alive', 'transfer-encoding',
  'upgrade', 'proxy-authorization', 'proxy-authenticate',
]);

// Headers that block embedding inside an iframe — strip them.
const STRIP = new Set([
  'content-security-policy', 'content-security-policy-report-only',
  'x-frame-options', 'frame-options', 'cross-origin-opener-policy',
  'cross-origin-resource-policy', 'cross-origin-embedder-policy',
]);

// ---------------------------------------------------------------------------
// Server-side cookie jar.  WhatsApp's anti-bot rejects requests that don't carry
// the session cookie (wa_ul + login cookies).  In a third-party iframe the
// browser often refuses to persist/send those cookies, which makes every
// follow-up request 400.  We capture Set-Cookie from WhatsApp and replay it on
// ALL upstream requests, so the browser never has to manage WhatsApp cookies.
// (Single shared jar — fine for one-org CRM; the WhatsApp Web session is shared.)
// ---------------------------------------------------------------------------
let cookieJar = ''; // "name1=val1; name2=val2"
function mergeSetCookie(setCookieHeader) {
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const map = {};
  if (cookieJar) cookieJar.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) map[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  for (const c of list) {
    const pair = c.split(';')[0];
    const i = pair.indexOf('=');
    if (i > -1) map[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  cookieJar = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

let session = null;
function getSession() {
  if (session && !session.destroyed && session.closed !== true) {
    try { if (session.state !== 'closed') return session; } catch (_) {}
  }
  session = http2.connect(TARGET_ORIGIN, { rejectUnauthorized: true });
  session.on('error', (e) => console.error('[wa-proxy] h2 session error:', e.message));
  session.on('goaway', () => { session = null; });
  session.on('close', () => { if (session && session.closed) session = null; });
  return session;
}

function targetPathFrom(url) {
  const u = url || '/';
  const stripped = u.replace(/^\/wa/, '') || '/';
  return stripped;
}

function buildForwardHeaders(req) {
  const fwd = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk)) continue;
    if (lk === 'host' || lk === 'content-length') continue; // h2 sets these
    // Pass the browser's real Origin/Referer through.  Faking
    // Origin: web.whatsapp.com (tested earlier) trips WhatsApp's anomaly
    // checks and returns 400.  The browser's natural onrender Origin returns 200.
    fwd[k] = v;
  }
  fwd[HTTP2_HEADER_METHOD] = req.method;
  fwd[HTTP2_HEADER_PATH] = targetPathFrom(req.url);
  fwd[HTTP2_HEADER_AUTHORITY] = TARGET_HOST;
  if (!fwd['user-agent']) {
    fwd['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  }
  // Replay the server-side session cookie jar on every upstream request.
  if (cookieJar) fwd['cookie'] = cookieJar;
  return fwd;
}

function proxyHandler(req, res) {
  console.log(`[wa-proxy] >>> ${req.method} ${req.url} origin=${req.headers.origin || '-'} cookie=${req.headers.cookie ? 'len=' + req.headers.cookie.length : 'no'} jar=${cookieJar ? 'len=' + cookieJar.length : 'empty'}`);
  const s = getSession();
  let fwd;
  try {
    fwd = buildForwardHeaders(req);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500);
    return res.end('wa-proxy header error');
  }

  let stream;
  try {
    stream = s.request(fwd);
  } catch (e) {
    console.error('[wa-proxy] request failed:', e.message);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    return res.end('WhatsApp proxy upstream error');
  }

  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.readable) {
    req.pipe(stream);
  } else {
    stream.end();
  }

  let chunks = [];
  stream.on('response', (h2headers) => {
    const status = Number(h2headers[HTTP2_HEADER_STATUS] || 200);
    const out = {};
    const setCookieDebug = [];
    for (const [k, v] of Object.entries(h2headers)) {
      const lk = k.toLowerCase();
      if (lk.startsWith(':')) continue;
      if (HOP_BY_HOP.has(lk)) continue;
      if (STRIP.has(lk)) continue;
      if (lk === 'set-cookie') {
        const arr = Array.isArray(v) ? v : [v];
        arr.forEach((c) => setCookieDebug.push(c.split(';')[0]));
        mergeSetCookie(arr); // capture into server-side jar
        continue; // don't leak WhatsApp cookies to the browser
      }
      if (lk === 'location' && typeof v === 'string' && v.startsWith(TARGET_ORIGIN)) {
        out[k] = v.replace(TARGET_ORIGIN, PREFIX);
      } else {
        out[k] = v;
      }
    }
    if (setCookieDebug.length) console.log(`[wa-proxy] <<< set-cookie: ${setCookieDebug.join(', ')}`);
    console.log(`[wa-proxy] <<< ${req.method} ${req.url} -> ${status} (${out['content-type'] || '?'})`);
    try {
      res.writeHead(status, out);
    } catch (e) {
      console.error('[wa-proxy] writeHead error:', e.message);
    }
    stream.on('data', (d) => { chunks.push(d); res.write(d); });
    stream.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (status >= 400) {
        console.error(`[wa-proxy] <<< UPSTREAM ERROR BODY (${body.length} bytes): ${body.slice(0, 600)}`);
      }
      res.end();
    });
  });

  stream.on('error', (e) => {
    console.error('[wa-proxy] stream error:', e.message);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    if (!res.writableEnded) res.end('WhatsApp proxy stream error');
  });
}

// WebSocket fallback (HTTP/1.1 upgrade) — used if WhatsApp requests a
// relative ws path. Absolute wss:// URLs from the browser connect directly.
function attachWebSocket(server) {
  server.on('upgrade', (req, clientSocket, head) => {
    if (!req.url || !req.url.startsWith(PREFIX)) return;
    const path = targetPathFrom(req.url);
    const headers = { ...req.headers, host: TARGET_HOST };
    if (cookieJar) headers['cookie'] = cookieJar;
    const upstream = http.request({ host: TARGET_HOST, port: 443, path, method: 'GET', headers });
    upstream.on('upgrade', (resUp, upstreamSocket, upgradeHead) => {
      clientSocket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(resUp.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
        '\r\n\r\n'
      );
      if (upgradeHead && upgradeHead.length) upstreamSocket.unshift(upgradeHead);
      if (head && head.length) upstreamSocket.unshift(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
      upstreamSocket.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => upstreamSocket.destroy());
    });
    upstream.on('error', (e) => {
      console.error('[wa-proxy] ws upgrade error:', e.message);
      clientSocket.destroy();
    });
    upstream.end();
  });
}

module.exports = { proxyHandler, attachWebSocket, PREFIX };

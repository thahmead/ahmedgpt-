// Minimal zero-dependency server: serves the UI and proxies chat requests to DeepSeek.
// The API key stays on the server and is never sent to the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env (KEY=VALUE per line) without extra packages
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const APP_NAME = process.env.APP_NAME || 'Chat';
// Set MODEL to use one provider model for both modes (e.g. NVIDIA's deepseek-ai/deepseek-v4.1-flash);
// the Think button then toggles its thinking on and off.
const CUSTOM_MODEL = process.env.MODEL || '';
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 8192;
const MAX_BODY = 25 * 1024 * 1024;
const ALLOWED_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner']);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleChat(req, res) {
  if (!API_KEY) return sendJson(res, 500, { error: 'Server is missing DEEPSEEK_API_KEY. Add it to the .env file and restart.' });

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, e.status || 400, { error: e.message || 'Invalid JSON' });
  }

  const model = ALLOWED_MODELS.has(body.model) ? body.model : 'deepseek-chat';
  const messages = Array.isArray(body.messages)
    ? body.messages
        .filter((m) => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content }))
    : [];
  if (!messages.length) return sendJson(res, 400, { error: 'No messages' });

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  // Open the stream right away and ping while the provider is slow to start,
  // so browsers and proxies don't drop the connection. Errors go out as SSE events.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  const fail = (message) => res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);

  const thinking = model === 'deepseek-reasoner';
  const payload = CUSTOM_MODEL
    ? { model: CUSTOM_MODEL, messages, stream: true, max_tokens: MAX_TOKENS, chat_template_kwargs: { thinking } }
    : { model, messages, stream: true };

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      let msg = `The AI provider returned an error (${upstream.status})`;
      try {
        const j = await upstream.json();
        const detail = j?.error?.message || j?.detail;
        if (detail) msg += `: ${detail}`;
      } catch {}
      fail(msg);
    } else {
      for await (const chunk of upstream.body) res.write(chunk);
    }
  } catch (e) {
    if (!controller.signal.aborted) {
      const timedOut = /timeout/i.test(String(e.cause?.code || e.cause?.name || e.message)) || e.message === 'fetch failed';
      fail(timedOut
        ? 'The model is busy and did not respond in time. Please try again in a minute.'
        : `Could not reach the AI provider: ${e.message}`);
    }
  } finally {
    clearInterval(ping);
    res.end();
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) filePath = path.join(PUBLIC_DIR, 'index.html'); // SPA fallback
    fs.readFile(filePath, (err2, data) => {
      if (err2) return sendJson(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
    if (req.method === 'GET' && req.url === '/api/config') return sendJson(res, 200, { appName: APP_NAME, hasKey: !!API_KEY });
    if (req.method === 'GET') return serveStatic(req, res);
    sendJson(res, 405, { error: 'Method not allowed' });
  })
  .listen(PORT, () => {
    console.log(`${APP_NAME} running at http://localhost:${PORT}`);
    if (!API_KEY) console.log('Warning: DEEPSEEK_API_KEY is not set. Add it to .env');
  });

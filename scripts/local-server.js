import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const API_ROUTES = {
  'POST /api/auth/login': () => import('../api/auth/login.js'),
  'DELETE /api/auth/login': () => import('../api/auth/login.js'),
  'OPTIONS /api/auth/login': () => import('../api/auth/login.js'),
  'GET /api/auth/me': () => import('../api/auth/me.js'),
  'OPTIONS /api/auth/me': () => import('../api/auth/me.js'),
  'GET /api/comments': () => import('../api/comments.js'),
  'POST /api/comments': () => import('../api/comments.js'),
  'PATCH /api/comments': () => import('../api/comments.js'),
  'DELETE /api/comments': () => import('../api/comments.js'),
  'OPTIONS /api/comments': () => import('../api/comments.js'),
  'GET /api/users': () => import('../api/users.js'),
  'OPTIONS /api/users': () => import('../api/users.js'),
  'GET /api/notifications': () => import('../api/notifications.js'),
  'PATCH /api/notifications': () => import('../api/notifications.js'),
  'OPTIONS /api/notifications': () => import('../api/notifications.js'),
  'GET /api/presence': () => import('../api/presence.js'),
  'POST /api/presence': () => import('../api/presence.js'),
  'OPTIONS /api/presence': () => import('../api/presence.js'),
  'POST /api/admin/cleanup': () => import('../api/admin/cleanup.js'),
};

async function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const loader = API_ROUTES[key];

  if (!loader) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const mod = await loader();
  const handler = mod[req.method] || mod[req.method === 'OPTIONS' ? 'OPTIONS' : null];
  if (!handler) {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const body = await readBody(req);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }

  const request = new Request(`http://localhost:${PORT}${url.pathname}${url.search}`, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body,
  });

  const response = await handler(request);

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const text = await response.text();
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString() || undefined));
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') pathname = '/index.html';

  const filePath = join(ROOT, pathname);

  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const data = await readFile(filePath);
  const type = MIME[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      await handleApi(req, res);
    } else {
      await serveStatic(req, res);
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  Local preview running at http://localhost:${PORT}`);
  console.log(`  Sign in at http://localhost:${PORT}/login.html\n`);
});

import { getStore, saveStore } from './lib/store.js';
import { getUser } from './lib/auth.js';

const ACTIVE_MS = 3 * 60 * 1000;

export async function OPTIONS() {
  return cors(null, 204);
}

export async function GET(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const store = await getStore();
  const now = Date.now();
  const online = [];

  for (const entry of Object.values(store.presence || {})) {
    if (!entry?.lastSeen) continue;
    if (now - new Date(entry.lastSeen).getTime() > ACTIVE_MS) continue;
    if (entry.email === user.email.toLowerCase()) continue;
    online.push({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      lastSeen: entry.lastSeen,
    });
  }

  online.sort((a, b) => a.name.localeCompare(b.name));
  return cors(JSON.stringify({ online }), 200);
}

export async function POST(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const store = await getStore();
  if (!store.presence) store.presence = {};

  const email = user.email.toLowerCase();
  store.presence[email] = {
    id: user.id,
    name: user.name,
    email,
    lastSeen: new Date().toISOString(),
  };

  const now = Date.now();
  for (const [key, entry] of Object.entries(store.presence)) {
    if (now - new Date(entry.lastSeen).getTime() > ACTIVE_MS * 2) {
      delete store.presence[key];
    }
  }

  await saveStore(store);
  return cors(JSON.stringify({ ok: true }), 200);
}

function cors(body, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (status === 204) return new Response(null, { status, headers });
  return new Response(body, { status, headers });
}

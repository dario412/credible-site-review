import { getStore, saveStore } from './lib/store.js';
import { getUser } from './lib/auth.js';

export async function OPTIONS() {
  return cors(null, 204);
}

export async function GET(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const store = await getStore();
  const email = user.email.toLowerCase();
  const notifications = (store.notifications || [])
    .filter((n) => n.userEmail === email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const unread = notifications.filter((n) => !n.read).length;
  return cors(JSON.stringify({ notifications, unread }), 200);
}

export async function PATCH(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const body = await request.json();
  const store = await getStore();
  const email = user.email.toLowerCase();

  if (body.markAllRead) {
    for (const n of store.notifications || []) {
      if (n.userEmail === email) n.read = true;
    }
  } else if (body.id) {
    const n = (store.notifications || []).find((x) => x.id === body.id && x.userEmail === email);
    if (n) n.read = true;
  }

  await saveStore(store);
  return cors(JSON.stringify({ ok: true }), 200);
}

function cors(body, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (status === 204) return new Response(null, { status, headers });
  return new Response(body, { status, headers });
}

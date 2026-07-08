import { getStore, saveStore } from '../lib/store.js';
import { cleanupTestData } from '../lib/cleanup.js';

export async function POST(request) {
  const key = request.headers.get('x-admin-key') || '';
  const secret = process.env.JWT_SECRET || '';
  if (!secret || key !== secret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const store = await getStore();
  const result = cleanupTestData(store);
  await saveStore(store);
  return json({ ok: true, ...result }, 200);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

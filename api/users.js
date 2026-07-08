import { getStore } from './lib/store.js';

export async function GET() {
  const store = await getStore();
  const users = store.users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
  }));
  return new Response(JSON.stringify({ users }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

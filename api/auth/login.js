import { getStore, saveStore, newId } from '../lib/store.js';
import { createToken, sessionCookie, clearCookie, getUser } from '../lib/auth.js';

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Valid email is required' }, 400);
    }
    if (!name || name.length < 2) {
      return json({ error: 'Name is required (min 2 characters)' }, 400);
    }

    const store = await getStore();
    let user = store.users.find((u) => u.email === email);

    if (!user) {
      user = {
        id: newId(),
        email,
        name,
        createdAt: new Date().toISOString(),
      };
      store.users.push(user);
    } else {
      user.name = name;
    }

    await saveStore(store);
    const token = await createToken(user);

    return new Response(JSON.stringify({ user, token }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookie(token),
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return json({ error: err.message || 'Login failed' }, 500);
  }
}

export async function DELETE(request) {
  cors(new Response());
  const user = await getUser(request);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie(),
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

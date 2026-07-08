import { getUser } from './lib/auth.js';
import { getStore, saveStore } from './lib/store.js';
import { readScreenshot, saveScreenshot, deleteScreenshot } from './lib/screenshots.js';

export async function OPTIONS() {
  return cors(null, 204);
}

export async function GET(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const url = new URL(request.url);
  const commentId = url.searchParams.get('commentId');
  if (!commentId) return cors(JSON.stringify({ error: 'commentId required' }), 400);

  const store = await getStore();
  const comment = store.comments.find((c) => c.id === commentId);
  if (!comment) return cors(JSON.stringify({ error: 'Not found' }), 404);

  const buffer = await readScreenshot(commentId);
  if (!buffer) return cors(JSON.stringify({ error: 'Screenshot not found' }), 404);

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function POST(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const body = await request.json();
  const commentId = (body.commentId || '').trim();
  const image = body.image || '';

  if (!commentId) return cors(JSON.stringify({ error: 'commentId required' }), 400);
  if (!image) return cors(JSON.stringify({ error: 'image required' }), 400);

  const store = await getStore();
  const comment = store.comments.find((c) => c.id === commentId);
  if (!comment) return cors(JSON.stringify({ error: 'Comment not found' }), 404);

  const base64 = image.includes(',') ? image.split(',')[1] : image;
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length > 4 * 1024 * 1024) {
    return cors(JSON.stringify({ error: 'Screenshot too large' }), 400);
  }

  await saveScreenshot(commentId, buffer);
  comment.screenshot = true;
  await saveStore(store);

  return cors(JSON.stringify({ ok: true, commentId }), 201);
}

export async function DELETE(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const url = new URL(request.url);
  const commentId = url.searchParams.get('commentId');
  if (!commentId) return cors(JSON.stringify({ error: 'commentId required' }), 400);

  const store = await getStore();
  const comment = store.comments.find((c) => c.id === commentId);
  if (!comment) return cors(JSON.stringify({ error: 'Not found' }), 404);
  if (comment.authorId !== user.id) {
    return cors(JSON.stringify({ error: 'Only the author can delete' }), 403);
  }

  await deleteScreenshot(commentId);
  comment.screenshot = false;
  await saveStore(store);

  return cors(JSON.stringify({ ok: true }), 200);
}

function cors(body, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (status === 204) return new Response(null, { status, headers });
  return new Response(body, { status, headers });
}

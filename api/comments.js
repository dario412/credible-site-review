import { getStore, saveStore, newId } from './lib/store.js';
import { getUser } from './lib/auth.js';
import { notifyCommentTagged, notifyReply } from './lib/notifications.js';

export async function OPTIONS() {
  return cors(null, 204);
}

export async function GET() {
  const store = await getStore();
  const comments = [...store.comments].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  return cors(JSON.stringify({ comments }), 200);
}

export async function POST(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const body = await request.json();
  const parentId = (body.parentId || '').trim();
  const text = (body.text || '').trim();
  const tags = Array.isArray(body.tags) ? body.tags : [];

  if (!text) return cors(JSON.stringify({ error: 'Comment text is required' }), 400);

  const store = await getStore();

  if (parentId) {
    const parent = store.comments.find((c) => c.id === parentId);
    if (!parent) return cors(JSON.stringify({ error: 'Comment not found' }), 404);

    if (!parent.replies) parent.replies = [];

    const reply = {
      id: newId(),
      text,
      authorId: user.id,
      authorEmail: user.email,
      authorName: user.name,
      tags: tags.map((t) => ({
        email: (t.email || '').toLowerCase(),
        name: t.name || t.email || '',
      })),
      createdAt: new Date().toISOString(),
    };

    parent.replies.push(reply);

    notifyReply(store, parent, reply, user);

    await saveStore(store);

    const notifyTags = [...tags];
    if (parent.authorEmail !== user.email && !tags.some((t) => t.email === parent.authorEmail)) {
      notifyTags.push({ email: parent.authorEmail, name: parent.authorName, isAuthor: true });
    }

    if (notifyTags.length > 0) {
      await notifyEmail(parent, reply, user, notifyTags, request, true);
    }

    return cors(JSON.stringify({ reply, comment: parent }), 201);
  }

  const page = (body.page || '').trim();
  const x = Number(body.x);
  const y = Number(body.y);
  const scrollY = Number(body.scrollY) || 0;

  if (!page) return cors(JSON.stringify({ error: 'Page is required' }), 400);
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return cors(JSON.stringify({ error: 'Position is required' }), 400);
  }

  const comment = {
    id: newId(),
    page,
    x,
    y,
    scrollY,
    text,
    authorId: user.id,
    authorEmail: user.email,
    authorName: user.name,
    tags: tags.map((t) => ({
      email: (t.email || '').toLowerCase(),
      name: t.name || t.email || '',
    })),
    replies: [],
    resolved: false,
    createdAt: new Date().toISOString(),
  };

  store.comments.push(comment);

  notifyCommentTagged(store, comment, user, comment.tags);

  await saveStore(store);

  if (tags.length > 0) {
    await notifyEmail(comment, comment, user, tags, request, false);
  }

  return cors(JSON.stringify({ comment }), 201);
}

export async function PATCH(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const body = await request.json();
  const { id, resolved, text } = body;
  if (!id) return cors(JSON.stringify({ error: 'Comment id required' }), 400);

  const store = await getStore();
  const comment = store.comments.find((c) => c.id === id);
  if (!comment) return cors(JSON.stringify({ error: 'Not found' }), 404);

  if (typeof resolved === 'boolean') comment.resolved = resolved;
  if (text !== undefined) comment.text = text.trim();

  await saveStore(store);
  return cors(JSON.stringify({ comment }), 200);
}

export async function DELETE(request) {
  const user = await getUser(request);
  if (!user) return cors(JSON.stringify({ error: 'Not authenticated' }), 401);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return cors(JSON.stringify({ error: 'Comment id required' }), 400);

  const store = await getStore();
  const idx = store.comments.findIndex((c) => c.id === id);
  if (idx === -1) return cors(JSON.stringify({ error: 'Not found' }), 404);

  const comment = store.comments[idx];
  if (comment.authorId !== user.id) {
    return cors(JSON.stringify({ error: 'Only the author can delete' }), 403);
  }

  store.comments.splice(idx, 1);
  await saveStore(store);
  return cors(JSON.stringify({ ok: true }), 200);
}

async function notifyEmail(comment, message, author, tags, request, isReply) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const siteUrl = process.env.SITE_URL || `${new URL(request.url).origin}`;

  const link = `${siteUrl}${comment.page}?comment=${comment.id}`;
  const messageText = message.text;
  const seen = new Set();

  for (const tag of tags) {
    const email = (tag.email || '').toLowerCase();
    if (!email || email === author.email || seen.has(email)) continue;
    seen.add(email);

    const subject = tag.isAuthor
      ? `${author.name} replied to your comment`
      : isReply
        ? `${author.name} mentioned you in a reply`
        : `${author.name} tagged you in a review comment`;

    const intro = tag.isAuthor
      ? `<strong>${escapeHtml(author.name)}</strong> replied to your comment on <strong>${escapeHtml(comment.page)}</strong>:`
      : `<strong>${escapeHtml(author.name)}</strong> mentioned you ${isReply ? 'in a reply' : 'in a comment'} on <strong>${escapeHtml(comment.page)}</strong>:`;

    if (!apiKey) {
      console.log(`[notify] Would email ${email}: ${subject}`);
      continue;
    }

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from,
        to: email,
        subject,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 520px;">
            <p>${intro}</p>
            ${isReply && !tag.isAuthor ? `<p style="color:#6B6E75;font-size:14px;">On: "${escapeHtml(comment.text.slice(0, 120))}${comment.text.length > 120 ? '…' : ''}"</p>` : ''}
            <blockquote style="border-left: 3px solid #2A5FA8; margin: 16px 0; padding: 8px 16px; color: #2A2D34;">
              ${escapeHtml(messageText)}
            </blockquote>
            <p><a href="${link}" style="color: #2A5FA8;">View conversation on site →</a></p>
          </div>
        `,
      });
    } catch (err) {
      console.error('Email notify failed:', err.message);
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cors(body, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (status === 204) return new Response(null, { status, headers });
  return new Response(body, { status, headers });
}

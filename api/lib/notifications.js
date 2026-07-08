import { newId } from './ids.js';

export function isTestEmail(email) {
  const e = (email || '').toLowerCase();
  return e.endsWith('@test.com') || e.endsWith('@example.com');
}

export function collectThreadTaggedEmails(comment) {
  const emails = new Set();
  for (const t of comment.tags || []) {
    if (t.email) emails.add(t.email.toLowerCase());
  }
  for (const r of comment.replies || []) {
    for (const t of r.tags || []) {
      if (t.email) emails.add(t.email.toLowerCase());
    }
  }
  return emails;
}

export function addNotification(store, {
  userEmail,
  type,
  commentId,
  page,
  message,
  fromName,
  fromEmail,
  replyId = null,
}) {
  if (!store.notifications) store.notifications = [];
  const email = (userEmail || '').toLowerCase();
  const from = (fromEmail || '').toLowerCase();
  if (!email || email === from) return;

  store.notifications.push({
    id: newId(),
    userEmail: email,
    type,
    commentId,
    replyId,
    page,
    message: message.slice(0, 280),
    fromName,
    fromEmail: from,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export function notifyCommentTagged(store, comment, author, tags) {
  for (const tag of tags) {
    addNotification(store, {
      userEmail: tag.email,
      type: 'tag',
      commentId: comment.id,
      page: comment.page,
      message: comment.text,
      fromName: author.name,
      fromEmail: author.email,
    });
  }
}

export function notifyReply(store, parentComment, reply, author) {
  const authorEmail = author.email.toLowerCase();
  const taggedInThread = collectThreadTaggedEmails(parentComment);

  if (parentComment.authorEmail.toLowerCase() !== authorEmail) {
    addNotification(store, {
      userEmail: parentComment.authorEmail,
      type: 'reply',
      commentId: parentComment.id,
      replyId: reply.id,
      page: parentComment.page,
      message: reply.text,
      fromName: author.name,
      fromEmail: author.email,
    });
  }

  for (const email of taggedInThread) {
    if (email === authorEmail) continue;
    if (email === parentComment.authorEmail.toLowerCase()) continue;
    addNotification(store, {
      userEmail: email,
      type: 'reply_tagged',
      commentId: parentComment.id,
      replyId: reply.id,
      page: parentComment.page,
      message: reply.text,
      fromName: author.name,
      fromEmail: author.email,
    });
  }

  for (const tag of reply.tags || []) {
    if (tag.email === authorEmail) continue;
    addNotification(store, {
      userEmail: tag.email,
      type: 'tag',
      commentId: parentComment.id,
      replyId: reply.id,
      page: parentComment.page,
      message: reply.text,
      fromName: author.name,
      fromEmail: author.email,
    });
  }
}
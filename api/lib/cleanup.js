export function isTestEmail(email) {
  const e = (email || '').toLowerCase();
  return e.endsWith('@test.com') || e.endsWith('@example.com');
}

export function cleanupTestData(store) {
  const testEmails = new Set(
    store.users.filter((u) => isTestEmail(u.email)).map((u) => u.email.toLowerCase())
  );

  store.users = store.users.filter((u) => !isTestEmail(u.email));
  store.comments = store.comments.filter((c) => !testEmails.has(c.authorEmail.toLowerCase()));

  if (store.presence && typeof store.presence === 'object') {
    for (const email of testEmails) delete store.presence[email];
  }

  if (Array.isArray(store.notifications)) {
    store.notifications = store.notifications.filter((n) => !testEmails.has(n.userEmail));
  }

  return {
    removedUsers: testEmails.size,
    remainingUsers: store.users.length,
    remainingComments: store.comments.length,
  };
}

(function () {
  if (!window.ReviewAuth) return;

  const state = {
    commentMode: false,
    sidebarOpen: true,
    comments: [],
    users: [],
    notifications: [],
    unreadCount: 0,
    onlineUsers: [],
    notificationsOpen: false,
    activeBubble: null,
    pendingPin: null,
    highlightId: null,
  };

  const page = currentPage();

  init();

  function currentPage() {
    const p = window.location.pathname.split('/').pop();
    return !p ? 'index.html' : p;
  }

  function samePage(a, b) {
    const norm = (p) => (!p || p === '/' ? 'index.html' : p.replace(/^\//, ''));
    return norm(a) === norm(b);
  }

  async function init() {
    buildUI();
    await loadUsers();
    await loadComments();
    await loadNotifications();
    await loadPresence();
    sendHeartbeat();
    renderPins();
    renderSidebar();
    renderOnlineUsers();
    renderNotificationBadge();
    handleDeepLink();

    setInterval(async () => {
      await loadComments();
      await loadUsers();
      await loadNotifications();
      await loadPresence();
      renderPins();
      renderSidebar();
      renderOnlineUsers();
      renderNotificationBadge();
      if (state.notificationsOpen) renderNotificationsPanel();
    }, 15000);

    setInterval(sendHeartbeat, 30000);
  }

  function buildUI() {
    const user = ReviewAuth.getUser();

    const toolbar = el('div', { class: 'review-toolbar', id: 'review-toolbar' }, [
      el('div', { class: 'review-toolbar-left' }, [
        el('button', {
          class: 'review-btn',
          id: 'review-toggle-sidebar',
          onclick: toggleSidebar,
        }, ['☰ Comments']),
        el('span', { class: 'review-logo' }, ['Review', el('span', {}, ['.'])]),
        el('div', { class: 'review-online-wrap', id: 'review-online-wrap' }),
      ]),
      el('div', { class: 'review-toolbar-right' }, [
        el('button', {
          class: 'review-btn review-btn-primary',
          id: 'review-toggle-mode',
          onclick: toggleCommentMode,
        }, ['＋ Add comment']),
        el('div', { class: 'review-notifications-wrap', id: 'review-notifications-wrap' }, [
          el('button', {
            type: 'button',
            class: 'review-btn review-notifications-btn',
            id: 'review-notifications-btn',
            onclick: toggleNotifications,
          }, ['🔔', el('span', { class: 'review-notifications-badge', id: 'review-notifications-badge' }, [''])]),
          el('div', { class: 'review-notifications-panel', id: 'review-notifications-panel' }),
        ]),
        el('div', { class: 'review-user' }, [
          el('div', { class: 'review-avatar' }, [initials(user.name)]),
          el('span', {}, [user.name]),
        ]),
        el('button', { class: 'review-btn', onclick: () => ReviewAuth.logout() }, ['Sign out']),
      ]),
    ]);

    const sidebar = el('div', { class: 'review-sidebar open', id: 'review-sidebar' }, [
      el('div', { class: 'review-sidebar-header' }, [
        el('h2', {}, ['All comments']),
        el('span', { class: 'review-sidebar-count', id: 'review-count' }, ['0']),
      ]),
      el('div', { class: 'review-sidebar-list', id: 'review-sidebar-list' }),
    ]);

    const pinsLayer = el('div', { class: 'review-pins-layer', id: 'review-pins-layer' });

    document.body.classList.add('review-active', 'review-sidebar-open');
    document.body.appendChild(toolbar);
    document.body.appendChild(sidebar);
    document.body.appendChild(pinsLayer);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeBubble();
        closeNotifications();
        if (state.commentMode) toggleCommentMode();
      }
    });

    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('review-notifications-wrap');
      if (wrap && !wrap.contains(e.target)) closeNotifications();
    });
  }

  function toggleNotifications() {
    state.notificationsOpen = !state.notificationsOpen;
    const panel = document.getElementById('review-notifications-panel');
    if (state.notificationsOpen) {
      panel.classList.add('open');
      renderNotificationsPanel();
    } else {
      panel.classList.remove('open');
    }
  }

  function closeNotifications() {
    state.notificationsOpen = false;
    const panel = document.getElementById('review-notifications-panel');
    if (panel) panel.classList.remove('open');
  }

  async function sendHeartbeat() {
    try {
      await fetch('/api/presence', {
        method: 'POST',
        headers: ReviewAuth.headers(),
      });
    } catch {
      /* ignore */
    }
  }

  async function loadPresence() {
    try {
      const res = await fetch('/api/presence', { headers: ReviewAuth.headers() });
      if (!res.ok) return;
      const data = await res.json();
      state.onlineUsers = data.online || [];
    } catch {
      /* ignore */
    }
  }

  async function loadNotifications() {
    try {
      const res = await fetch('/api/notifications', { headers: ReviewAuth.headers() });
      if (!res.ok) return;
      const data = await res.json();
      state.notifications = data.notifications || [];
      state.unreadCount = data.unread || 0;
    } catch {
      /* ignore */
    }
  }

  function renderOnlineUsers() {
    const wrap = document.getElementById('review-online-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';

    if (!state.onlineUsers.length) {
      wrap.appendChild(el('span', { class: 'review-online-empty' }, ['No one else online']));
      return;
    }

    const label = el('span', { class: 'review-online-label' }, ['Online:']);
    wrap.appendChild(label);

    state.onlineUsers.forEach((u) => {
      wrap.appendChild(el('div', { class: 'review-online-user', title: u.email }, [
        el('span', { class: 'review-online-dot' }),
        el('span', {}, [u.name]),
      ]));
    });
  }

  function renderNotificationBadge() {
    const badge = document.getElementById('review-notifications-badge');
    if (!badge) return;
    if (state.unreadCount > 0) {
      badge.textContent = String(state.unreadCount > 9 ? '9+' : state.unreadCount);
      badge.style.display = 'inline-flex';
    } else {
      badge.textContent = '';
      badge.style.display = 'none';
    }
  }

  function notificationLabel(n) {
    if (n.type === 'tag') return `${n.fromName} tagged you`;
    if (n.type === 'reply') return `${n.fromName} replied to your comment`;
    if (n.type === 'reply_tagged') return `${n.fromName} replied on a thread you're in`;
    return `${n.fromName} notified you`;
  }

  function renderNotificationsPanel() {
    const panel = document.getElementById('review-notifications-panel');
    if (!panel) return;
    panel.innerHTML = '';

    panel.appendChild(el('div', { class: 'review-notifications-header' }, [
      el('strong', {}, ['Notifications']),
      state.unreadCount
        ? el('button', {
          type: 'button',
          class: 'review-notifications-mark-all',
          onclick: markAllNotificationsRead,
        }, ['Mark all read'])
        : null,
    ].filter(Boolean)));

    if (!state.notifications.length) {
      panel.appendChild(el('div', { class: 'review-notifications-empty' }, ['No notifications yet']));
      return;
    }

    const list = el('div', { class: 'review-notifications-list' });
    state.notifications.slice(0, 30).forEach((n) => {
      list.appendChild(el('button', {
        type: 'button',
        class: `review-notification-item${n.read ? '' : ' unread'}`,
        onclick: () => openNotification(n),
      }, [
        el('span', { class: 'review-notification-title' }, [notificationLabel(n)]),
        el('span', { class: 'review-notification-text' }, [n.message]),
        el('span', { class: 'review-notification-time' }, [formatTime(n.createdAt)]),
      ]));
    });
    panel.appendChild(list);
  }

  async function markAllNotificationsRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: ReviewAuth.headers(),
      body: JSON.stringify({ markAllRead: true }),
    });
    await loadNotifications();
    renderNotificationBadge();
    renderNotificationsPanel();
  }

  async function openNotification(n) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: ReviewAuth.headers(),
      body: JSON.stringify({ id: n.id }),
    });
    closeNotifications();
    await loadNotifications();
    renderNotificationBadge();

    const comment = state.comments.find((c) => c.id === n.commentId);
    if (comment) {
      if (samePage(comment.page, page)) {
        scrollToComment(comment);
      } else {
        window.location.href = `${comment.page}?comment=${comment.id}`;
      }
    } else {
      window.location.href = `${n.page}?comment=${n.commentId}`;
    }
  }

  function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    const sidebar = document.getElementById('review-sidebar');
    sidebar.classList.toggle('open', state.sidebarOpen);
    document.body.classList.toggle('review-sidebar-open', state.sidebarOpen);
  }

  function toggleCommentMode() {
    state.commentMode = !state.commentMode;
    const btn = document.getElementById('review-toggle-mode');
    document.body.classList.toggle('review-comment-mode', state.commentMode);
    btn.classList.toggle('review-btn-active', state.commentMode);
    btn.textContent = state.commentMode ? '✕ Cancel' : '＋ Add comment';

    let shield = document.getElementById('review-click-shield');
    if (state.commentMode) {
      if (!shield) {
        shield = el('div', {
          class: 'review-click-shield',
          id: 'review-click-shield',
          onclick: onPageClick,
        });
        document.body.appendChild(shield);
      }
    } else if (shield) {
      shield.remove();
      state.pendingPin = null;
      closeBubble();
    }
  }

  function onPageClick(e) {
    if (!state.commentMode) return;
    e.preventDefault();
    e.stopPropagation();

    const docX = e.clientX + window.scrollX;
    const docY = e.clientY + window.scrollY;
    const x = (docX / document.documentElement.scrollWidth) * 100;
    const y = (docY / document.documentElement.scrollHeight) * 100;

    state.pendingPin = { x, y, scrollY: window.scrollY };
    openNewCommentBubble(e.clientX, e.clientY);
  }

  function openNewCommentBubble(clientX, clientY) {
    const pin = state.pendingPin;
    closeBubble();
    state.pendingPin = pin;

    const bubble = el('div', { class: 'review-bubble', id: 'review-active-bubble' });
    const textarea = el('textarea', {
      placeholder: 'Leave your feedback… Use @name to tag someone',
    });

    const form = el('div', { class: 'review-bubble-form' }, [
      textarea,
      el('div', { class: 'review-bubble-actions' }, [
        el('button', {
          type: 'button',
          class: 'review-btn',
          onclick: (e) => {
            e.stopPropagation();
            state.pendingPin = null;
            closeBubble();
            toggleCommentMode();
          },
        }, ['Cancel']),
        el('button', {
          type: 'button',
          class: 'review-btn review-btn-primary',
          id: 'review-post-btn',
          onclick: (e) => {
            e.stopPropagation();
            submitComment(textarea);
          },
        }, ['Post comment']),
      ]),
    ]);

    bubble.appendChild(form);
    bubble.addEventListener('click', (e) => e.stopPropagation());
    bubble.addEventListener('mousedown', (e) => e.stopPropagation());
    document.body.appendChild(bubble);
    positionBubble(bubble, clientX, clientY);
    setupMentions(textarea, bubble);
    textarea.focus();
    state.activeBubble = bubble;
  }

  async function submitComment(textarea) {
    const text = textarea.value.trim();
    if (!text) {
      alert('Please enter a comment before posting.');
      return;
    }
    if (!state.pendingPin) {
      alert('Comment position was lost. Click Add comment and try again.');
      return;
    }

    const btn = document.getElementById('review-post-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Posting…';
    }

    const tags = parseTags(text);

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: ReviewAuth.headers(),
        body: JSON.stringify({
          page,
          text,
          x: state.pendingPin.x,
          y: state.pendingPin.y,
          scrollY: state.pendingPin.scrollY,
          tags,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to post comment');
      }

      state.pendingPin = null;
      closeBubble();
      toggleCommentMode();
      await loadComments();
      await loadUsers();
      await loadNotifications();
      renderPins();
      renderSidebar();
      renderNotificationBadge();
    } catch (err) {
      alert(err.message || 'Failed to post comment');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Post comment';
      }
    }
  }

  function parseTags(text) {
    const tags = [];
    const sorted = [...state.users].sort((a, b) => b.name.length - a.name.length);
    for (const user of sorted) {
      const escaped = user.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`@${escaped}(?:\\s|$|[.,!?])`, 'i');
      if (pattern.test(text) && !tags.find((t) => t.email === user.email)) {
        tags.push({ email: user.email, name: user.name });
      }
    }
    return tags;
  }

  function setupMentions(textarea, bubble) {
    let dropdown = null;
    let selectedIdx = 0;

    textarea.addEventListener('input', () => {
      const val = textarea.value;
      const pos = textarea.selectionStart;
      const before = val.slice(0, pos);
      const atMatch = before.match(/@([^\s@]*)$/);

      if (!atMatch) {
        removeDropdown();
        return;
      }

      const query = atMatch[1].toLowerCase();
      const matches = state.users.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query)
      ).slice(0, 6);

      if (!matches.length) {
        removeDropdown();
        return;
      }

      removeDropdown();
      selectedIdx = 0;
      dropdown = el('div', { class: 'review-mention-dropdown' });
      matches.forEach((u, i) => {
        const item = el('div', {
          class: `review-mention-item${i === 0 ? ' selected' : ''}`,
          onclick: () => insertMention(u),
        }, [
          el('strong', {}, [u.name]),
          el('span', {}, [u.email]),
        ]);
        dropdown.appendChild(item);
      });

      document.body.appendChild(dropdown);
      const rect = textarea.getBoundingClientRect();
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.top = `${rect.bottom + 4}px`;

      function insertMention(user) {
        const start = before.lastIndexOf('@');
        const after = val.slice(pos);
        textarea.value = `${val.slice(0, start)}@${user.name} ${after}`;
        textarea.focus();
        removeDropdown();
      }

      dropdown._insert = insertMention;
    });

    textarea.addEventListener('keydown', (e) => {
      if (!dropdown) return;
      const items = dropdown.querySelectorAll('.review-mention-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
        items.forEach((it, i) => it.classList.toggle('selected', i === selectedIdx));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        items.forEach((it, i) => it.classList.toggle('selected', i === selectedIdx));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const u = state.users.filter(
          (u) =>
            u.name.toLowerCase().includes((textarea.value.match(/@([^\s@]*)$/) || ['', ''])[1].toLowerCase()) ||
            u.email.toLowerCase().includes((textarea.value.match(/@([^\s@]*)$/) || ['', ''])[1].toLowerCase())
        )[selectedIdx];
        if (u && dropdown._insert) dropdown._insert(u);
      }
    });

    function removeDropdown() {
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
    }
  }

  async function loadComments() {
    try {
      const res = await fetch('/api/comments');
      if (!res.ok) return;
      const data = await res.json();
      state.comments = data.comments || [];
    } catch {
      /* ignore */
    }
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) return;
      const data = await res.json();
      state.users = data.users || [];
    } catch {
      /* ignore */
    }
  }

  function pageComments() {
    return state.comments.filter((c) => samePage(c.page, page));
  }

  function renderPins() {
    const layer = document.getElementById('review-pins-layer');
    layer.innerHTML = '';
    layer.style.height = `${document.documentElement.scrollHeight}px`;

    const comments = pageComments();
    comments.forEach((c, i) => {
      const docW = document.documentElement.scrollWidth;
      const docH = document.documentElement.scrollHeight;
      const left = (c.x / 100) * docW;
      const top = (c.y / 100) * docH;

      const pin = el('div', {
        class: `review-pin${c.resolved ? ' resolved' : ''}${state.highlightId === c.id ? ' highlight' : ''}`,
        style: `left:${left}px;top:${top}px`,
        onclick: (e) => {
          e.stopPropagation();
          openViewBubble(c, e.clientX, e.clientY);
        },
        'data-id': c.id,
      }, [
        el('div', { class: 'review-pin-dot' }, [
          el('span', { class: 'review-pin-number' }, [String(i + 1)]),
        ]),
        (c.replies?.length)
          ? el('span', { class: 'review-pin-replies' }, [String(c.replies.length)])
          : null,
      ].filter(Boolean));

      layer.appendChild(pin);
    });
  }

  function openViewBubble(comment, clientX, clientY, showReplyForm = false) {
    closeBubble();

    const fresh = state.comments.find((c) => c.id === comment.id) || comment;
    const replies = fresh.replies || [];

    const bubble = el('div', {
      class: 'review-bubble review-bubble-thread',
      id: 'review-active-bubble',
    });

    bubble.appendChild(el('div', { class: 'review-bubble-header' }, [
      el('span', { class: 'review-bubble-author' }, [fresh.authorName]),
      el('span', { class: 'review-bubble-time' }, [formatTime(fresh.createdAt)]),
    ]));

    const body = el('div', { class: 'review-bubble-body' }, [
      el('div', { class: 'review-bubble-text' }, [fresh.text]),
    ]);
    if (fresh.tags?.length) {
      body.appendChild(el('div', { class: 'review-bubble-tags' }, fresh.tags.map((t) =>
        el('span', { class: 'review-tag' }, [`@${t.name}`])
      )));
    }
    bubble.appendChild(body);

    if (replies.length) {
      const repliesSection = el('div', { class: 'review-replies' }, [
        el('div', { class: 'review-replies-header' }, [
          `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`,
        ]),
        el('div', { class: 'review-replies-list' }, replies.map((r) =>
          el('div', { class: 'review-reply' }, [
            el('div', { class: 'review-reply-header' }, [
              el('span', { class: 'review-reply-author' }, [r.authorName]),
              el('span', { class: 'review-reply-time' }, [formatTime(r.createdAt)]),
            ]),
            el('div', { class: 'review-reply-text' }, [r.text]),
            r.tags?.length
              ? el('div', { class: 'review-bubble-tags' }, r.tags.map((t) =>
                  el('span', { class: 'review-tag' }, [`@${t.name}`])
                ))
              : null,
          ].filter(Boolean))
        )),
      ]);
      bubble.appendChild(repliesSection);
    }

    const replyFormWrap = el('div', { class: 'review-reply-form', id: 'review-reply-form-wrap' });
    const replyTextarea = el('textarea', {
      placeholder: 'Write a reply… Use @name to tag someone',
    });

    replyFormWrap.appendChild(replyTextarea);
    replyFormWrap.appendChild(el('div', { class: 'review-bubble-actions' }, [
      el('button', {
        type: 'button',
        class: 'review-btn review-btn-primary',
        id: 'review-reply-btn',
        onclick: (e) => {
          e.stopPropagation();
          submitReply(fresh.id, replyTextarea, clientX, clientY);
        },
      }, ['Post reply']),
    ]));

    if (!showReplyForm && !replies.length) {
      bubble.appendChild(el('div', { class: 'review-bubble-resolve' }, [
        el('button', {
          type: 'button',
          class: 'review-reply-toggle',
          onclick: (e) => {
            e.stopPropagation();
            openViewBubble(fresh, clientX, clientY, true);
          },
        }, ['↩ Reply']),
        el('button', {
          type: 'button',
          onclick: () => toggleResolved(fresh),
        }, [fresh.resolved ? 'Reopen' : '✓ Resolve']),
        fresh.authorId === ReviewAuth.getUser()?.id
          ? el('button', { type: 'button', onclick: () => deleteComment(fresh.id) }, ['Delete'])
          : null,
      ].filter(Boolean)));
    } else {
      bubble.appendChild(replyFormWrap);
      bubble.appendChild(el('div', { class: 'review-bubble-resolve' }, [
        el('button', {
          type: 'button',
          onclick: () => toggleResolved(fresh),
        }, [fresh.resolved ? 'Reopen' : '✓ Resolve']),
        fresh.authorId === ReviewAuth.getUser()?.id
          ? el('button', { type: 'button', onclick: () => deleteComment(fresh.id) }, ['Delete'])
          : null,
      ].filter(Boolean)));
    }

    bubble.addEventListener('click', (e) => e.stopPropagation());
    bubble.addEventListener('mousedown', (e) => e.stopPropagation());
    document.body.appendChild(bubble);
    positionBubble(bubble, clientX, clientY);
    setupMentions(replyTextarea, bubble);
    if (showReplyForm || replies.length) replyTextarea.focus();
    state.activeBubble = bubble;
  }

  async function submitReply(parentId, textarea, clientX, clientY) {
    const text = textarea.value.trim();
    if (!text) {
      alert('Please enter a reply before posting.');
      return;
    }

    const btn = document.getElementById('review-reply-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Posting…';
    }

    const tags = parseTags(text);

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: ReviewAuth.headers(),
        body: JSON.stringify({ parentId, text, tags }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to post reply');
      }

      await loadComments();
      await loadNotifications();
      renderPins();
      renderSidebar();
      renderNotificationBadge();

      const updated = state.comments.find((c) => c.id === parentId);
      if (updated) openViewBubble(updated, clientX, clientY, true);
    } catch (err) {
      alert(err.message || 'Failed to post reply');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Post reply';
      }
    }
  }

  async function toggleResolved(comment) {
    await fetch('/api/comments', {
      method: 'PATCH',
      headers: ReviewAuth.headers(),
      body: JSON.stringify({ id: comment.id, resolved: !comment.resolved }),
    });
    closeBubble();
    await loadComments();
    renderPins();
    renderSidebar();
  }

  async function deleteComment(id) {
    if (!confirm('Delete this comment?')) return;
    await fetch(`/api/comments?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: ReviewAuth.headers(),
    });
    closeBubble();
    await loadComments();
    renderPins();
    renderSidebar();
  }

  function renderSidebar() {
    const list = document.getElementById('review-sidebar-list');
    const count = document.getElementById('review-count');
    if (!list) return;

    count.textContent = String(state.comments.length);

    if (!state.comments.length) {
      list.innerHTML = '<div class="review-sidebar-empty">No comments yet.<br>Click <strong>Add comment</strong> to leave feedback.</div>';
      return;
    }

    list.innerHTML = '';
    state.comments.forEach((c) => {
      const replyCount = c.replies?.length || 0;
      const item = el('div', {
        class: `review-sidebar-item${c.resolved ? ' resolved' : ''}${state.highlightId === c.id ? ' active' : ''}`,
        onclick: () => navigateToComment(c),
      }, [
        el('div', { class: 'review-sidebar-item-page' }, [formatPage(c.page)]),
        el('div', { class: 'review-sidebar-item-text' }, [c.text]),
        replyCount
          ? el('div', { class: 'review-sidebar-replies' }, [
              `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`,
            ])
          : null,
        el('div', { class: 'review-sidebar-item-meta' }, [
          el('span', {}, [c.authorName]),
          el('span', {}, [formatTime(c.createdAt)]),
        ]),
      ].filter(Boolean));
      list.appendChild(item);
    });
  }

  function navigateToComment(comment) {
    const target = comment.page + `?comment=${comment.id}`;
    const current = page + window.location.search;

    if (samePage(comment.page, page)) {
      scrollToComment(comment);
    } else {
      window.location.href = target;
    }
  }

  function scrollToComment(comment) {
    state.highlightId = comment.id;
    const docH = document.documentElement.scrollHeight;
    const top = (comment.y / 100) * docH - window.innerHeight / 3;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    renderPins();
    renderSidebar();

    setTimeout(() => {
      const pin = document.querySelector(`.review-pin[data-id="${comment.id}"]`);
      if (pin) pin.click();
    }, 400);

    setTimeout(() => {
      state.highlightId = null;
      renderPins();
      renderSidebar();
    }, 3000);
  }

  function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('comment');
    if (!id) return;

    const comment = state.comments.find((c) => c.id === id);
    if (comment) {
      setTimeout(() => scrollToComment(comment), 300);
    }
  }

  function closeBubble() {
    const bubble = document.getElementById('review-active-bubble');
    if (bubble) bubble.remove();
    document.querySelectorAll('.review-mention-dropdown').forEach((d) => d.remove());
    state.activeBubble = null;
  }

  function positionBubble(bubble, clientX, clientY) {
    const pad = 12;
    const rect = bubble.getBoundingClientRect();
    let left = clientX + pad;
    let top = clientY + pad;

    if (left + 360 > window.innerWidth) left = clientX - 360 - pad;
    if (top + rect.height > window.innerHeight) top = clientY - rect.height - pad;

    bubble.style.position = 'fixed';
    bubble.style.left = `${Math.max(pad, left)}px`;
    bubble.style.top = `${Math.max(pad + 48, top)}px`;
  }

  function formatPage(p) {
    return p.replace('.html', '').replace(/-/g, ' ') || 'home';
  }

  function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function initials(name) {
    return (name || '?')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'class') node.className = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'style') node.setAttribute('style', v);
        else node.setAttribute(k, v);
      });
    }
    const list = children || [];
    list.forEach((child) => {
      if (child == null) return;
      if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    });
    return node;
  }

  window.addEventListener('resize', renderPins);
  window.addEventListener('scroll', () => {
    /* pins are document-positioned, no update needed */
  });
})();

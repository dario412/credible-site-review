import { put, get } from '@vercel/blob';
import { cleanupTestData, isTestEmail } from './cleanup.js';

const BLOB_PATH = 'review-data/store.json';
const EMPTY = { users: [], comments: [], notifications: [], presence: {} };

function isVercel() {
  return Boolean(process.env.VERCEL);
}

function blobOpts() {
  const opts = { access: 'private', useCache: false };
  if (process.env.BLOB_STORE_ID) opts.storeId = process.env.BLOB_STORE_ID;
  if (process.env.BLOB_READ_WRITE_TOKEN) opts.token = process.env.BLOB_READ_WRITE_TOKEN;
  return opts;
}

function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function requireBlobStorage() {
  if (!hasBlobStorage()) {
    throw new Error(
      'Blob storage is not connected. In Vercel: Storage → Blob → Connect to project, then redeploy.'
    );
  }
}

function normalizeStore(raw) {
  return {
    users: Array.isArray(raw?.users) ? raw.users : [],
    comments: Array.isArray(raw?.comments) ? raw.comments : [],
    notifications: Array.isArray(raw?.notifications) ? raw.notifications : [],
    presence: raw?.presence && typeof raw.presence === 'object' ? raw.presence : {},
  };
}

async function streamToText(stream) {
  const reader = stream.getReader();
  const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const length = parts.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(bytes);
}

async function readBlob() {
  requireBlobStorage();
  const opts = blobOpts();
  try {
    const result = await get(BLOB_PATH, opts);
    if (!result || result.statusCode !== 200 || !result.stream) {
      return structuredClone(EMPTY);
    }
    const text = await streamToText(result.stream);
    if (!text) return structuredClone(EMPTY);
    return normalizeStore(JSON.parse(text));
  } catch (err) {
    console.error('[store] readBlob failed:', err.message);
    return structuredClone(EMPTY);
  }
}

async function writeBlob(data) {
  requireBlobStorage();
  const opts = blobOpts();
  const payload = normalizeStore(data);
  await put(BLOB_PATH, JSON.stringify(payload), {
    ...opts,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function getStore() {
  let store;
  if (isVercel() || hasBlobStorage()) {
    store = (await readBlob()) || structuredClone(EMPTY);
  } else {
    const { readFile, writeFile, mkdir } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const localPath = join(dirname(fileURLToPath(import.meta.url)), '../../data/store.json');

    try {
      if (!existsSync(localPath)) {
        await mkdir(dirname(localPath), { recursive: true });
        await writeFile(localPath, JSON.stringify(EMPTY, null, 2));
        store = structuredClone(EMPTY);
      } else {
        store = normalizeStore(JSON.parse(await readFile(localPath, 'utf-8')));
      }
    } catch {
      store = structuredClone(EMPTY);
    }
  }

  const hasTestData =
    store.users.some((u) => isTestEmail(u.email)) ||
    store.comments.some((c) => isTestEmail(c.authorEmail));

  if (hasTestData) {
    cleanupTestData(store);
    await saveStore(store);
  }

  return store;
}

export async function saveStore(data) {
  const payload = normalizeStore(data);
  if (isVercel() || hasBlobStorage()) {
    await writeBlob(payload);
  } else {
    const { writeFile, mkdir } = await import('fs/promises');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const localPath = join(dirname(fileURLToPath(import.meta.url)), '../../data/store.json');
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, JSON.stringify(payload, null, 2));
  }
  return payload;
}

export { newId } from './ids.js';

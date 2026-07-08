import { put, head } from '@vercel/blob';

const BLOB_PATH = 'review-data/store.json';
const EMPTY = { users: [], comments: [] };

function isVercel() {
  return Boolean(process.env.VERCEL);
}

function requireBlobToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is missing. In Vercel: Storage → Blob → Connect to project.'
    );
  }
}

async function readBlob() {
  requireBlobToken();
  try {
    const meta = await head(BLOB_PATH);
    const res = await fetch(meta.url);
    if (!res.ok) return structuredClone(EMPTY);
    return await res.json();
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeBlob(data) {
  requireBlobToken();
  await put(BLOB_PATH, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

export async function getStore() {
  if (isVercel()) {
    return (await readBlob()) || structuredClone(EMPTY);
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return (await readBlob()) || structuredClone(EMPTY);
  }

  // Local fallback only — not used on Vercel
  const { readFile, writeFile, mkdir } = await import('fs/promises');
  const { existsSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const localPath = join(dirname(fileURLToPath(import.meta.url)), '../../data/store.json');

  try {
    if (!existsSync(localPath)) {
      await mkdir(dirname(localPath), { recursive: true });
      await writeFile(localPath, JSON.stringify(EMPTY, null, 2));
      return structuredClone(EMPTY);
    }
    return JSON.parse(await readFile(localPath, 'utf-8'));
  } catch {
    return structuredClone(EMPTY);
  }
}

export async function saveStore(data) {
  if (isVercel() || process.env.BLOB_READ_WRITE_TOKEN) {
    await writeBlob(data);
  } else {
    const { writeFile, mkdir } = await import('fs/promises');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const localPath = join(dirname(fileURLToPath(import.meta.url)), '../../data/store.json');
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, JSON.stringify(data, null, 2));
  }
  return data;
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

import { put, get } from '@vercel/blob';

const PREFIX = 'review-screenshots/';

function isVercel() {
  return Boolean(process.env.VERCEL);
}

function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function blobOpts() {
  const opts = { access: 'private', useCache: false };
  if (process.env.BLOB_STORE_ID) opts.storeId = process.env.BLOB_STORE_ID;
  if (process.env.BLOB_READ_WRITE_TOKEN) opts.token = process.env.BLOB_READ_WRITE_TOKEN;
  return opts;
}

export function screenshotPath(commentId) {
  return `${PREFIX}${commentId}.jpg`;
}

async function streamToBuffer(stream) {
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
  return bytes;
}

async function localPath(commentId) {
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  return join(dirname(fileURLToPath(import.meta.url)), '../../data/screenshots', `${commentId}.jpg`);
}

export async function saveScreenshot(commentId, data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

  if (isVercel() || hasBlobStorage()) {
    await put(screenshotPath(commentId), buffer, {
      ...blobOpts(),
      contentType: 'image/jpeg',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }

  const { writeFile, mkdir } = await import('fs/promises');
  const { dirname } = await import('path');
  const path = await localPath(commentId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
}

export async function readScreenshot(commentId) {
  if (isVercel() || hasBlobStorage()) {
    try {
      const result = await get(screenshotPath(commentId), blobOpts());
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return await streamToBuffer(result.stream);
    } catch {
      return null;
    }
  }

  const { readFile } = await import('fs/promises');
  const { existsSync } = await import('fs');
  const path = await localPath(commentId);
  if (!existsSync(path)) return null;
  return readFile(path);
}

export async function deleteScreenshot(commentId) {
  if (isVercel() || hasBlobStorage()) {
    try {
      const { del } = await import('@vercel/blob');
      await del(screenshotPath(commentId), blobOpts());
    } catch {
      /* ignore */
    }
    return;
  }

  const { unlink } = await import('fs/promises');
  const { existsSync } = await import('fs');
  const path = await localPath(commentId);
  if (existsSync(path)) await unlink(path);
}

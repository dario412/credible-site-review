import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'review_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    if (process.env.VERCEL) {
      throw new Error('JWT_SECRET must be set in Vercel environment variables');
    }
    return new TextEncoder().encode('dev-only-secret-change-me!!');
  }
  return new TextEncoder().encode(s);
}

export async function createToken(user) {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifyToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export function parseAuth(req) {
  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getUser(req) {
  const token = parseAuth(req);
  return verifyToken(token);
}

export function sessionCookie(token) {
  const secure = process.env.VERCEL ? ' Secure;' : '';
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE};${secure}`;
}

export function clearCookie() {
  const secure = process.env.VERCEL ? ' Secure;' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${secure}`;
}

export { COOKIE, MAX_AGE };

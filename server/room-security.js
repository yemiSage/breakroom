import { GameError } from './game.js';

export const tokenPattern = /^[a-f0-9]{32}$/;
export const connectionsPerMember = 2;

// Keep only the current window, with a bounded number of distinct keys.
export function rateWindow(limit, duration, maxKeys = 1024) {
  let resetAt = 0;
  const counts = new Map();
  return key => {
    const now = Date.now();
    if (now >= resetAt) {
      resetAt = now + duration;
      counts.clear();
    }
    const count = counts.get(key) ?? 0;
    if (count >= limit || (!counts.has(key) && counts.size >= maxKeys)) return false;
    counts.set(key, count + 1);
    return true;
  };
}

export function joinLimiter() {
  // A short window lets guests behind a shared address join in batches.
  const allowSource = rateWindow(12, 10_000);
  const allowRoom = rateWindow(40, 10_000, 1);
  return source => {
    if (!allowSource(source) || !allowRoom('room')) {
      throw new GameError(429, 'Too many joins. Wait a few seconds and try again.');
    }
  };
}

function cookieName(request, code, role) {
  return (new URL(request.url).protocol === 'https:' ? '__Secure-' : '') + 'breakroom-' + role + '-' + code;
}

export function requestedRole(request) {
  const role = request.headers.get('X-Breakroom-Role') ?? new URL(request.url).searchParams.get('role');
  return role === 'host' ? 'host' : 'player';
}

export function roomCookie(request, code, role = requestedRole(request)) {
  const name = cookieName(request, code, role);
  for (const cookie of (request.headers.get('Cookie') || '').split(';')) {
    const [key, value] = cookie.trim().split('=');
    if (key === name && tokenPattern.test(value ?? '')) return value;
  }
}

export function roomSession(response, request, code, role, token, maxAge = 86_400) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  response.headers.append('Set-Cookie', cookieName(request, code, role) + '=' + token +
    '; Path=/api/rooms/' + code + '/; Max-Age=' + maxAge + '; HttpOnly; SameSite=Strict' + secure);
  return response;
}

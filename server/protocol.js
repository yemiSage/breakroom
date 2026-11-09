import { GameError, getQuestion, identify, join, move, reveal, snapshot } from './game.js';
import { requestedRole, roomCookie, roomSession, tokenPattern } from './room-security.js';

export const roomRoute = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/(join|state|start|advance|answer|live|lock|remove)$/;
export const resultRoute = /^\/api\/results\/([a-f0-9]{32})$/;
export const imageRoute = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/image\/([0-9]{1,2})$/;
export const pageRoute = /^\/(?:sign-in|host\/[A-HJ-NP-Z2-9]{8}|join(?:\/[A-HJ-NP-Z2-9]{8})?)\/?$/i;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => alphabet[byte & 31]).join('');
export const makeToken = () => crypto.randomUUID().replaceAll('-', '');
export const bearer = request => request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{32})$/)?.[1];
export const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const errorResponse = error => {
  if (error instanceof GameError) return json({ error: error.message }, error.status);
  console.error('Room operation failed', error?.message);
  return json({ error: 'Something went wrong on the quiz server.' }, 500);
};

export function checkOrigin(request, required = false) {
  const origin = request.headers.get('origin');
  if ((required || origin) && origin !== new URL(request.url).origin) {
    throw new GameError(403, 'Open the quiz directly to continue.');
  }
}

export async function readInput(request, limit = 2048) {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) {
    throw new GameError(400, 'A JSON request is required.');
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new GameError(413, 'Request is too large.');
      }
      raw += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(raw + decoder.decode());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch (error) {
    if (error instanceof GameError) throw error;
    throw new GameError(400, 'Invalid JSON request.');
  } finally {
    reader.releaseLock();
  }
}

export function activeRoom(room, now) {
  if (!room || room.expiresAt <= now) throw new GameError(404, 'Room not found or expired. Check the invite with your host.');
  return room;
}

export function questionImage(room, round, token) {
  const active = activeRoom(room, Date.now());
  identify(active, token);
  const image = round <= active.round && getQuestion(active, round)?.image;
  if (!image) throw new GameError(404, 'Question image not found.');
  return new Response(Uint8Array.from(atob(image), char => char.charCodeAt(0)), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store',
      'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' }
  });
}

// Create a candidate state first so a failed write can never affect an active room.
export function handleAction(room, action, input, token, now, admit = () => {}) {
  const { deck, ...roomState } = activeRoom(room, now);
  const next = structuredClone(roomState);
  if (deck) next.deck = deck;
  let member;
  let changed = false;
  if (action === 'join') {
    const attempt = input.attempt;
    if (attempt !== undefined && (typeof attempt !== 'string' || !tokenPattern.test(attempt))) {
      throw new GameError(400, 'Invalid join attempt.');
    }
    const index = next.players.findIndex(player => player.token === token || (attempt && player.attempt === attempt));
    if (index >= 0) {
      if (next.players[index].removed) throw new GameError(403, 'The host removed this player.');
      member = { role: 'player', index };
    } else {
      admit();
      member = join(next, input.name, makeToken(), attempt);
      changed = true;
    }
  } else {
    member = identify(next, token);
  }
  const revealed = reveal(next, now);
  let error;
  try {
    if (action !== 'join' && action !== 'state') changed = move(next, member, action, input, now);
  } catch (problem) {
    if (!(problem instanceof GameError)) throw problem;
    error = problem;
  }
  const audience = revealed || (changed && action !== 'answer') ? 'all' : changed ? 'host' : null;
  return { next, audience, error, state: snapshot(next, member, now),
    playerToken: action === 'join' ? next.players[member.index].token : undefined };
}

export function roomResponse(result, action, request, code) {
  if (result.error) return errorResponse(result.error);
  if (action === 'join') {
    return roomSession(json({ state: result.state }, 201), request, code, 'player', result.playerToken);
  }
  const response = json({ state: result.state });
  const legacy = action === 'state' && bearer(request);
  if (!legacy || roomCookie(request, code)) return response;
  const role = legacy === result.next.host ? 'host' : 'player';
  return roomSession(response, request, code, role, legacy, role === 'host' && result.next.mode === 'local' ? 2_592_000 : undefined);
}

export function actionToken(request, code, action) {
  const cookie = roomCookie(request, code, action === 'join' ? 'player' : requestedRole(request));
  if (cookie && request.method !== 'GET') checkOrigin(request, true);
  return cookie ?? (action === 'state' ? bearer(request) : undefined);
}

export const nextWake = room => room.phase === 'answering'
  ? Math.min(room.deadline, room.expiresAt) : room.expiresAt;

export const stateMessage = (room, member) => JSON.stringify({ type: 'state', state: snapshot(room, member, Date.now()) });

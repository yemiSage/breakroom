import { DurableObject } from 'cloudflare:workers';
import { createPayloadLimit, prepareDeck, recordPayloadLimit } from './deck.js';
import { GameError, identify, newRoom, reveal, snapshot } from './game.js';
import { paraphrase, readParaphrase } from './paraphrase.js';
import { authAvailability } from './auth.js';
import { connectionsPerMember, joinLimiter, roomCookie, roomSession } from './room-security.js';
import { actionToken, bearer, checkOrigin, errorResponse, handleAction, imageRoute, json, makeCode, makeToken,
  nextWake, pageRoute, questionImage, readInput, resultRoute, roomResponse, roomRoute, stateMessage } from './protocol.js';

export { AccountStore } from './account-store.js';

const requestSource = request => request.headers.get('CF-Connecting-IP') || 'local-preview';
const day = 86_400_000;
const dailyRoomBudget = 1000;

async function limit(binding, key, message) {
  if (!binding) throw new GameError(503, 'Online room protection is unavailable.');
  if (!(await binding.limit({ key })).success) throw new GameError(429, message);
}

const authMethods = new Map([
  ['/api/auth/get-session', 'GET'],
  ['/api/auth/ok', 'GET'],
  ['/api/auth/callback/google', 'GET'],
  ['/api/auth/email-otp/send-verification-otp', 'POST'],
  ['/api/auth/sign-in/email-otp', 'POST'],
  ['/api/auth/sign-in/social', 'POST'],
  ['/api/auth/sign-out', 'POST']
]);

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (path.startsWith('/api/auth/')) {
        if (!authMethods.has(path)) throw new GameError(404, 'Unknown sign-in endpoint.');
        if (request.method !== authMethods.get(path)) throw new GameError(405, 'Method not allowed.');
        checkOrigin(request);
        const available = authAvailability(env);
        if (!available.available) {
          if (path === '/api/auth/get-session') return json(null);
          throw new GameError(503, 'Account sign-in is being set up. Please continue as a guest.');
        }
        if (path.includes('email-otp') && !available.email) {
          throw new GameError(503, 'Email sign-in is being set up. Please continue as a guest.');
        }
        if ((path === '/api/auth/sign-in/social' || path === '/api/auth/callback/google') && !available.google) {
          throw new GameError(503, 'Google sign-in is being set up. Please continue as a guest.');
        }
        if (request.method === 'POST') {
          const input = await readInput(request, 4096);
          if (path.endsWith('/send-verification-otp') && input.type !== 'sign-in') {
            throw new GameError(400, 'Request a sign-in code to continue.');
          }
          if (path.endsWith('/social') && input.provider !== 'google') {
            throw new GameError(400, 'Choose Google to continue.');
          }
          request = new Request(request, { body: JSON.stringify(input) });
        }
        return await env.ACCOUNTS.getByName('accounts').fetch(request);
      }
      if (path === '/api/paraphrase') {
        if (request.method !== 'POST') throw new GameError(405, 'Method not allowed.');
        checkOrigin(request);
        if (!env.AI || !env.AI_LIMITER) throw new GameError(503, 'AI rephrasing is unavailable right now.');
        const question = readParaphrase(await readInput(request));
        const limit = await env.AI_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local-preview' });
        if (!limit.success) throw new GameError(429, 'Please wait a minute before rephrasing more questions.');
        return json(await paraphrase(env.AI, question));
      }
      const result = path.match(resultRoute);
      if (result) {
        if (!env.BREAKROOM_RESULTS_KEY || bearer(request) !== env.BREAKROOM_RESULTS_KEY) {
          throw new GameError(403, 'Results access is restricted.');
        }
        if (request.method !== 'GET' && request.method !== 'PUT') throw new GameError(405, 'Method not allowed.');
        return await env.ROOMS.getByName('result:' + result[1]).fetch(request);
      }
      if (path === '/api/config' && request.method === 'GET') {
        return json({ mode: 'online', canHost: true, inviteOrigin: url.origin,
          onlineOrigin: url.origin, localOrigin: 'http://127.0.0.1:8080', aiAvailable: Boolean(env.AI), auth: authAvailability(env) });
      }
      if (path === '/api/rooms' && request.method === 'POST') {
        checkOrigin(request);
        const message = 'Too many rooms are being opened. Try again in a minute.';
        await limit(env.ROOM_CREATE_LIMITER, requestSource(request), message);
        await limit(env.ROOM_CREATE_BUDGET, 'all', message);
        const input = await readInput(request, createPayloadLimit);
        if (input.mode !== 'online') throw new GameError(400, 'Choose Online on this server.');
        const deck = prepareDeck(input.questions, input);
        const budget = await env.ROOMS.getByName('online-room-budget').fetch(new Request(
          url.origin + '/internal/room-budget', { method: 'POST' }
        ));
        if (!budget.ok) return budget;
        const body = JSON.stringify({ deck });
        for (let i = 0; i < 3; i++) {
          const code = makeCode();
          const response = await env.ROOMS.getByName(code).fetch(new Request(url.origin + '/internal/create/' + code, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body
          }));
          if (response.status !== 409) return response;
        }
        throw new GameError(503, 'Could not reserve a room. Try again.');
      }
      const route = path.match(roomRoute) || path.match(imageRoute);
      if (route) {
        checkOrigin(request);
        await limit(env.ROOM_TRAFFIC_LIMITER, requestSource(request), 'Too many room requests. Try again shortly.');
        return await env.ROOMS.getByName(route[1]).fetch(request);
      }
      if (path.startsWith('/api/')) throw new GameError(404, 'Unknown quiz endpoint.');
      if (pageRoute.test(path)) {
        return env.ASSETS.fetch(new Request(url.origin + '/', { method: request.method, headers: request.headers }));
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return errorResponse(error);
    }
  }
};

export class QuizRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.admit = joinLimiter();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async save(room, previousWake) {
    const wake = nextWake(room);
    if (wake === previousWake) {
      await this.ctx.storage.put('room', room);
      return;
    }
    await this.ctx.storage.transaction(async txn => {
      await txn.put('room', room);
      await txn.setAlarm(wake);
    });
  }

  publish(room, audience) {
    for (const ws of this.ctx.getWebSockets(audience === 'host' ? 'host' : undefined)) {
      try {
        const member = ws.deserializeAttachment();
        const player = member.role === 'player' && room.players[member.index];
        if (member.role === 'player' && (!player || player.removed || player.id !== member.playerId)) {
          ws.close(4003, 'Removed from room');
          continue;
        }
        ws.send(stateMessage(room, member));
      } catch {
        ws.close(1011, 'Reconnect to resume');
      }
    }
  }

  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/internal/room-budget' && request.method === 'POST') {
        const allowed = await this.ctx.storage.transaction(async txn => {
          const today = Math.floor(Date.now() / day);
          const budget = await txn.get('creation-budget');
          const count = budget?.today === today ? budget.count : 0;
          if (count >= dailyRoomBudget) return false;
          await txn.put('creation-budget', { today, count: count + 1 });
          return true;
        });
        return allowed ? new Response(null, { status: 204 }) :
          json({ error: 'Online hosting reached its daily room limit. Try again after midnight UTC.' }, 429);
      }
      const result = path.match(resultRoute);
      if (result) {
        if (request.method === 'GET') {
          const record = await this.ctx.storage.get('result');
          return record ? json({ record }) : json({ error: 'Result not found.' }, 404);
        }
        const record = await readInput(request, recordPayloadLimit);
        if (!/^[A-HJ-NP-Z2-9]{8}$/.test(record.code || '') ||
            !Number.isFinite(Date.parse(record.completedAt)) ||
            !Array.isArray(record.questions) || !record.questions.length ||
            !Array.isArray(record.players) || !record.players.length || record.players.length > 100) {
          throw new GameError(400, 'Invalid completed game.');
        }
        return await this.ctx.blockConcurrencyWhile(async () => {
          if (!(await this.ctx.storage.get('result'))) await this.ctx.storage.put('result', record);
          return json({ id: result[1] });
        });
      }
      const create = path.match(/^\/internal\/create\/([A-HJ-NP-Z2-9]{8})$/);
      if (create && request.method === 'POST') {
        const { deck } = await readInput(request, createPayloadLimit);
        return await this.ctx.blockConcurrencyWhile(async () => {
          if (await this.ctx.storage.get('room')) return json({ error: 'Room code in use.' }, 409);
          const token = makeToken();
          const room = newRoom(create[1], 'online', token, Date.now(), { deck });
          await this.save(room);
          const response = json({ state: snapshot(room, { role: 'host' }, Date.now()) }, 201);
          return roomSession(response, request, room.code, 'host', token);
        });
      }
      const image = path.match(imageRoute);
      if (image && request.method === 'GET') {
        return questionImage(await this.ctx.storage.get('room'), Number(image[2]), roomCookie(request, image[1]));
      }
      const route = path.match(roomRoute);
      if (!route) throw new GameError(404, 'Unknown room action.');
      const [, code, action] = route;
      const get = action === 'state' || action === 'live';
      if (request.method !== (get ? 'GET' : 'POST')) throw new GameError(405, 'Method not allowed.');
      const input = get ? {} : await readInput(request);
      if (action === 'live') checkOrigin(request, true);
      const token = actionToken(request, code, action);

      return await this.ctx.blockConcurrencyWhile(async () => {
        try {
          const room = await this.ctx.storage.get('room');
          const result = handleAction(room, action === 'live' ? 'state' : action, input, token, Date.now(),
            () => this.admit(requestSource(request)));
          if (result.audience) {
            await this.save(result.next, nextWake(room));
            this.publish(result.next, result.audience);
          }
          if (action !== 'live') return roomResponse(result, action, request, code);

          if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new GameError(426, 'WebSocket upgrade required.');
          const member = identify(result.next, token);
          if (member.role === 'player') member.playerId = result.next.players[member.index].id;
          const connections = this.ctx.getWebSockets(member.role).filter(ws => {
            const attached = ws.deserializeAttachment();
            return ws.readyState === 1 && attached?.index === member.index && attached?.playerId === member.playerId;
          });
          if (connections.length >= connectionsPerMember) throw new GameError(429, 'Too many connections for this player.');
          const { 0: client, 1: socket } = new WebSocketPair();
          this.ctx.acceptWebSocket(socket, [member.role]);
          socket.serializeAttachment(member);
          socket.send(stateMessage(result.next, member));
          return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'breakroom' } });
        } catch (error) {
          return errorResponse(error);
        }
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get('room');
      if (!room) return;
      const now = Date.now();
      if (room.expiresAt <= now) {
        await this.ctx.storage.deleteAll();
        for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Room expired');
        return;
      }
      if (reveal(room, now)) {
        await this.save(room);
        this.publish(room, 'all');
      } else {
        await this.ctx.storage.setAlarm(nextWake(room));
      }
    });
  }

  webSocketMessage(ws) {
    ws.close(1008, 'Use the quiz API for actions');
  }
}

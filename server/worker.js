import { DurableObject } from 'cloudflare:workers';
import { createPayloadLimit, prepareDeck, recordPayloadLimit } from './deck.js';
import { GameError, identify, newRoom, reveal, snapshot } from './game.js';
import { paraphrase, readParaphrase } from './paraphrase.js';
import { actionToken, bearer, checkOrigin, errorResponse, handleAction, imageRoute, json, makeCode, makeToken,
  nextWake, pageRoute, questionImage, readInput, resultRoute, roomResponse, roomRoute, stateMessage } from './protocol.js';

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
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
          onlineOrigin: url.origin, localOrigin: 'http://127.0.0.1:8080', aiAvailable: Boolean(env.AI) });
      }
      if (path === '/api/rooms' && request.method === 'POST') {
        checkOrigin(request);
        const input = await readInput(request, createPayloadLimit);
        if (input.mode !== 'online') throw new GameError(400, 'Choose Online on this server.');
        const deck = prepareDeck(input.questions, input);
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
        ws.send(stateMessage(room, ws.deserializeAttachment()));
      } catch {
        ws.close(1011, 'Reconnect to resume');
      }
    }
  }

  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
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
          return json({ token, state: snapshot(room, { role: 'host' }, Date.now()) }, 201);
        });
      }
      const image = path.match(imageRoute);
      if (image && request.method === 'GET') {
        return questionImage(await this.ctx.storage.get('room'), Number(image[2]));
      }
      const route = path.match(roomRoute);
      if (!route) throw new GameError(404, 'Unknown room action.');
      const action = route[2];
      const get = action === 'state' || action === 'live';
      if (request.method !== (get ? 'GET' : 'POST')) throw new GameError(405, 'Method not allowed.');
      const input = get ? {} : await readInput(request);
      const token = action === 'live' ? request.headers.get('Sec-WebSocket-Protocol')
        ?.match(/^breakroom,\s*([a-f0-9]{32})$/)?.[1] : actionToken(request, action);

      return await this.ctx.blockConcurrencyWhile(async () => {
        try {
          const room = await this.ctx.storage.get('room');
          const result = handleAction(room, action === 'live' ? 'state' : action, input, token, Date.now());
          if (result.audience) {
            await this.save(result.next, nextWake(room));
            this.publish(result.next, result.audience);
          }
          if (action !== 'live') return roomResponse(result, action, token);

          if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new GameError(426, 'WebSocket upgrade required.');
          if (this.ctx.getWebSockets().length >= 240) throw new GameError(503, 'Too many connections in this room.');
          const member = identify(result.next, token);
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

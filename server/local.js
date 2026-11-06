import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { GameError, newRoom, reveal, snapshot } from './game.js';
import { openArchive } from './archive.js';
import { createPayloadLimit, prepareDeck } from './deck.js';
import { readParaphrase } from './paraphrase.js';
import { actionToken, bearer, checkOrigin, errorResponse, handleAction, json, makeCode, makeToken,
  imageRoute, nextWake, pageRoute, questionImage, readInput, roomResponse, roomRoute, stateMessage } from './protocol.js';

const port = Number(process.env.PORT || 8080);
const onlineOrigin = process.env.BREAKROOM_ONLINE_URL || '';
const hostKey = process.env.BREAKROOM_HOST_KEY;
const demo = process.argv.includes('--demo') || process.env.BREAKROOM_DEMO === '1';
if (hostKey && !/^[a-f0-9]{32}$/.test(hostKey)) {
  throw new Error('BREAKROOM_HOST_KEY must be a 32-character lowercase hex key.');
}
const roomLimit = 50;
const rooms = new Map();
const archive = openArchive(code => {
  const entry = rooms.get(code);
  if (!entry) return;
  entry.room.archiveStatus = 'synced';
  entry.room.revision++;
  publish(entry, 'host');
});
const files = new Map([
  ['/index.html', 'text/html; charset=utf-8'],
  ['/privacy.html', 'text/html; charset=utf-8'],
  ['/style.css', 'text/css; charset=utf-8'],
  ['/app.js', 'text/javascript; charset=utf-8'],
  ['/quiz-setup.js', 'text/javascript; charset=utf-8'],
  ['/answer-labels.js', 'text/javascript; charset=utf-8'],
  ['/sign-in.js', 'text/javascript; charset=utf-8'],
  ['/live.js', 'text/javascript; charset=utf-8'],
  ['/vendor/qrcode-generator.mjs', 'text/javascript; charset=utf-8'],
  ['/hero.svg', 'image/svg+xml'],
  ['/icon.svg', 'image/svg+xml']
].map(([path, type]) => [path, { type, data: readFileSync(new URL('../public' + path, import.meta.url)) }]));

function addresses() {
  return Object.entries(networkInterfaces())
    .sort(([a], [b]) => (a === 'en0' ? -1 : b === 'en0' ? 1 : 0))
    .flatMap(([, list]) => list.filter(address => address.family === 'IPv4' && !address.internal &&
      !address.address.startsWith('169.254.')).map(address => address.address));
}

function requireHost(isHostLaptop, input) {
  if (isHostLaptop) return;
  if (!hostKey) throw new GameError(403, 'Create a Local game from the host laptop.');
  if (typeof input.hostKey !== 'string' || !/^[a-f0-9]{32}$/.test(input.hostKey) ||
      !timingSafeEqual(Buffer.from(input.hostKey), Buffer.from(hostKey))) {
    throw new GameError(403, 'Enter the venue host key to start a game.');
  }
}

function publish(entry, audience) {
  for (const [res, member] of entry.streams) {
    if (audience === 'host' && member.role !== 'host') continue;
    if (!res.write(stateMessage(entry.room, member) + '\n')) res.destroy();
  }
}

function schedule(entry) {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    const now = Date.now();
    if (now >= entry.room.expiresAt) {
      for (const res of entry.streams.keys()) res.end();
      rooms.delete(entry.room.code);
      return;
    }
    if (reveal(entry.room, now)) publish(entry, 'all');
    schedule(entry);
  }, Math.max(0, nextWake(entry.room) - Date.now())).unref();
}

async function respond(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    const host = req.headers.host;
    const interfaces = addresses();
    const allowedHosts = new Set(['localhost', '127.0.0.1', ...interfaces, process.env.BREAKROOM_LAN_HOST].filter(Boolean)
      .map(value => port === 80 ? value : value + ':' + port));
    if (!allowedHosts.has(host)) throw new GameError(403, 'Use the address shown by the Breakroom server.');
    const origin = 'http://' + host;
    const url = new URL(req.url, origin);
    if (url.origin !== origin) throw new GameError(403, 'Open the quiz directly to continue.');
    const { pathname } = url;
    const isHostLaptop = req.socket.remoteAddress === '127.0.0.1';
    const lanHost = process.env.BREAKROOM_LAN_HOST || (interfaces.includes(url.hostname) ? url.hostname : interfaces[0]);
    const inviteOrigin = lanHost ? 'http://' + lanHost + ':' + port : 'http://127.0.0.1:' + port;

    if (req.method === 'GET' && pathname === '/api/config') {
      return await respond(res, json({ mode: 'local', inviteOrigin, lanAvailable: Boolean(lanHost),
        localOrigin: 'http://127.0.0.1:' + port, onlineOrigin, canHost: isHostLaptop || Boolean(hostKey),
        needsHostKey: !isHostLaptop && Boolean(hostKey), demo, aiAvailable: Boolean(onlineOrigin) }));
    }
    if (req.method === 'POST' && pathname === '/api/paraphrase') {
      const request = new Request(url, { method: 'POST', headers: req.headers, body: Readable.toWeb(req), duplex: 'half' });
      checkOrigin(request);
      const input = await readInput(request);
      requireHost(isHostLaptop, input);
      const question = readParaphrase(input);
      if (!onlineOrigin) throw new GameError(503, 'Connect this Local server to Breakroom Online to use AI.');
      const endpoint = new URL('/api/paraphrase', onlineOrigin);
      if (endpoint.protocol !== 'https:') throw new GameError(503, 'Configure an HTTPS Breakroom Online address to use AI.');
      let response;
      let body;
      try {
        response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(question),
          signal: AbortSignal.timeout(25000), redirect: 'error'
        });
        body = await response.json();
      } catch {
        throw new GameError(503, 'Connect the host computer to the internet to use AI rephrasing.');
      }
      if (!response.ok) throw new GameError(response.status, body.error || 'AI rephrasing is unavailable right now.');
      return await respond(res, json(body));
    }
    if (req.method === 'POST' && pathname === '/api/rooms') {
      const request = new Request(url, { method: 'POST', headers: req.headers, body: Readable.toWeb(req), duplex: 'half' });
      checkOrigin(request);
      const input = await readInput(request, createPayloadLimit);
      requireHost(isHostLaptop, input);
      if (input.mode !== 'local') throw new GameError(400, 'Choose Local on this server.');
      const deck = prepareDeck(input.questions, input, demo ? 3 : undefined);
      if (rooms.size >= roomLimit) throw new GameError(503, 'This server has too many active rooms.');
      let code = makeCode();
      while (rooms.has(code) || archive.has(code)) code = makeCode();
      const token = makeToken();
      const room = newRoom(code, 'local', token, Date.now(), {
        deck, ...(demo && { questionCount: 3, duration: 8000 })
      });
      const entry = { room, streams: new Map(), timer: null };
      rooms.set(code, entry);
      schedule(entry);
      return await respond(res, json({ token, state: snapshot(room, { role: 'host' }, Date.now()) }, 201));
    }

    const image = pathname.match(imageRoute);
    if (image && req.method === 'GET') {
      return await respond(res, questionImage(rooms.get(image[1])?.room, Number(image[2])));
    }

    const archiveRoute = pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/results$/);
    if (archiveRoute && req.method === 'GET') {
      const request = new Request(url, { headers: req.headers });
      checkOrigin(request);
      const saved = archive.get(archiveRoute[1], bearer(request));
      if (!saved) throw new GameError(404, 'No saved results are available for this browser.');
      return await respond(res, json(saved));
    }

    const route = pathname.match(roomRoute);
    if (route) {
      const [, code, action] = route;
      const get = action === 'state' || action === 'live';
      if (req.method !== (get ? 'GET' : 'POST')) throw new GameError(405, 'Method not allowed.');
      const request = new Request(url, { method: req.method, headers: req.headers,
        ...(!get && { body: Readable.toWeb(req), duplex: 'half' }) });
      checkOrigin(request);
      const token = actionToken(request, action);
      const input = get ? {} : await readInput(request);
      const entry = rooms.get(code);
      const result = handleAction(entry?.room, action === 'live' ? 'state' : action, input, token, Date.now());
      if (result.audience) {
        const previousWake = nextWake(entry.room);
        if (result.next.phase === 'final' && entry.room.phase !== 'final') {
          result.next.archiveStatus = archive.save(result.next, Date.now());
          result.state.archiveStatus = result.next.archiveStatus;
        }
        entry.room = result.next;
        if (nextWake(entry.room) !== previousWake) schedule(entry);
        publish(entry, result.audience);
      }
      if (action !== 'live') return await respond(res, roomResponse(result, action, token));

      if (entry.streams.size >= 240) throw new GameError(503, 'Too many connections in this room.');
      const member = token === entry.room.host ? { role: 'host' } :
        { role: 'player', index: entry.room.players.findIndex(player => player.token === token) };
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no' });
      entry.streams.set(res, member);
      res.on('close', () => entry.streams.delete(res));
      res.write(stateMessage(entry.room, member) + '\n');
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const file = files.get(pathname === '/' || pageRoute.test(pathname) ? '/index.html' : pathname);
      if (file) {
        res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.data.length,
          'Cache-Control': 'no-cache',
          'Content-Security-Policy': "default-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
        res.end(req.method === 'HEAD' ? undefined : file.data);
        return;
      }
    }
    throw new GameError(404, 'Page not found.');
  } catch (error) {
    if (!res.headersSent && !res.destroyed) await respond(res, errorResponse(error));
    else res.destroy();
  }
});

setInterval(() => {
  for (const entry of rooms.values()) {
    for (const res of entry.streams.keys()) {
      if (!res.write('{"type":"ping"}\n')) res.destroy();
    }
  }
}, 12_000).unref();

server.listen(port, '0.0.0.0', () => {
  console.log('BREAKROOM_READY http://127.0.0.1:' + port);
  for (const host of addresses()) console.log('LAN http://' + host + ':' + port);
});

import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { GameError, getQuestion, join, newRoom, reveal, snapshot } from './game.js';
import { openArchive } from './archive.js';
import { createPayloadLimit, prepareDeck } from './deck.js';
import { readParaphrase } from './paraphrase.js';
import { connectionsPerMember, joinLimiter, rateWindow, roomCookie, roomSession } from './room-security.js';
import { actionToken, bearer, checkOrigin, errorResponse, handleAction, json, makeCode, makeToken,
  imageRoute, nextWake, pageRoute, questionImage, readInput, roomResponse, roomRoute, stateMessage } from './protocol.js';

const port = Number(process.env.PORT || 8080);
const onlineOrigin = process.env.BREAKROOM_ONLINE_URL || '';
const hostKey = process.env.BREAKROOM_HOST_KEY;
const certFile = process.env.BREAKROOM_TLS_CERT;
const keyFile = process.env.BREAKROOM_TLS_KEY;
if (Boolean(certFile) !== Boolean(keyFile)) throw new Error('Set both BREAKROOM_TLS_CERT and BREAKROOM_TLS_KEY for Local HTTPS.');
const scheme = certFile ? 'https' : 'http';
const portSuffix = port === (certFile ? 443 : 80) ? '' : ':' + port;
const hostOrigin = scheme + '://127.0.0.1' + portSuffix;
const demo = process.argv.includes('--demo') || process.env.BREAKROOM_DEMO === '1';
// Simulation adds bot players from the host laptop so one person can run a full game locally.
const simulate = process.argv.includes('--simulate') || process.env.BREAKROOM_SIMULATE === '1';
const botNames = ['Sim Ada', 'Sim Bayo', 'Sim Chidi', 'Sim Dara', 'Sim Efe'];
if (hostKey && !/^[a-f0-9]{32}$/.test(hostKey)) {
  throw new Error('BREAKROOM_HOST_KEY must be a 32-character lowercase hex key.');
}
const roomLimit = 50;
const rooms = new Map();
const allowCreate = rateWindow(10, 60_000);
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
  ['/terms.html', 'text/html; charset=utf-8'],
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
    if (member.role === 'player' && entry.room.players[member.index]?.removed) {
      entry.streams.delete(res);
      res.end();
      continue;
    }
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

function applyResult(entry, result) {
  if (!result.audience) return;
  const previousWake = nextWake(entry.room);
  if (result.next.phase === 'final' && entry.room.phase !== 'final') {
    result.next.archiveStatus = archive.save(result.next, Date.now());
    result.state.archiveStatus = result.next.archiveStatus;
  }
  entry.room = result.next;
  if (nextWake(entry.room) !== previousWake) schedule(entry);
  publish(entry, result.audience);
  scheduleBots(entry);
}

// Each bot answers once per round after a random delay, correct about 65% of the time.
function scheduleBots(entry) {
  const { room } = entry;
  if (!entry.bots?.length || room.phase !== 'answering' || entry.botRound === room.round) return;
  entry.botRound = room.round;
  const round = room.round;
  const question = getQuestion(room, round);
  const window = Math.max(1000, room.deadline - Date.now() - 500);
  for (const bot of entry.bots) {
    const delay = 600 + Math.random() * (window - 600);
    setTimeout(() => {
      if (entry.room.phase !== 'answering' || entry.room.round !== round) return;
      const count = question.options.length;
      const correct = question.correct;
      let choice;
      if (Math.random() < bot.skill) choice = correct;
      else if (Array.isArray(correct)) choice = [Math.floor(Math.random() * count)];
      else choice = (correct + 1 + Math.floor(Math.random() * (count - 1))) % count;
      try {
        applyResult(entry, handleAction(entry.room, 'answer', { round, choice }, bot.token, Date.now()));
      } catch {
        // A bot that misses the window simply skips the round.
      }
    }, delay).unref();
  }
}

function addBots(entry) {
  const { room } = entry;
  if (room.phase !== 'lobby') throw new GameError(409, 'Add test players before the game starts.');
  const next = structuredClone({ ...room, deck: undefined });
  if (room.deck) next.deck = room.deck;
  entry.bots ??= [];
  const taken = new Set(next.players.filter(player => !player.removed).map(player => player.name));
  for (const name of botNames) {
    if (taken.has(name)) continue;
    const token = makeToken();
    join(next, name, token);
    entry.bots.push({ token, skill: 0.45 + Math.random() * 0.4 });
  }
  return { next, audience: 'all', state: snapshot(next, { role: 'host' }, Date.now()) };
}

async function respond(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handleRequest(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    const host = req.headers.host;
    const interfaces = addresses();
    const allowedHosts = new Set(['localhost', '127.0.0.1', ...interfaces, process.env.BREAKROOM_LAN_HOST].filter(Boolean)
      .map(value => value + portSuffix));
    if (!allowedHosts.has(host)) throw new GameError(403, 'Use the address shown by the Breakroom server.');
    const origin = scheme + '://' + host;
    const url = new URL(req.url, origin);
    if (url.origin !== origin) throw new GameError(403, 'Open the quiz directly to continue.');
    const { pathname } = url;
    const isHostLaptop = req.socket.remoteAddress === '127.0.0.1';
    const lanHost = process.env.BREAKROOM_LAN_HOST || (interfaces.includes(url.hostname) ? url.hostname : interfaces[0]);
    const inviteOrigin = lanHost ? scheme + '://' + lanHost + portSuffix : hostOrigin;

    if (req.method === 'GET' && pathname === '/api/config') {
      return await respond(res, json({ mode: 'local', inviteOrigin, lanAvailable: Boolean(lanHost),
        localOrigin: hostOrigin, onlineOrigin, canHost: isHostLaptop || Boolean(hostKey),
        needsHostKey: !isHostLaptop && Boolean(hostKey), demo, simulate: simulate && isHostLaptop,
        aiAvailable: Boolean(onlineOrigin) }));
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
      if (!allowCreate(req.socket.remoteAddress)) throw new GameError(429, 'Too many rooms. Try again in a minute.');
      if (input.mode !== 'local') throw new GameError(400, 'Choose Local on this server.');
      const deck = prepareDeck(input.questions, input, demo ? 3 : undefined);
      if (rooms.size >= roomLimit) throw new GameError(503, 'This server has too many active rooms.');
      let code = makeCode();
      while (rooms.has(code) || archive.has(code)) code = makeCode();
      const token = makeToken();
      const room = newRoom(code, 'local', token, Date.now(), {
        deck, ...(demo && { questionCount: 3, duration: 8000 })
      });
      const entry = { room, streams: new Map(), admit: joinLimiter(), timer: null };
      rooms.set(code, entry);
      schedule(entry);
      const response = json({ state: snapshot(room, { role: 'host' }, Date.now()) }, 201);
      return await respond(res, roomSession(response, request, code, 'host', token, 2_592_000));
    }

    const image = pathname.match(imageRoute);
    if (image && req.method === 'GET') {
      const request = new Request(url, { headers: req.headers });
      checkOrigin(request);
      return await respond(res, questionImage(rooms.get(image[1])?.room, Number(image[2]), roomCookie(request, image[1])));
    }

    const archiveRoute = pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/results$/);
    if (archiveRoute && req.method === 'GET') {
      const request = new Request(url, { headers: req.headers });
      checkOrigin(request);
      const code = archiveRoute[1];
      const cookie = roomCookie(request, code, 'host');
      const token = cookie ?? bearer(request);
      const saved = archive.get(code, token);
      if (!saved) throw new GameError(404, 'No saved results are available for this browser.');
      return await respond(res, cookie ? json(saved) : roomSession(json(saved), request, code, 'host', token, 2_592_000));
    }

    const simRoute = pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/simulate$/);
    if (simRoute && req.method === 'POST') {
      if (!simulate || !isHostLaptop) throw new GameError(404, 'Page not found.');
      const request = new Request(url, { method: 'POST', headers: req.headers });
      checkOrigin(request, true);
      const entry = rooms.get(simRoute[1]);
      if (!entry || entry.room.host !== roomCookie(request, simRoute[1], 'host')) {
        throw new GameError(403, 'Only the host can add test players.');
      }
      const result = addBots(entry);
      applyResult(entry, result);
      return await respond(res, json({ state: result.state }));
    }

    const route = pathname.match(roomRoute);
    if (route) {
      const [, code, action] = route;
      const get = action === 'state' || action === 'live';
      if (req.method !== (get ? 'GET' : 'POST')) throw new GameError(405, 'Method not allowed.');
      const request = new Request(url, { method: req.method, headers: req.headers,
        ...(!get && { body: Readable.toWeb(req), duplex: 'half' }) });
      checkOrigin(request);
      const token = actionToken(request, code, action);
      const input = get ? {} : await readInput(request);
      const entry = rooms.get(code);
      const result = handleAction(entry?.room, action === 'live' ? 'state' : action, input, token, Date.now(),
        () => entry.admit(req.socket.remoteAddress));
      applyResult(entry, result);
      if (action !== 'live') return await respond(res, roomResponse(result, action, request, code));

      const member = token === entry.room.host ? { role: 'host' } :
        { role: 'player', index: entry.room.players.findIndex(player => player.token === token) };
      const connections = [...entry.streams.values()].filter(stream => stream.role === member.role && stream.index === member.index);
      if (connections.length >= connectionsPerMember) throw new GameError(429, 'Too many connections for this player.');
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
        // The browser annotation overlay uses inline styles on local preview pages.
        const isLoopbackPage = isHostLaptop && ['localhost', '127.0.0.1'].includes(url.hostname) &&
          file.type.startsWith('text/html');
        const styleSources = isLoopbackPage ? "'self' 'unsafe-inline'" : "'self'";
        res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.data.length,
          'Cache-Control': 'no-cache',
          'Content-Security-Policy': `default-src 'self'; style-src ${styleSources}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` });
        res.end(req.method === 'HEAD' ? undefined : file.data);
        return;
      }
    }
    throw new GameError(404, 'Page not found.');
  } catch (error) {
    if (!res.headersSent && !res.destroyed) await respond(res, errorResponse(error));
    else res.destroy();
  }
}

const server = certFile
  ? createSecureServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, handleRequest)
  : createServer(handleRequest);

setInterval(() => {
  for (const entry of rooms.values()) {
    for (const res of entry.streams.keys()) {
      if (!res.write('{"type":"ping"}\n')) res.destroy();
    }
  }
}, 12_000).unref();

server.listen(port, '0.0.0.0', () => {
  console.log('BREAKROOM_READY ' + hostOrigin);
  if (simulate) console.log('SIMULATION on: use "Add 5 test players" in the host lobby.');
  for (const host of addresses()) console.log('LAN ' + scheme + '://' + host + portSuffix);
});

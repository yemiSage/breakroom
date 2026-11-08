import { api, follow } from './live.js';
import qrcode from './vendor/qrcode-generator.mjs';
import { openQuizSetup } from './quiz-setup.js';
import { answerLabels } from './answer-labels.js';
import { renderSignIn } from './sign-in.js';

const app = document.querySelector('#app');
const codePattern = /^[A-HJ-NP-Z2-9]{8}$/;
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const normalizeCode = value => String(value).trim().toUpperCase().replace(/[\s-]/g, '');
const read = key => {
  try { return localStorage.getItem('breakroom:' + key); } catch { return null; }
};
const save = (key, value) => {
  try {
    if (value === null) localStorage.removeItem('breakroom:' + key);
    else localStorage.setItem('breakroom:' + key, value);
  } catch {
    // The current tab can still play if browser storage is disabled.
  }
};
const playerKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

let config;
let account;
let session;
let state;
let connected = false;
let busy = false;
let notice = '';
let clockAnchor = 0;
let inviteText = '';
let inviteQr = '';
let joinAttempt;
let showHostLeaderboard = true;
let finaleStep;
const selectedAnswers = new Set();

function button(text, action, { primary = false, disabled = false } = {}) {
  return '<button type="button" class="button' + (primary ? ' primary' : '') + '" data-action="' + action + '"' +
    (disabled ? ' disabled' : '') + '>' + text + '</button>';
}

function tag(text, color = '') {
  return '<span class="tag ' + color + '">' + text + '</span>';
}

function shell(main, side = '') {
  return '<section class="game' + (side ? '' : ' solo') + '"><div class="game-main">' + main +
    '</div>' + (side ? '<aside class="game-side">' + side + '</aside>' : '') + '</section>';
}

function say(message) {
  notice = message;
  const field = document.querySelector('#message');
  if (field) field.textContent = message;
}

function renderLanding() {
  const modes = Array.from(app.querySelectorAll('[name=mode]'));
  const requested = new URLSearchParams(location.search).get('mode');
  const defaultMode = requested === 'local' || requested === 'online' ? requested : config.mode;
  modes.find(option => option.value === defaultMode).checked = true;
  const hostForm = app.querySelector('#host-form');
  const create = app.querySelector('[data-create]');
  const help = app.querySelector('#launch-help');
  const hostAccess = app.querySelector('#host-access');
  const hostKey = hostForm.elements.hostKey;

  function showMode() {
    const selected = modes.find(option => option.checked).value;
    const needsLaptop = selected === 'local' && (config.mode !== 'local' || !config.canHost);
    const needsOnline = selected === 'online' && config.mode === 'local' && !config.onlineOrigin && !read('online-origin');
    const needsKey = selected === 'local' && config.needsHostKey;
    hostAccess.hidden = !needsKey;
    hostKey.disabled = !needsKey;
    hostKey.required = Boolean(needsKey);
    create.disabled = needsOnline || busy;
    create.textContent = needsLaptop ? 'Open on host laptop' : 'Host a game';
    help.innerHTML = needsLaptop
      ? 'Start Breakroom on the host laptop first.'
      : needsOnline
        ? '<form id="online-form"><label class="field-label">ONLINE ADDRESS<input name="origin" type="url" placeholder="https://your-worker.workers.dev" required></label><button class="button">Open Online</button></form>'
        : selected === 'local' && config.demo
          ? '<strong>Demo:</strong> 3 questions, 8 seconds each.'
          : '';
    say('');
  }

  for (const option of modes) option.addEventListener('change', showMode);
  showMode();
  help.addEventListener('submit', event => {
    event.preventDefault();
    const value = new FormData(event.target).get('origin');
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      save('online-origin', url.origin);
      location.href = url.origin + '/?mode=online';
    } catch {
      say('Enter an https:// address.');
    }
  });
  hostForm.addEventListener('submit', event => {
    event.preventDefault();
    const mode = modes.find(option => option.checked).value;
    if (mode === 'local' && (config.mode !== 'local' || !config.canHost)) {
      location.href = config.localOrigin + '/?mode=local';
      return;
    }
    if (mode === 'online' && config.mode === 'local') {
      const origin = config.onlineOrigin || read('online-origin');
      try {
        const url = new URL(origin);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
        location.href = url.origin + '/?mode=online';
      } catch {
        save('online-origin', null);
        showMode();
        say('Enter an https:// address.');
      }
      return;
    }
    const landing = app.firstElementChild;
    const key = hostKey.disabled ? undefined : hostKey.value.trim();
    openQuizSetup(app, async (questions, settings) => {
      const data = { mode, hostKey: key, questions, ...settings };
      const { token, state: initial } = await api('/api/rooms', { data });
      save('host:' + initial.code, token);
      history.pushState({}, '', '/host/' + initial.code);
      openRoom(initial.code, token, 'host', initial);
    }, () => {
      app.replaceChildren(landing);
      create.focus();
    }, config.aiAvailable ? async input => api('/api/paraphrase', {
      data: { ...input, hostKey: key }, signal: AbortSignal.timeout(30000)
    }) : undefined);
  });
}

function renderJoin(code, message = '') {
  document.body.classList.add('player-view');
  app.innerHTML = shell(
    (code
      ? tag('ROOM ' + code, 'green') + '<h1>What’s your name?</h1>' +
        '<form id="player-form"><label class="field-label">YOUR NAME<input name="name" autocomplete="nickname" maxlength="24" placeholder="Trivia Goblin" required></label>' +
        '<button class="button primary">Join</button></form>'
      : '<h1>Join a game</h1>' +
        '<form id="code-form"><label class="field-label">ROOM CODE<input name="code" autocomplete="off" autocapitalize="characters" maxlength="12" placeholder="ABCD2345" required></label>' +
        '<button class="button primary">Next</button></form>' +
        '<p class="hint">Local game? Join the host’s Wi-Fi first.</p>') +
    '<p class="notice" id="message" role="status"></p>');
  say(message);
  if (account && code) app.querySelector('[name=name]').value = account.name.slice(0, 24);
  if (!code) {
    app.querySelector('#code-form').addEventListener('submit', event => {
      event.preventDefault();
      const entered = normalizeCode(new FormData(event.target).get('code'));
      if (!codePattern.test(entered)) return say('Enter the 8-character code from your host.');
      location.href = '/join/' + entered;
    });
    return;
  }
  app.querySelector('#player-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const form = event.target;
    const name = new FormData(form).get('name');
    const submit = form.querySelector('button');
    joinAttempt ||= read('attempt:' + code) || playerKey();
    save('attempt:' + code, joinAttempt);
    busy = true;
    submit.disabled = true;
    say('');
    try {
      const { token, state: initial } = await api('/api/rooms/' + code + '/join', { token: joinAttempt, data: { name } });
      save('player:' + code, token);
      save('attempt:' + code, null);
      busy = false;
      openRoom(code, token, 'player', initial);
    } catch (error) {
      say(error.message);
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });
}

function leaderboardToggle() {
  const label = showHostLeaderboard ? 'Hide leaderboard' : 'Show leaderboard';
  return '<button type="button" class="leaderboard-toggle" data-action="leaderboard" aria-controls="host-leaderboard"' +
    ' aria-expanded="' + showHostLeaderboard + '" aria-label="' + label + '" title="' + label + '">' +
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>' +
    (showHostLeaderboard ? '' : '<path d="m3 3 18 18"/>') + '</svg></button>';
}

function leaderboard(rows, final, start = 0) {
  let rank = 1;
  const host = session.role === 'host';
  const items = rows.map((player, index) => {
    if (index > 0 && player.score !== rows[index - 1].score) rank = index + 1;
    return '<li' + (player.you ? ' class="you"' : '') + '><span class="rank">#' + rank + '</span><span>' +
      escape(player.name) + (player.you ? ' (you)' : '') + '</span><strong>' + player.score + ' pts</strong></li>';
  }).slice(start).join('');
  return '<div class="leaderboard-heading">' + (host ? leaderboardToggle() : '') +
    '<h2>' + (final ? 'Final standings' : 'Leaderboard') + '</h2></div><ol class="scores"' +
    (host ? ' id="host-leaderboard"' + (showHostLeaderboard ? '' : ' hidden') : '') + '>' + items + '</ol>';
}

function invite() {
  return '<p class="meta">ROOM CODE</p><p class="room-code">' + session.code + '</p>' +
    (config.mode === 'online' ? '' : '<p class="hint">' + (config.lanAvailable ? 'Players must be on your Wi-Fi.'
      : 'No network found. Connect this laptop to Wi-Fi.') + '</p>') +
    (state.phase === 'lobby' && inviteQr
      ? '<figure class="invite-qr">' + inviteQr + '<figcaption>Scan to join</figcaption></figure>'
      : '') +
    '<a class="invite" href="' + escape(inviteText) + '" target="_blank" rel="noopener noreferrer">' + escape(inviteText) + '</a>' +
    button('Copy link', 'copy', { primary: true });
}

function lobby(host) {
  if (host) {
    const roster = state.roster.length ? '<ul class="roster">' +
      state.roster.map(name => '<li>' + escape(name) + '</li>').join('') + '</ul>'
      : '<p class="hint">No one yet.</p>';
    return {
      main: '<h1>Waiting for players</h1>' +
        '<h2>' + state.playerCount + ' / ' + state.capacity + ' joined</h2>' + roster +
        button('Start game', 'start',
          { primary: true, disabled: !connected || busy || !state.playerCount }),
      side: invite()
    };
  }
  return {
    main: '<h1>You’re in, ' + escape(state.you.name) + '.</h1><p>The host will start soon.</p>' +
      tag(state.playerCount + (state.playerCount === 1 ? ' PLAYER' : ' PLAYERS'), 'green')
  };
}

function roundScreen(host) {
  const { question, phase, round, you } = state;
  const reveal = phase === 'reveal';
  const selected = you?.choice;
  const multiple = question.selection === 'multiple';
  const awaiting = !reveal && !host && selected === null;
  const labels = answerLabels[question.optionStyle] ?? answerLabels.alphabet;
  const answers = question.options.map((option, i) => {
    const correct = reveal && (multiple ? question.correct.includes(i) : question.correct === i);
    const picked = Array.isArray(selected) ? selected.includes(i) : selected === i;
    const toggled = awaiting && multiple && selectedAnswers.has(i);
    const css = 'answer' + (correct ? ' correct' : picked && reveal ? ' incorrect' : picked || toggled ? ' selected' : '');
    const content = '<span class="letter" role="img" aria-label="' + labels[i].name + '">' + labels[i].symbol + '</span><strong>' + escape(option) +
      (correct ? ' · Correct' : picked ? ' · Your answer' : '') + '</strong>';
    if (awaiting) return '<button class="' + css + '" data-action="' + (multiple ? 'toggle' : 'answer') +
      '" data-choice="' + i + '"' + (multiple ? ' aria-pressed="' + toggled + '"' : '') +
      (!connected || busy ? ' disabled' : '') + '>' + content + '</button>';
    return '<div class="' + css + '">' + content + '</div>';
  }).join('');
  const meta = '<span class="meta">' + (round + 1) + ' / ' + state.questionCount + ' · ' +
    escape(question.category.toUpperCase()) + '</span>';
  const timer = reveal ? '' : '<span class="timer" id="countdown" aria-label="Time remaining"></span>';
  let feedback = '';
  if (reveal) {
    const gotIt = multiple ? Array.isArray(selected) && selected.length === question.correct.length &&
      selected.every(choice => question.correct.includes(choice)) : selected === question.correct;
    const headline = host ? 'Answer revealed' : selected === null ? 'Time’s up' :
      gotIt ? 'Correct! +100' : 'Not this time';
    feedback = '<div class="feedback" role="status"><p><strong>' + headline + '</strong></p>' +
      (question.fact ? '<p>' + escape(question.fact) + '</p>' : '') + '</div>';
  } else if (host) {
    feedback = '<p><strong>' + state.answeredCount + ' / ' + state.playerCount + '</strong> answered</p>';
  } else if (selected !== null) {
    feedback = '<div class="feedback" role="status"><p><strong>Locked in.</strong></p></div>';
  } else {
    feedback = multiple ? button('Lock in', 'submit-multiple',
      { primary: true, disabled: !connected || busy || !selectedAnswers.size }) :
      '<p id="answer-hint" class="hint">Tap an answer.</p>';
  }
  if (reveal && host) {
    feedback += button(round + 1 === state.questionCount ? 'Show results' : 'Next question', 'advance',
      { primary: true, disabled: !connected || busy });
  } else if (reveal) {
    feedback += '<p class="hint">Waiting for the host…</p>';
  }
  const side = host ? leaderboard(state.leaderboard, false) : '';
  const image = question.hasImage ? '<img class="question-image" src="' + session.path + '/image/' + round +
    '" alt="Image for this question">' : '';
  const hint = awaiting && multiple ? '<p id="answer-hint" class="hint">Pick all that apply.</p>' : '';
  return {
    main: '<div class="question-head">' + meta + timer + '</div>' +
      (reveal ? '' : '<progress id="timebar" max="' + state.duration + '" aria-label="Time remaining"></progress>') +
      '<h1 class="question-title">' + escape(question.text) + '</h1>' + image + hint +
      '<div class="answers">' + answers + '</div>' + feedback,
    side
  };
}

function currentFinaleStep() {
  const elapsed = state.finalStartedAt ? Math.max(0, performance.now() + clockAnchor - state.finalStartedAt) : Infinity;
  if (elapsed < 3000) return -Math.ceil((3000 - elapsed) / 1000);
  return Math.min(Math.min(3, state.leaderboard.length) + 1, 1 + Math.floor((elapsed - 3000) / 2000));
}

function finale(host) {
  const rows = state.leaderboard;
  const finalists = rows.slice(0, 3);
  const step = currentFinaleStep();
  if (step < 0) {
    return '<div class="finale-intro"><h1>Who takes<br>the crown?</h1>' +
      '<span class="finale-countdown" role="timer" aria-label="Results in ' + (-step) + ' seconds">' + (-step) +
      '</span></div>';
  }
  const complete = step > finalists.length;
  const places = [1, 0, 2].filter(index => index < finalists.length).map(index => {
    const player = finalists[index];
    const shown = index >= finalists.length - step;
    const rank = rows.findIndex(other => other.score === player.score) + 1;
    return '<div class="podium-place podium-' + rank + (shown ? ' is-revealed' : '') +
      (index === finalists.length - step ? ' is-new' : '') + '">' +
      '<div class="podium-person" aria-live="polite">' + (shown
        ? '<span class="podium-rank">#' + rank + '</span><h2>' + escape(player.name) + '</h2><p>' + player.score + ' pts</p>'
        : '<span class="podium-placeholder" aria-label="Place yet to be revealed">?</span>') +
      '</div><div class="podium-block" aria-hidden="true">' + (shown && rank === 1 ? '♛' : '✳') + '</div></div>';
  }).join('');
  const rest = complete && !host && rows.length > 3
    ? '<div class="finale-standings">' + leaderboard(rows, true, 3) + '</div>' : '';
  return '<div class="finale"><h1>' +
    (step >= finalists.length ? 'Take a bow.' : 'The podium awaits.') + '</h1>' +
    '<div class="podium">' + places + '</div>' + rest +
    (complete && !host ? '<p class="personal-score">You scored <strong>' + state.you.score + '</strong></p>' : '') + '</div>';
}

function finish(host) {
  const archive = state.archiveStatus && ({
    saved: 'Results saved.',
    pending: 'Results saved. Uploading…',
    synced: 'Results saved and uploaded.'
  })[state.archiveStatus];
  finaleStep = currentFinaleStep();
  return {
    main: '<div id="finale">' + finale(host) + '</div>' +
      (archive ? '<div class="feedback" role="status"><p>' + archive + '</p></div>' : '') +
      '<a class="button primary" href="' + (host ? '/?mode=' + state.mode : '/join') + '">' +
      (host ? 'New game' : 'Join another game') + '</a>',
    side: host ? leaderboard(state.leaderboard, true) + (archive ? button('Download results', 'export') : '') : ''
  };
}

function renderRoom() {
  if (state) document.body.classList.toggle('game-started', state.phase !== 'lobby');
  if (!state) {
    app.innerHTML = shell((notice ? tag('RECONNECTING', 'pink') : '') +
      '<h1>Connecting…</h1><p id="message" role="status"></p>');
    say(notice);
    return;
  }
  const previous = document.activeElement;
  const focusAction = app.contains(previous) && previous.dataset.action;
  const choice = focusAction && previous.dataset.choice;
  const host = session.role === 'host';
  const status = !connected && state.phase !== 'final' ? tag('RECONNECTING', 'pink') :
    tag({ lobby: 'LOBBY', answering: 'LIVE', reveal: 'REVEAL', final: 'FINISHED' }[state.phase], 'green');
  const header = host ? '<div class="status-row" role="status">' + status + '</div>' : '';
  const screen = state.phase === 'lobby' ? lobby(host) : state.phase === 'final' ? finish(host) : roundScreen(host);
  app.innerHTML = shell(header + screen.main + '<p class="notice" id="message" role="status"></p>', screen.side);
  say(notice);
  paintTimer();
  if (focusAction) app.querySelector('[data-action="' + focusAction + '"]' +
    (choice === undefined ? '' : '[data-choice="' + choice + '"]'))?.focus({ preventScroll: true });
}

function paintTimer() {
  const finalView = document.querySelector('#finale');
  if (finalView && finaleStep !== currentFinaleStep()) {
    finaleStep = currentFinaleStep();
    finalView.innerHTML = finale(session.role === 'host');
  }
  const counter = document.querySelector('#countdown');
  if (!counter) return;
  const remaining = Math.max(0, state.deadline - (performance.now() + clockAnchor));
  const seconds = Math.ceil(remaining / 1000);
  const label = seconds + 's';
  if (counter.textContent !== label) counter.textContent = label;
  counter.classList.toggle('urgent', seconds <= 5);
  document.querySelector('#timebar').value = remaining;
  if (!seconds) {
    const hint = document.querySelector('#answer-hint');
    if (hint) hint.textContent = 'Time’s up.';
    for (const answer of app.querySelectorAll('button[data-action=answer], button[data-action=toggle], button[data-action=submit-multiple]')) {
      answer.disabled = true;
    }
  }
}

function apply(next) {
  if (state && (next.revision < state.revision ||
    (next.revision === state.revision && next.serverTime < state.serverTime))) return;
  const redraw = !state || state.revision !== next.revision;
  if (state && (state.phase !== next.phase || state.round !== next.round)) {
    notice = '';
    selectedAnswers.clear();
  }
  clockAnchor = next.serverTime - performance.now();
  state = next;
  if (redraw) renderRoom();
}

function openRoom(code, token, role, initial) {
  document.body.classList.toggle('player-view', role === 'player');
  const path = '/api/rooms/' + code;
  session = { code, token, role, path };
  showHostLeaderboard = read('host-leaderboard:' + code) !== 'hidden';
  state = undefined;
  selectedAnswers.clear();
  connected = Boolean(initial);
  inviteText = config.inviteOrigin + '/join/' + code;
  if (role === 'host' && (config.mode === 'online' || config.lanAvailable)) {
    const qr = qrcode(0, 'M');
    qr.addData(inviteText);
    qr.make();
    inviteQr = qr.createSvgTag({ scalable: true, title: 'QR code for the player invite' });
  } else {
    inviteQr = '';
  }
  if (initial) apply(initial);
  else renderRoom();
  void follow({ mode: config.mode, path, token, onState: apply, onConnection(value) {
    if (value === connected && (value || notice)) return;
    connected = value;
    notice = value ? '' : 'Connection lost. Reconnecting…';
    renderRoom();
  }, async onEnd(error) {
    if (role === 'host' && config.mode === 'local' && error.status === 404) {
      try {
        const { record, archiveStatus } = await api(path + '/results', { token });
        state = { code, mode: 'local', phase: 'final', archiveStatus,
          leaderboard: record.players.slice().sort((a, b) => b.score - a.score) };
        notice = '';
        renderRoom();
        return;
      } catch (archiveError) {
        if (archiveError.status !== 404) return renderMissing(archiveError.message);
      }
    }
    save(role + ':' + code, null);
    if (role === 'player' && error.status === 401) return renderJoin(code, error.message);
    renderMissing(error.message);
  } });
}

function renderMissing(message) {
  app.innerHTML = shell('<h1>Can’t open this room</h1><p>' +
    escape(message) + '</p><a class="button primary" href="/">Back home</a>');
}

async function copyInvite() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error();
    await navigator.clipboard.writeText(inviteText);
  } catch {
    const input = document.createElement('textarea');
    input.className = 'clipboard-helper';
    input.value = inviteText;
    document.body.append(input);
    input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } finally {
      input.remove();
      app.querySelector('[data-action=copy]')?.focus();
    }
    if (!copied) throw new Error();
  }
  say('Link copied.');
}

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || !session) return;
  const action = target.dataset.action;
  if (action === 'copy') {
    try { await copyInvite(); } catch { say('Couldn’t copy. Select the link instead.'); }
    return;
  }
  if (action === 'leaderboard' && session.role === 'host') {
    showHostLeaderboard = !showHostLeaderboard;
    save('host-leaderboard:' + session.code, showHostLeaderboard ? 'visible' : 'hidden');
    document.querySelector('#host-leaderboard').hidden = !showHostLeaderboard;
    target.outerHTML = leaderboardToggle();
    app.querySelector('[data-action=leaderboard]').focus({ preventScroll: true });
    return;
  }
  if (action === 'export') {
    try {
      const { record } = await api(session.path + '/results', { token: session.token });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
      link.download = 'breakroom-' + session.code + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) {
      say(error.message);
    }
    return;
  }
  if (busy || !connected) return;
  if (action === 'toggle') {
    const choice = Number(target.dataset.choice);
    if (selectedAnswers.has(choice)) selectedAnswers.delete(choice);
    else selectedAnswers.add(choice);
    renderRoom();
    return;
  }
  busy = true;
  notice = '';
  target.disabled = true;
  const answering = action === 'answer' || action === 'submit-multiple';
  const data = { round: state.round };
  if (answering) {
    data.choice = action === 'answer' ? Number(target.dataset.choice) : [...selectedAnswers];
    for (const answer of app.querySelectorAll('button[data-action=answer], button[data-action=toggle]')) answer.disabled = true;
  }
  try {
    const result = await api(session.path + '/' + (answering ? 'answer' : action), { token: session.token, data });
    apply(result.state);
  } catch (error) {
    notice = error.message || 'Could not reach the server. Try again.';
  } finally {
    busy = false;
    renderRoom();
  }
});

setInterval(paintTimer, 125);
window.addEventListener('popstate', () => location.reload());

try {
  config = await api('/api/config');
  const [, route, rawCode] = location.pathname.split('/');
  const code = rawCode?.toUpperCase();
  const accountLink = document.querySelector('[data-account]');
  if (route === 'join') accountLink.href = '/sign-in?next=' + encodeURIComponent(location.pathname);
  if (route === 'sign-in') {
    renderSignIn(app, config);
  } else if (route === 'join') {
    if (code && !codePattern.test(code)) renderJoin(null, 'Enter the code from your host.');
    else if (code && read('player:' + code)) openRoom(code, read('player:' + code), 'player');
    else renderJoin(code);
  } else if (route === 'host' && codePattern.test(code || '')) {
    const token = read('host:' + code);
    if (token) openRoom(code, token, 'host');
    else renderMissing('Open it in the browser that created the game.');
  } else {
    renderLanding();
  }
  if (config.auth?.available) {
    void api('/api/auth/get-session', { signal: AbortSignal.timeout(3500) }).then(result => {
      account = result?.user;
      if (!account) return;
      accountLink.textContent = 'Account';
      accountLink.title = 'Signed in as ' + account.email;
      if (route === 'sign-in') renderSignIn(app, config, account);
      const name = app.querySelector('#player-form [name=name]');
      if (name && !name.value) name.value = account.name.slice(0, 24);
    }).catch(() => {});
  }
} catch (error) {
  renderMissing(error.message || 'Could not connect to the quiz server.');
}

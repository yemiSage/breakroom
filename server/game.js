import { questions } from './questions.js';

export const capacity = 200;
const duration = 20_000;
const points = 100;

export class GameError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function newRoom(code, mode, host, now, settings = {}) {
  return { code, mode, host, expiresAt: now + 24 * 60 * 60 * 1000, phase: 'lobby',
    round: -1, revision: 0, deadline: null, players: [],
    questionCount: settings.deck?.length ?? settings.questionCount ?? questions.length,
    duration: settings.duration ?? duration, ...(settings.deck && { deck: settings.deck }) };
}

export const getQuestion = (room, round) => (room.deck ?? questions)[round];

function sameAnswer(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return left === right;
  return left.length === right.length && left.every((choice, index) => choice === right[index]);
}

export function completedGame(room, now) {
  const questionCount = room.questionCount ?? questions.length;
  return {
    code: room.code,
    completedAt: new Date(now).toISOString(),
    questions: (room.deck ?? questions).slice(0, questionCount),
    players: room.players.filter(player => !player.removed).map(({ name, score, answers }) => ({
      name, score, answers: Array.from({ length: questionCount }, (_, round) => answers[round] ?? null)
    }))
  };
}

export function identify(room, token) {
  if (!token) throw new GameError(401, 'This browser does not have access to that session.');
  if (token === room.host) return { role: 'host' };
  const index = room.players.findIndex(player => !player.removed && player.token === token);
  if (index < 0) throw new GameError(401, 'This browser does not have access to that session.');
  return { role: 'player', index };
}

export function reveal(room, now) {
  if (room.phase !== 'answering' || now < room.deadline) return false;
  const { correct } = getQuestion(room, room.round);
  for (const player of room.players) {
    if (sameAnswer(player.answers[room.round], correct)) player.score += points;
  }
  room.phase = 'reveal';
  room.revision++;
  return true;
}

export function join(room, name, token, attempt) {
  if (room.phase !== 'lobby') throw new GameError(409, 'This game has already started.');
  if (room.locked) throw new GameError(423, 'The host has paused new joins. Try again when they reopen the lobby.');
  const available = room.players.findIndex(player => player.removed);
  if (available < 0 && room.players.length >= capacity) throw new GameError(409, 'This room is full.');
  const clean = typeof name === 'string' ? name.trim().replace(/\s+/gu, ' ') : '';
  if (!clean || clean.length > 24 || /[\p{Cc}\p{Cf}]/u.test(clean)) {
    throw new GameError(400, 'Enter a display name between 1 and 24 characters.');
  }
  const index = available < 0 ? room.players.length : available;
  room.players[index] = { id: crypto.randomUUID(), name: clean, token, attempt, score: 0, answers: {} };
  room.revision++;
  return { role: 'player', index };
}

const playerId = (player, index) => player.id ?? String(index);

export function move(room, member, action, input, now) {
  const questionCount = room.questionCount ?? questions.length;
  if (action === 'answer') {
    if (member.role !== 'player') throw new GameError(403, 'Only players can answer.');
    const { round, choice } = input;
    if (!Number.isInteger(round) || round < 0 || round >= questionCount) {
      throw new GameError(400, 'Choose an answer from the current question.');
    }
    const question = getQuestion(room, round);
    const valid = option => Number.isInteger(option) && option >= 0 && option < question.options.length;
    const multiple = question.selection === 'multiple';
    if (multiple ? !Array.isArray(choice) || !choice.length || choice.length > question.options.length ||
        choice.some(option => !valid(option)) || new Set(choice).size !== choice.length : !valid(choice)) {
      throw new GameError(400, 'Choose an answer from the current question.');
    }
    const answer = multiple ? choice.slice().sort((a, b) => a - b) : choice;
    const answers = room.players[member.index].answers;
    if (sameAnswer(answers[round], answer)) return false;
    if (answers[round] !== undefined) throw new GameError(409, 'Your answer is already locked in.');
    if (room.phase !== 'answering' || round !== room.round || now >= room.deadline) {
      throw new GameError(409, 'The answer window has closed.');
    }
    answers[round] = answer;
  } else {
    if (member.role !== 'host') throw new GameError(403, 'Only the host can move the game forward.');
    if (action === 'lock' || action === 'remove') {
      if (room.phase !== 'lobby') throw new GameError(409, 'The game has already started.');
      if (action === 'lock') {
        if (typeof input.locked !== 'boolean') throw new GameError(400, 'Choose whether to pause joins.');
        if (Boolean(room.locked) === input.locked) return false;
        room.locked = input.locked;
      } else {
        const player = room.players.find((entry, index) => playerId(entry, index) === input.playerId);
        if (!player || player.removed) return false;
        player.removed = true;
      }
      room.revision++;
      return true;
    }
    if (action === 'start') {
      if (room.phase !== 'lobby') return false;
      if (!room.players.some(player => !player.removed)) throw new GameError(409, 'Wait for at least one player to join.');
    } else if (action === 'advance') {
      if (!Number.isInteger(input.round) || input.round < 0) throw new GameError(400, 'A question number is required.');
      if (input.round < room.round || room.phase === 'final') return false;
      if (room.phase !== 'reveal' || input.round !== room.round) {
        throw new GameError(409, 'Wait for the answer reveal before advancing.');
      }
    } else {
      throw new GameError(404, 'Unknown room action.');
    }
    if (room.round + 1 === questionCount) {
      room.phase = 'final';
      room.deadline = null;
      room.finalStartedAt = now;
    } else {
      room.round++;
      room.phase = 'answering';
      room.deadline = now + (room.duration ?? duration);
    }
  }
  room.revision++;
  return true;
}

export function snapshot(room, member, now) {
  const active = room.players.filter(player => !player.removed);
  const view = { code: room.code, mode: room.mode, phase: room.phase, revision: room.revision,
    playerCount: active.length, capacity, round: room.round, questionCount: room.questionCount ?? questions.length,
    deadline: room.deadline, duration: room.duration ?? duration, serverTime: now };
  const host = member.role === 'host';
  if (host && room.archiveStatus) view.archiveStatus = room.archiveStatus;
  if (host && room.phase === 'lobby') {
    view.roster = active.map(player => player.name);
    view.rosterIds = room.players.flatMap((player, index) => player.removed ? [] : [playerId(player, index)]);
    view.locked = Boolean(room.locked);
  }
  if (host && room.phase === 'answering') {
    view.answeredCount = room.players.filter(player => player.answers[room.round] !== undefined).length;
  }
  if (!host) {
    const player = room.players[member.index];
    view.you = { name: player.name, score: player.score, choice: player.answers[room.round] ?? null };
  }
  if (room.phase === 'answering' || room.phase === 'reveal') {
    const { category, text, options, correct, fact, selection, image, optionStyle } = getQuestion(room, room.round);
    view.question = { category, text, options, selection: selection ?? 'single',
      optionStyle: optionStyle ?? 'alphabet', hasImage: Boolean(image) };
    if (room.phase === 'reveal') Object.assign(view.question, { correct, fact });
  }
  if ((host && room.phase !== 'lobby') || room.phase === 'final') {
    view.leaderboard = room.players.flatMap(({ name, score, removed }, index) => removed ? [] : [{ name, score, index }])
      .sort((a, b) => b.score - a.score)
      .map(({ name, score, index }) => ({ name, score, you: index === member.index }));
    if (!host) view.leaderboard = view.leaderboard.slice(0, Math.max(3, view.leaderboard.length - 5));
  }
  if (room.phase === 'final') view.finalStartedAt = room.finalStartedAt ?? 0;
  return view;
}

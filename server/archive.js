import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { completedGame } from './game.js';
import { makeToken } from './protocol.js';

const defaultDirectory = process.platform === 'darwin'
  ? join(homedir(), 'Library', 'Application Support', 'Breakroom')
  : join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'breakroom');

try {
  loadEnvFile(join(defaultDirectory, 'cloud.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

export function openArchive(onSynced) {
  const directory = process.env.BREAKROOM_DATA_DIR || defaultDirectory;
  const endpoint = process.env.BREAKROOM_RESULTS_URL && new URL(process.env.BREAKROOM_RESULTS_URL);
  const key = process.env.BREAKROOM_RESULTS_KEY;
  if (endpoint && (endpoint.username || endpoint.password ||
      (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1')))) {
    throw new Error('Use an HTTPS results URL, or a loopback HTTP URL for a local preview.');
  }
  if (endpoint && !/^[a-f0-9]{32}$/.test(key || '')) {
    throw new Error('Set BREAKROOM_RESULTS_KEY to the same 32-character hex key as the results server.');
  }

  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const records = new Map();
  for (const name of readdirSync(directory)) {
    if (!/^[A-HJ-NP-Z2-9]{8}\.json$/.test(name)) continue;
    const saved = JSON.parse(readFileSync(join(directory, name), 'utf8'));
    records.set(saved.record.code, saved);
  }

  function persist(saved) {
    const path = join(directory, saved.record.code + '.json');
    writeFileSync(path + '.tmp', JSON.stringify(saved) + '\n', { mode: 0o600 });
    renameSync(path + '.tmp', path);
    records.set(saved.record.code, saved);
  }

  function status(saved) {
    return saved.syncedAt ? 'synced' : endpoint ? 'pending' : 'saved';
  }

  let uploading = false;
  async function upload() {
    if (!endpoint || uploading) return;
    uploading = true;
    try {
      for (const saved of records.values()) {
        if (saved.syncedAt) continue;
        const response = await fetch(new URL('/api/results/' + saved.id, endpoint), {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify(saved.record),
          redirect: 'error',
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) {
          await response.body?.cancel();
          break;
        }
        if ((await response.json()).id !== saved.id) break;
        persist({ ...saved, syncedAt: new Date().toISOString() });
        onSynced(saved.record.code);
      }
    } catch {
      // Keep the local copy and retry after a network or storage interruption.
    } finally {
      uploading = false;
    }
  }

  if (endpoint) setInterval(upload, 5000).unref();

  return {
    has: code => records.has(code),
    get(code, token) {
      const saved = records.get(code);
      if (!saved || token !== saved.host) return null;
      return { record: saved.record, archiveStatus: status(saved) };
    },
    save(room, now) {
      const saved = { id: makeToken(), host: room.host, record: completedGame(room, now), syncedAt: null };
      persist(saved);
      return status(saved);
    }
  };
}

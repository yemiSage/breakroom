export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { token, data, signal } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { headers, signal: signal ?? AbortSignal.timeout(12_000), cache: 'no-store',
    ...(data !== undefined && { method: 'POST', body: JSON.stringify(data) }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.message || body.error || 'The quiz server is temporarily unavailable.');
  return body;
}

async function stream(path, token, receive, signal) {
  const response = await fetch(path + '/live', { signal, headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error || 'Could not connect to the room.');
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) receive(JSON.parse(line));
    }
  } finally {
    reader.releaseLock();
  }
}

async function socket(path, token, receive, signal) {
  await api(path + '/state', { token, signal });
  const url = new URL(path + '/live', location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return new Promise(resolve => {
    const connection = new WebSocket(url, ['breakroom', token]);
    const close = () => connection.close();
    signal.addEventListener('abort', close, { once: true });
    if (signal.aborted) close();
    const ping = setInterval(() => {
      if (connection.readyState === WebSocket.OPEN) connection.send('ping');
    }, 12_000);
    connection.onmessage = event => receive(event.data === 'pong' ? { type: 'ping' } : JSON.parse(event.data));
    connection.onclose = () => {
      clearInterval(ping);
      signal.removeEventListener('abort', close);
      resolve();
    };
  });
}

export async function follow({ mode, path, token, onState, onConnection, onEnd }) {
  const connect = mode === 'online' ? socket : stream;
  let delay = 600;
  for (;;) {
    const abort = new AbortController();
    let timeout;
    const refreshWatchdog = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => abort.abort(), 32_000);
    };
    refreshWatchdog();
    try {
      await connect(path, token, message => {
        refreshWatchdog();
        if (message.type !== 'state') return;
        delay = 600;
        onConnection(true);
        onState(message.state);
      }, abort.signal);
    } catch (error) {
      if (error.status === 401 || error.status === 404) {
        onEnd(error);
        return;
      }
    } finally {
      clearTimeout(timeout);
    }
    onConnection(false);
    await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 400));
    delay = Math.min(delay * 2, 6000);
  }
}

import { api } from './live.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

export function returnPath() {
  const value = new URLSearchParams(location.search).get('next') || '/';
  try {
    const url = new URL(value, location.origin);
    if (url.origin === location.origin && !url.username && !url.password &&
        (url.pathname === '/' || /^\/join(?:\/[A-HJ-NP-Z2-9]{8})?\/?$/i.test(url.pathname))) {
      return url.pathname + url.search;
    }
  } catch {
    // Unrecognized destinations return to the home screen.
  }
  return '/';
}

export function renderSignIn(app, config, user) {
  const next = returnPath();
  const emailEnabled = Boolean(config.auth?.email);
  const googleEnabled = Boolean(config.auth?.google);
  const local = config.mode === 'local';
  const online = config.onlineOrigin;
  document.body.classList.add('sign-in-view');
  const content = user
    ? '<div class="auth-greeting"><span class="tag green">YOU’RE SIGNED IN</span><h2>Welcome back.</h2>' +
      '<p>' + escape(user.email) + '</p><a class="button primary" href="' + escape(next) + '">Continue to Breakroom <span aria-hidden="true">↗</span></a>' +
      '<button class="text-button" id="account-sign-out" type="button">Sign out</button><p class="notice" id="auth-message" role="status"></p></div>'
    : '<h2 id="auth-title">Come on in.</h2><p class="auth-description">Sign in with a code sent to your email, or use your Google account.</p>' +
      '<div id="auth-entry"><button type="button" class="button google-button" id="google-sign-in"' +
      (googleEnabled ? '' : ' disabled aria-describedby="auth-availability"') + '><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
      '<path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.36Z"/>' +
      '<path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.89.6-2.03.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/>' +
      '<path fill="#fbbc05" d="M6.4 13.92A6 6 0 0 1 6.09 12c0-.67.11-1.32.31-1.92V7.49H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.51l3.34-2.59Z"/>' +
      '<path fill="#ea4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z"/>' +
      '</svg>Sign in with Google</button><div class="auth-divider"><span>or use email</span></div>' +
      '<form id="email-sign-in"><label class="field-label" for="auth-email">EMAIL ADDRESS</label>' +
      '<input id="auth-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="you@example.com" required' +
      (emailEnabled ? '' : ' disabled') + '><button class="button primary"' +
      (emailEnabled ? '' : ' disabled aria-describedby="auth-availability"') + '>Email me a code <span aria-hidden="true">↗</span></button></form></div>' +
      '<div id="auth-verification" hidden><p id="auth-recipient"></p><form id="code-sign-in">' +
      '<label class="field-label" for="auth-code">6-DIGIT CODE</label><input id="auth-code" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required>' +
      '<p class="auth-hint">Your code expires in 5 minutes.</p><button class="button primary">Verify and sign in <span aria-hidden="true">↗</span></button></form>' +
      '<div class="auth-code-actions"><button type="button" class="text-button" id="resend-code">Send a new code</button>' +
      '<button type="button" class="text-button" id="change-email">Use another email</button></div></div>' +
      '<p class="notice" id="auth-message" role="status" aria-live="polite"></p>' +
      ((!emailEnabled || !googleEnabled) ? '<p class="auth-availability" id="auth-availability">' +
        (local ? 'Sign in on Breakroom Online when you have internet, or play here as a guest.' :
          !emailEnabled && !googleEnabled ? 'Account sign-in is being set up. You can play as a guest now.' :
            !emailEnabled ? 'Email sign-in is being set up. You can use Google or play as a guest.' :
              'Google sign-in is being set up. You can use email or play as a guest.') + '</p>' : '') +
      (local && online ? '<a class="auth-online-link" href="' + escape(online + '/sign-in') + '">Sign in on Breakroom Online ↗</a>' : '') +
      '<div class="auth-guest"><a class="button" href="' + escape(next) + '">Continue without signing in <span aria-hidden="true">↗</span></a>' +
      '<p>Hosting and joining are open to guests.</p></div>';

  app.innerHTML = '<section class="auth-page" aria-labelledby="auth-title"><div class="auth-story">' +
    '<span class="tag">THE OFFICE QUIZ CLUB</span><h1>A little break.<br>A lot of<br><em>bragging rights.</em></h1>' +
    '<p>Your next office rivalry starts here.</p><img src="/hero.svg" width="600" height="500" alt="" class="auth-art" aria-hidden="true"></div>' +
    '<div class="auth-panel"><div class="auth-content">' + content + '</div></div></section>';
  if (user) {
    app.querySelector('.auth-greeting h2').id = 'auth-title';
    app.querySelector('#account-sign-out').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api('/api/auth/sign-out', { data: {} });
        location.reload();
      } catch (error) {
        app.querySelector('#auth-message').textContent = error.message;
        button.disabled = false;
      }
    });
    return;
  }

  const emailForm = app.querySelector('#email-sign-in');
  const codeForm = app.querySelector('#code-sign-in');
  const emailField = emailForm.elements.email;
  const codeField = codeForm.elements.otp;
  const entry = app.querySelector('#auth-entry');
  const verification = app.querySelector('#auth-verification');
  const message = app.querySelector('#auth-message');
  const resend = app.querySelector('#resend-code');
  const change = app.querySelector('#change-email');
  const google = app.querySelector('#google-sign-in');
  let email;
  let busy = false;
  let resendAt = 0;

  function setBusy(value) {
    busy = value;
    emailForm.querySelector('button').disabled = value || !emailEnabled;
    codeForm.querySelector('button').disabled = value;
    resend.disabled = value || Date.now() < resendAt;
    change.disabled = value;
    google.disabled = value || !googleEnabled;
    emailField.readOnly = value;
    codeField.readOnly = value;
  }

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    message.textContent = '';
    try {
      await api('/api/auth/email-otp/send-verification-otp', { data: { email, type: 'sign-in' } });
      entry.hidden = true;
      verification.hidden = false;
      app.querySelector('#auth-title').textContent = 'Check your inbox.';
      app.querySelector('.auth-description').hidden = true;
      app.querySelector('#auth-recipient').textContent = 'We sent a sign-in code to ' + email + '.';
      codeField.value = '';
      codeField.focus();
      resendAt = Date.now() + 60000;
      resend.textContent = 'New code available in a minute';
      setTimeout(() => {
        if (!resend.isConnected || Date.now() < resendAt) return;
        resend.disabled = busy;
        resend.textContent = 'Send a new code';
      }, 60000);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  emailForm.addEventListener('submit', event => {
    event.preventDefault();
    email = emailField.value.trim().toLowerCase();
    void sendCode();
  });
  resend.addEventListener('click', () => void sendCode());
  change.addEventListener('click', () => {
    entry.hidden = false;
    verification.hidden = true;
    app.querySelector('#auth-title').textContent = 'Come on in.';
    app.querySelector('.auth-description').hidden = false;
    message.textContent = '';
    codeField.value = '';
    emailField.focus();
  });
  codeForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    message.textContent = '';
    try {
      await api('/api/auth/sign-in/email-otp', { data: { email, otp: codeField.value } });
      location.assign(next);
    } catch (error) {
      message.textContent = error.message;
      setBusy(false);
    }
  });
  google.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    message.textContent = '';
    try {
      const result = await api('/api/auth/sign-in/social', {
        data: { provider: 'google', callbackURL: next, errorCallbackURL: '/sign-in?error=google' }
      });
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') throw new Error('Could not open Google sign-in. Please try again.');
      location.assign(url.href);
    } catch (error) {
      message.textContent = error.message;
      setBusy(false);
    }
  });
  if (new URLSearchParams(location.search).has('error')) {
    message.textContent = 'Sign-in wasn’t completed. Please try again or continue as a guest.';
  }
}

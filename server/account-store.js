import { DurableObject } from 'cloudflare:workers';
import { accountDatabase } from './account-database.js';
import { accountSchema } from './account-schema.js';
import { createAuth } from './auth.js';

const minute = 60_000;
// Sign-in codes per email address, so nobody can flood one inbox from many networks.
const codeLimits = [{ window: 10 * minute, max: 3 }, { window: 24 * 60 * minute, max: 10 }];
const codeRequestSchema = `
create table if not exists "code_request" ("emailHash" text not null, "sentAt" integer not null);
create index if not exists "code_request_email" on "code_request" ("emailHash", "sentAt");
`;

async function emailHash(email) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('breakroom-email:' + email));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class AccountStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec(accountSchema);
      ctx.storage.sql.exec(codeRequestSchema);
    });
    this.database = accountDatabase(ctx.storage);
  }

  // Counts and records a code request in one synchronous step, so concurrent requests cannot both pass.
  allowCode(hash, now) {
    const { sql } = this.ctx.storage;
    const longest = Math.max(...codeLimits.map(limit => limit.window));
    sql.exec('delete from "code_request" where "sentAt" < ?', now - longest);
    for (const { window, max } of codeLimits) {
      const [{ count }] = sql.exec('select count(*) as count from "code_request" where "emailHash" = ? and "sentAt" >= ?',
        hash, now - window).toArray();
      if (count >= max) return false;
    }
    sql.exec('insert into "code_request" ("emailHash", "sentAt") values (?, ?)', hash, now);
    return true;
  }

  async respond(request) {
    const auth = createAuth(this.env, this.database, new URL(request.url).origin);
    const result = await auth.handler(request);
    const response = new Response(result.body, result);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Vary', 'Cookie');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }

  async fetch(request) {
    if (new URL(request.url).pathname === '/api/auth/email-otp/send-verification-otp') {
      const { email } = await request.clone().json().catch(() => ({}));
      if (typeof email === 'string' && email.trim()) {
        const hash = await emailHash(email.trim().toLowerCase());
        if (!this.allowCode(hash, Date.now())) {
          console.warn('Sign-in code limit reached for one email address');
          return Response.json({ error: 'Too many codes were requested for this email. Try again later.' },
            { status: 429, headers: { 'Cache-Control': 'no-store' } });
        }
      }
      // Sending waits on the email provider, so it runs outside the account lock below.
      return this.respond(request);
    }
    // Keep OTP consumption and session creation ordered across concurrent requests.
    return this.ctx.blockConcurrencyWhile(() => this.respond(request));
  }
}

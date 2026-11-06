import { DurableObject } from 'cloudflare:workers';
import { accountDatabase } from './account-database.js';
import { accountSchema } from './account-schema.js';
import { createAuth } from './auth.js';

export class AccountStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.transactionSync(() => ctx.storage.sql.exec(accountSchema));
    this.database = accountDatabase(ctx.storage);
  }

  async fetch(request) {
    // Keep OTP consumption and session creation ordered across concurrent requests.
    return this.ctx.blockConcurrencyWhile(async () => {
      const auth = createAuth(this.env, this.database, new URL(request.url).origin);
      const result = await auth.handler(request);
      const response = new Response(result.body, result);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Vary', 'Cookie');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    });
  }
}

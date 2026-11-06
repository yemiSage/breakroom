import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { APIError, createAuthMiddleware } from 'better-auth/api';

export function authAvailability(env) {
  const available = Boolean(env.ACCOUNTS && env.BETTER_AUTH_SECRET);
  return {
    available,
    email: available && Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL),
    google: available && Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  };
}

export function createAuth(env, database, origin) {
  // AccountStore creates an auth instance per request, so this failure stays local.
  let emailError;
  return betterAuth({
    appName: 'Breakroom',
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET,
    database,
    trustedOrigins: [origin],
    emailAndPassword: { enabled: false },
    account: { encryptOAuthTokens: true },
    onAPIError: { errorURL: origin + '/sign-in' },
    hooks: {
      after: createAuthMiddleware(async ctx => {
        if (ctx.path === '/email-otp/send-verification-otp' && emailError) {
          const failure = emailError;
          emailError = undefined;
          throw failure;
        }
      })
    },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account'
      }
    } : {},
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: {
      useSecureCookies: origin.startsWith('https:'),
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 300,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 10 },
        '/sign-in/email-otp': { window: 60, max: 30 }
      }
    },
    plugins: [emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      async sendVerificationOTP({ email, otp }) {
        try {
          if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
            throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email sign-in is being set up. Please continue as a guest.' });
          }
          const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              sender: { name: 'Breakroom', email: env.BREVO_SENDER_EMAIL },
              to: [{ email }],
              subject: 'Your Breakroom sign-in code',
              textContent: 'Your Breakroom sign-in code is ' + otp + '.\n\n' +
                'This code expires in 5 minutes and can be used once.\n\n' +
                'If you did not request this code, you can ignore this email.'
            }),
            signal: AbortSignal.timeout(8000),
            redirect: 'manual'
          });
          if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            console.error('Brevo sign-in email failed', response.status, detail.code || 'unknown');
            throw new APIError('SERVICE_UNAVAILABLE', { message: 'We couldn’t send your code. Please try again in a minute.' });
          }
          await response.body?.cancel();
        } catch (error) {
          console.error('Brevo email delivery failed', error.name, error.message);
          emailError = error instanceof APIError ? error : new APIError('SERVICE_UNAVAILABLE', {
            message: 'We couldn’t send your code. Please try again in a minute.'
          });
          throw emailError;
        }
      }
    })]
  });
}

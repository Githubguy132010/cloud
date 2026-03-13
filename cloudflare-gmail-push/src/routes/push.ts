import { Hono } from 'hono';
import type { HonoContext } from '../types';
import { validateOidcToken } from '../auth/oidc';

export const pushRoute = new Hono<HonoContext>();

pushRoute.post('/user/:userId', async c => {
  const userId = c.req.param('userId');

  // Validate Google OIDC token (mandatory).
  // Each user has their own project-level SA, so we only check issuer + audience.
  const oidcResult = await validateOidcToken(c.req.header('authorization'), c.env.OIDC_AUDIENCE);
  if (!oidcResult.valid) {
    console.warn(`[gmail-push] OIDC validation failed for user ${userId}: ${oidcResult.error}`);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const pubSubBody = await c.req.text();
  if (pubSubBody.length > 65_536) {
    return c.json({ error: 'Payload too large' }, 413);
  }
  await c.env.GMAIL_PUSH_QUEUE.send({ userId, pubSubBody });

  return c.json({ ok: true }, 200);
});

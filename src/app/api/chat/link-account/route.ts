import { bot } from '@/lib/bot';
import { APP_URL } from '@/lib/constants';
import { linkKiloUser, verifyLinkToken } from '@/lib/bot-identity';
import { getUserFromAuth } from '@/lib/user.server';
import { NextResponse } from 'next/server';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * GET /api/chat/link-account?token=<signed-token>
 *
 * Opened in the browser when a chat user clicks "Link Account".
 * The token is HMAC-signed and time-limited (10 min) so that a third
 * party cannot forge a link for an arbitrary platform identity.
 *
 * Flow:
 *  1. Verify the signed token (reject expired / tampered tokens).
 *  2. Authenticate the user via NextAuth session (redirect to sign-in if needed).
 *  3. Write the platform identity → Kilo user mapping into Redis.
 *  4. Show a success page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
  }

  const identity = verifyLinkToken(token);

  if (!identity) {
    return NextResponse.json(
      { error: 'Invalid or expired link. Please go back to your chat and try again.' },
      { status: 400 }
    );
  }

  // Authenticate — redirect to sign-in if no session, then back here
  const { user, authFailedResponse } = await getUserFromAuth({ adminOnly: false });
  if (authFailedResponse) {
    const signInUrl = new URL('/users/sign_in', APP_URL);
    signInUrl.searchParams.set('callbackPath', url.pathname + url.search);
    return NextResponse.redirect(signInUrl);
  }

  await bot.initialize();

  await linkKiloUser(bot.getState(), identity, user.id);

  const platformLabel = escapeHtml(identity.platform);

  return new Response(
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Account Linked</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
  <h1>Account linked</h1>
  <p>Your ${platformLabel} account has been linked to your Kilo account.<br>
     You can close this tab and @mention Kilo again in your chat.</p>
</div>
</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

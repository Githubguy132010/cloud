import { NextResponse } from 'next/server';
import { getUserFromAuth } from '@/lib/user.server';
import { KiloClawUserClient } from '@/lib/kiloclaw/kiloclaw-user-client';
import { KiloClawApiError } from '@/lib/kiloclaw/kiloclaw-internal-client';
import { generateApiToken, TOKEN_EXPIRY } from '@/lib/tokens';

export async function GET() {
  const { user, authFailedResponse } = await getUserFromAuth({
    adminOnly: false,
  });
  if (authFailedResponse) return authFailedResponse;

  try {
    const token = generateApiToken(user, undefined, {
      expiresIn: TOKEN_EXPIRY.fiveMinutes,
    });
    const client = new KiloClawUserClient(token);
    const creds = await client.getChatCredentials({ userId: user.id });
    return NextResponse.json(creds);
  } catch (err) {
    const status = err instanceof KiloClawApiError ? err.statusCode : 502;
    console.error('[api/kiloclaw/chat-credentials] error:', err);
    return NextResponse.json({ error: 'KiloClaw request failed' }, { status });
  }
}

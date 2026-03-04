import type { PlatformIdentity } from '@/lib/bot-identity';
import { getInstallationByTeamId } from '@/lib/integrations/slack-service';
import { type SlackEvent } from '@chat-adapter/slack';
import type { Message, Thread } from 'chat';

export function getSlackTeamId(message: Message<SlackEvent>): string {
  const teamId = message.raw.team_id ?? message.raw.team;
  if (!teamId) throw new Error('Expected a teamId in message.raw');
  return teamId;
}

/**
 * Extract platform identity coordinates from any adapter's message.
 * Extend the switch for Discord / Teams / Google Chat / etc.
 */
export function getPlatformIdentity(thread: Thread, message: Message): PlatformIdentity {
  const platform = thread.id.split(':')[0]; // "slack", "discord", "gchat", "teams", …

  switch (platform) {
    case 'slack': {
      const teamId = getSlackTeamId(message as Message<SlackEvent>);
      return { platform: 'slack', teamId, userId: message.author.userId };
    }
    default:
      throw new Error(`PlatformNotSupported: ${platform}`);
  }
}

export async function getPlatformIntegration(thread: Thread, message: Message) {
  const platform = thread.id.split(':')[0];

  switch (platform) {
    case 'slack':
      return await getInstallationByTeamId(getSlackTeamId(message as Message<SlackEvent>));
    default:
      throw new Error(`PlatformNotSupported: ${platform}`);
  }
}

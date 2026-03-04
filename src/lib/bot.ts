import { Chat, emoji, type ActionEvent, type Message, type Thread } from 'chat';
import { createSlackAdapter } from '@chat-adapter/slack';
import { createRedisState } from '@chat-adapter/state-redis';
import { resolveKiloUserId } from '@/lib/bot-identity';
import type { PlatformIntegration } from '@kilocode/db';
import { getPlatformIdentity, getPlatformIntegration } from '@/lib/bot/platform-helpers';
import { LINK_ACCOUNT_ACTION_PREFIX, promptLinkAccount } from '@/lib/bot/link-account';

async function processMessage(
  thread: Thread,
  _message: Message,
  _platformIntegration: PlatformIntegration,
  _kiloUserId: string
) {
  await thread.post('TODO');
}

const slackAdapter = createSlackAdapter({
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
});

export const bot = new Chat({
  userName: process.env.NODE_ENV === 'production' ? 'Kilo' : 'Henk Bot',
  adapters: {
    slack: slackAdapter,
  },
  state: createRedisState(),
});

bot.onNewMention(async function handleIncomingMessage(
  thread: Thread,
  message: Message
): Promise<void> {
  const identity = getPlatformIdentity(thread, message);
  const [platformIntegration, kiloUserId] = await Promise.all([
    getPlatformIntegration(thread, message),
    resolveKiloUserId(bot.getState(), identity),
  ]);

  if (!platformIntegration) {
    throw new Error('No Active Platform Integration Found');
  }

  if (!kiloUserId) {
    await promptLinkAccount(thread, message, identity);
    return;
  }

  const received = thread.createSentMessageFromMessage(message);
  await received.addReaction(emoji.eyes);

  try {
    await processMessage(thread, message, platformIntegration, kiloUserId);
  } catch (error) {
    console.error('[Bot] Unhandled error in message handler:', error);
    await thread.post({ markdown: 'Sorry, something went wrong while processing your message.' });
  } finally {
    await Promise.all([received.removeReaction(emoji.eyes), received.addReaction(emoji.check)]);
  }
});

// When the user clicks the "Link Account" LinkButton, Slack fires a
// block_actions event *in addition to* opening the URL in the browser.
// For ephemeral messages the adapter encodes the response_url into the
// messageId, so deleteMessage sends `{ delete_original: true }` — removing
// the ephemeral card from the user's view.
bot.onAction(async function handleLinkAccountClick(event: ActionEvent): Promise<void> {
  if (!event.actionId.startsWith(LINK_ACCOUNT_ACTION_PREFIX)) return;

  try {
    await event.adapter.deleteMessage(event.threadId, event.messageId);
  } catch (error) {
    // Not critical — the ephemeral message will disappear on its own eventually
    console.warn('[Bot] Failed to delete link-account ephemeral:', error);
  }
});

/**
 * Internal API Endpoint: Reply to PR Review Comment (Auto Fix)
 *
 * Called by:
 * - Auto Fix Orchestrator (after Cloud Agent completes a review-comment-triggered fix)
 *
 * Process:
 * 1. Receive ticket ID and session ID
 * 2. Fetch ticket from DB to get review comment context
 * 3. Post a reply on the review thread ("Fixed in latest push")
 * 4. Update ticket status to completed
 *
 * URL: POST /api/internal/auto-fix/comment-reply
 * Protected by internal API secret
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getFixTicketById, updateFixTicketStatus } from '@/lib/auto-fix/db/fix-tickets';
import { logExceptInTest, errorExceptInTest } from '@/lib/utils.server';
import { captureException } from '@sentry/nextjs';
import { INTERNAL_API_SECRET } from '@/lib/config.server';
import {
  replyToReviewComment,
  addReactionToPRReviewComment,
} from '@/lib/integrations/platforms/github/adapter';
import { getIntegrationById } from '@/lib/integrations/db/platform-integrations';

type CommentReplyPayload = {
  ticketId: string;
  sessionId?: string;
};

export async function POST(req: NextRequest) {
  try {
    // Validate internal API secret
    const secret = req.headers.get('X-Internal-Secret');
    if (secret !== INTERNAL_API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload: CommentReplyPayload = await req.json();
    const { ticketId, sessionId } = payload;

    if (!ticketId) {
      return NextResponse.json({ error: 'Missing required field: ticketId' }, { status: 400 });
    }

    logExceptInTest('[auto-fix-comment-reply] Processing comment reply', {
      ticketId,
      sessionId,
    });

    // Get ticket
    const ticket = await getFixTicketById(ticketId);

    if (!ticket) {
      logExceptInTest('[auto-fix-comment-reply] Ticket not found', { ticketId });
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (ticket.trigger_source !== 'review_comment' || !ticket.review_comment_id) {
      logExceptInTest('[auto-fix-comment-reply] Not a review comment ticket', {
        ticketId,
        triggerSource: ticket.trigger_source,
      });
      return NextResponse.json(
        { error: 'Ticket is not a review comment trigger' },
        { status: 400 }
      );
    }

    // Get GitHub token
    let installationId: string | undefined;
    if (ticket.platform_integration_id) {
      try {
        const integration = await getIntegrationById(ticket.platform_integration_id);
        installationId = integration?.platform_installation_id ?? undefined;
      } catch (error) {
        errorExceptInTest('[auto-fix-comment-reply] Failed to get integration:', error);
      }
    }

    if (!installationId) {
      errorExceptInTest('[auto-fix-comment-reply] No installation ID found', { ticketId });
      return NextResponse.json({ error: 'GitHub installation not found' }, { status: 500 });
    }

    const [repoOwner, repoName] = ticket.repo_full_name.split('/');

    if (!repoOwner || !repoName) {
      return NextResponse.json(
        { error: `Invalid repo_full_name: ${ticket.repo_full_name}` },
        { status: 400 }
      );
    }

    try {
      // Reply to the review comment thread
      const branchName = ticket.pr_head_ref || 'the PR';
      const replyBody = `I've pushed a fix for this comment to the \`${branchName}\` branch. Please review the changes.`;

      await replyToReviewComment(
        installationId,
        repoOwner,
        repoName,
        ticket.issue_number,
        ticket.review_comment_id,
        replyBody
      );

      logExceptInTest('[auto-fix-comment-reply] Posted reply on review thread', {
        ticketId,
        prNumber: ticket.issue_number,
        commentId: ticket.review_comment_id,
      });

      // Update ticket status
      await updateFixTicketStatus(ticketId, 'completed', {
        sessionId,
        prBranch: ticket.pr_head_ref || undefined,
        completedAt: new Date(),
      });

      return NextResponse.json({ success: true });
    } catch (replyError) {
      errorExceptInTest('[auto-fix-comment-reply] Failed to reply:', replyError);
      captureException(replyError, {
        tags: { operation: 'auto-fix-comment-reply', step: 'reply-to-comment' },
        extra: { ticketId, sessionId },
      });

      // Try to add failure reaction
      try {
        await addReactionToPRReviewComment(
          installationId,
          repoOwner,
          repoName,
          ticket.review_comment_id,
          'confused'
        );
      } catch {
        // Best-effort reaction
      }

      // Update ticket to failed
      await updateFixTicketStatus(ticketId, 'failed', {
        sessionId,
        errorMessage: `Failed to reply to review comment: ${replyError instanceof Error ? replyError.message : String(replyError)}`,
        completedAt: new Date(),
      });

      return NextResponse.json(
        {
          error: 'Failed to reply to review comment',
          message: replyError instanceof Error ? replyError.message : String(replyError),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    errorExceptInTest('[auto-fix-comment-reply] Error processing request:', error);
    captureException(error, {
      tags: { source: 'auto-fix-comment-reply-api' },
    });

    return NextResponse.json(
      {
        error: 'Failed to process request',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

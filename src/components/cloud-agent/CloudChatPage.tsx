/**
 * Cloud Chat Page
 *
 * Owns the sidebar session query so it runs in a stable component that does not
 * re-render during the session-loading lifecycle, eliminating redundant
 * unifiedSessions.list invocations that would otherwise be batched by tRPC.
 */

'use client';

import { CloudChatContainer } from './CloudChatContainer';
import { useSidebarSessions } from './hooks/useSidebarSessions';

type CloudChatPageProps = {
  organizationId?: string;
};

export default function CloudChatPage({ organizationId }: CloudChatPageProps) {
  const { sessions, refetchSessions } = useSidebarSessions({
    organizationId: organizationId ?? null,
  });
  return (
    <CloudChatContainer
      organizationId={organizationId}
      sessions={sessions}
      refetchSessions={refetchSessions}
    />
  );
}

// Named export for compatibility
export { CloudChatPage };

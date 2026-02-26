import type { Owner } from './core/types';
import type { TRPCContext } from '@/lib/trpc/init';
import { ensureOrganizationAccess } from '@/routers/organizations/utils';
import type { OrganizationRole } from '@/lib/organizations/organization-types';

export function resolveOwner(ctx: TRPCContext, organizationId?: string): Owner {
  return organizationId ? { type: 'org', id: organizationId } : { type: 'user', id: ctx.user.id };
}

export async function ensureIntegrationAccess(
  ctx: TRPCContext,
  organizationId?: string,
  roles?: OrganizationRole[]
) {
  if (organizationId) {
    await ensureOrganizationAccess(ctx, organizationId, roles ?? ['owner', 'billing_manager']);
  }
}

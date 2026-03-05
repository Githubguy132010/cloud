import { adminProcedure, createTRPCRouter } from '@/lib/trpc/init';
import { NEXTAUTH_URL } from '@/lib/config.server';
import { sendViaCustomerIo } from '@/lib/email-customerio';
import * as z from 'zod';
import { TRPCError } from '@trpc/server';

const templateNames = [
  'orgSubscription',
  'orgRenewed',
  'orgCancelled',
  'orgSSOUserJoined',
  'orgInvitation',
  'magicLink',
  'balanceAlert',
  'autoTopUpFailed',
  'ossInviteNewUser',
  'ossInviteExistingUser',
  'ossExistingOrgProvisioned',
  'deployFailed',
] as const;

type TemplateName = (typeof templateNames)[number];

const TemplateNameSchema = z.enum(templateNames);

const providerNames = ['customerio'] as const;

type ProviderName = (typeof providerNames)[number];

const ProviderNameSchema = z.enum(providerNames);

// Customer.io template IDs (same as in email.ts)
const templates: Record<TemplateName, string> = {
  orgSubscription: '10',
  orgRenewed: '11',
  orgCancelled: '12',
  orgSSOUserJoined: '13',
  orgInvitation: '6',
  magicLink: '14',
  balanceAlert: '16',
  autoTopUpFailed: '17',
  ossInviteNewUser: '18',
  ossInviteExistingUser: '19',
  ossExistingOrgProvisioned: '20',
  deployFailed: '21',
};

const subjects: Record<TemplateName, string> = {
  orgSubscription: 'Welcome to Kilo for Teams!',
  orgRenewed: 'Kilo: Your Teams Subscription Renewal',
  orgCancelled: 'Kilo: Your Teams Subscription is Cancelled',
  orgSSOUserJoined: 'Kilo: New SSO User Joined Your Organization',
  orgInvitation: 'Kilo: Teams Invitation',
  magicLink: 'Sign in to Kilo Code',
  balanceAlert: 'Kilo: Low Balance Alert',
  autoTopUpFailed: 'Kilo: Auto Top-Up Failed',
  ossInviteNewUser: 'Kilo: OSS Sponsorship Offer',
  ossInviteExistingUser: 'Kilo: OSS Sponsorship Offer',
  ossExistingOrgProvisioned: 'Kilo: OSS Sponsorship Offer',
  deployFailed: 'Kilo: Your Deployment Failed',
};

function fixtureMessageData(template: TemplateName): Record<string, unknown> {
  const orgId = 'fixture-org-id';
  const organization_url = `${NEXTAUTH_URL}/organizations/${orgId}`;
  const invoices_url = `${NEXTAUTH_URL}/organizations/${orgId}/payment-details`;
  const integrations_url = `${NEXTAUTH_URL}/organizations/${orgId}/integrations`;
  const code_reviews_url = `${NEXTAUTH_URL}/organizations/${orgId}/code-reviews`;

  switch (template) {
    case 'orgSubscription':
      return {
        seats: '5 seats',
        organization_url,
        invoices_url,
        seatCount: 5,
        organizationId: orgId,
      };
    case 'orgRenewed':
      return { seats: '5 seats', invoices_url, seatCount: 5, organizationId: orgId };
    case 'orgCancelled':
      return { invoices_url, organizationId: orgId };
    case 'orgSSOUserJoined':
      return { new_user_email: 'newuser@example.com', organization_url, organizationId: orgId };
    case 'orgInvitation':
      return {
        organization_name: 'Acme Corp',
        inviter_name: 'Alice Smith',
        accept_invite_url: `${NEXTAUTH_URL}/invite/fixture-code`,
      };
    case 'magicLink':
      return {
        magic_link_url: `${NEXTAUTH_URL}/auth/magic?token=fixture-token`,
        email: 'user@example.com',
        expires_in: '24 hours',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        app_url: NEXTAUTH_URL,
      };
    case 'balanceAlert':
      return { organizationId: orgId, minimum_balance: 10, organization_url, invoices_url };
    case 'autoTopUpFailed':
      return {
        reason: 'Card declined',
        credits_url: `${NEXTAUTH_URL}/credits?show-auto-top-up`,
      };
    case 'ossInviteNewUser':
      return {
        organization_name: 'Acme OSS',
        accept_invite_url: `${NEXTAUTH_URL}/invite/fixture-oss-code`,
        integrations_url,
        code_reviews_url,
        tier_name: 'Premier',
        seats: 25,
        seat_value: '48,000',
        has_credits: true,
        monthly_credits_usd: 500,
      };
    case 'ossInviteExistingUser':
      return {
        organization_name: 'Acme OSS',
        organization_url,
        integrations_url,
        code_reviews_url,
        tier_name: 'Premier',
        seats: 25,
        seat_value: '48,000',
        has_credits: true,
        monthly_credits_usd: 500,
      };
    case 'ossExistingOrgProvisioned':
      return {
        organization_name: 'Acme OSS',
        organization_url,
        integrations_url,
        code_reviews_url,
        tier_name: 'Premier',
        seats: 25,
        seat_value: '48,000',
        has_credits: true,
        monthly_credits_usd: 500,
      };
    case 'deployFailed':
      return {
        deployment_name: 'my-app',
        deployment_url: `${NEXTAUTH_URL}/deployments/fixture-id`,
        repository: 'acme/my-app',
      };
  }
}

export const emailTestingRouter = createTRPCRouter({
  getTemplates: adminProcedure.query(() => {
    return templateNames.map(name => ({ name, subject: subjects[name] }));
  }),

  getProviders: adminProcedure.query((): ProviderName[] => {
    return [...providerNames];
  }),

  getPreview: adminProcedure
    .input(z.object({ template: TemplateNameSchema, provider: ProviderNameSchema }))
    .query(({ input }) => {
      const messageData = fixtureMessageData(input.template);
      return {
        type: 'customerio' as const,
        transactional_message_id: templates[input.template],
        subject: subjects[input.template],
        message_data: messageData,
      };
    }),

  sendTest: adminProcedure
    .input(
      z.object({
        template: TemplateNameSchema,
        provider: ProviderNameSchema,
        recipient: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      const messageData = fixtureMessageData(input.template);
      const templateId = templates[input.template];

      if (input.provider === 'customerio') {
        await sendViaCustomerIo({
          transactional_message_id: templateId,
          to: input.recipient,
          message_data: messageData,
          identifiers: { email: input.recipient },
          reply_to: 'hi@kilocode.ai',
        });
        return { success: true, provider: input.provider, recipient: input.recipient };
      }

      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Provider '${input.provider}' is not yet implemented`,
      });
    }),
});

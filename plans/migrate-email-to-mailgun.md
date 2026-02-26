# Migrate Email Sending from Customer.io to Mailgun

## Overview

Replace Customer.io transactional email API with Mailgun's Node.js SDK (`mailgun.js`). Instead of referencing remote Customer.io template IDs, we'll render the local HTML templates in `src/lib/emails/*.html` server-side and send the full HTML body to Mailgun.

## Current Architecture

- **Provider**: Customer.io via `customerio-node` SDK
- **Config**: `CUSTOMERIO_EMAIL_API_KEY` in `config.server.ts`
- **Templates**: Remote, stored in Customer.io, referenced by numeric ID (`'10'`, `'11'`, etc.)
- **Variable substitution**: Done by Customer.io using Liquid syntax (`{{ var }}`, `{% if %}`)
- **Send function**: `send()` in `email.ts` creates `APIClient` + `SendEmailRequest`

## Target Architecture

- **Provider**: Mailgun via `mailgun.js` SDK + `form-data`
- **Config**: `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` in `config.server.ts`
- **Templates**: Local HTML files in `src/lib/emails/*.html`
- **Variable substitution**: Done server-side in Node.js before sending
- **Send function**: `send()` calls `mg.messages.create()`

## Changes Required

### 1. Config (`src/lib/config.server.ts`)

- Add `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` env vars
- Eventually remove `CUSTOMERIO_EMAIL_API_KEY` (can keep both during transition)

### 2. Template Rendering (`src/lib/email.ts`)

> **Note**: This may not be the right place to put the email templates — looking for guidance on where they should live.

Create a `renderTemplate()` function that:

1. Reads the HTML file from `src/lib/emails/{name}.html` using `fs.readFileSync`
2. Replaces `{{ variable_name }}` with the provided values using a single regex

```typescript
function renderTemplate(name: string, vars: Record<string, string>) {
  const templatePath = path.join(__dirname, 'emails', `${name}.html`);
  const html = fs.readFileSync(templatePath, 'utf-8');
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    if (!(key in vars)) {
      throw new Error(`Missing template variable '${key}' in email template '${name}'`);
    }
    return vars[key];
  });
}
```

**Pre-requisite template changes** (do before migration):

- ~~Replace `{{ "now" | date: "%Y" }}` with `{{ year }}` in all 12 templates~~ ✅ Done
- Replace the `{% if has_credits %}...{% endif %}` block with `{{ credits_section }}` in the 3 OSS templates (`ossInviteNewUser.html`, `ossInviteExistingUser.html`, `ossExistingOrgProvisioned.html`)
- This eliminates all Liquid syntax — templates only use `{{ variable }}` interpolation

**`credits_section` logic**: The 3 OSS templates currently have this conditional block:

```html
{% if has_credits %}<br />•
<strong style="color: #d1d5db">${{ monthly_credits_usd }} USD in Kilo credits</strong>, which reset
every 30 days{% endif %}
```

This becomes `{{ credits_section }}` in the template, and the JS builds it:

```typescript
function buildCreditsSection(monthlyCreditsUsd: number): string {
  if (monthlyCreditsUsd <= 0) return '';
  return `<br />• <strong style="color: #d1d5db">$${monthlyCreditsUsd} USD in Kilo credits</strong>, which reset every 30 days`;
}
```

Then in each OSS send function:

```typescript
export async function sendOssInviteNewUserEmail(data: OssInviteEmailData) {
  const tierConfig = ossTierConfig[data.tier];
  const html = renderTemplate('ossInviteNewUser', {
    tier_name: tierConfig.name,
    seats: String(tierConfig.seats),
    seat_value: tierConfig.seatValue.toLocaleString(),
    credits_section: buildCreditsSection(data.monthlyCreditsUsd),
    accept_invite_url: data.acceptInviteUrl,
    integrations_url: `${NEXTAUTH_URL}/organizations/${data.organizationId}/integrations`,
    code_reviews_url: `${NEXTAUTH_URL}/organizations/${data.organizationId}/code-reviews`,
    year: String(new Date().getFullYear()),
  });
  return send({ to: data.to, subject: 'Kilo: OSS Sponsorship Offer', html });
}
```

### 3. Send Function (`src/lib/email.ts`)

Replace the `send()` function. Use `mailgun.js` SDK + `form-data`:

```typescript
import formData from 'form-data';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

async function send(params: { to: string; subject: string; html: string }) {
  if (!MAILGUN_API_KEY) {
    const message = 'MAILGUN_API_KEY is not set - cannot send email';
    console.warn(message);
    captureMessage(message, { level: 'warning', tags: { source: 'email_service' } });
    return;
  }

  return mg.messages.create(MAILGUN_DOMAIN, {
    from: 'Kilo Code <hi@app.kilocode.ai>',
    to: [params.to],
    subject: params.subject,
    html: params.html,
    'h:Reply-To': 'hi@app.kilocode.ai',
  });
}
```

Dependencies to install: `pnpm add mailgun.js form-data`

### 4. Update Each Send Function

Each `send*Email` function needs to:

1. Call `renderTemplate('templateName', { ...variables })` to get the final HTML
2. Call `send({ to, subject, html, replyTo: 'hi@kilocode.ai' })`

**Key difference**: Each function now needs to provide a `subject` line, since Customer.io stored subjects in the template but Mailgun needs it passed explicitly.

Suggested subjects:
| Function | Subject |
|---|---|
| `sendOrgSubscriptionEmail` | "Welcome to Kilo for Teams!" |
| `sendOrgRenewedEmail` | "Kilo: Your Teams Subscription Renewal" |
| `sendOrgCancelledEmail` | "Kilo: Your Teams Subscription is Cancelled" |
| `sendOrgSSOUserJoinedEmail` | "Kilo: New SSO User Joined Your Organization" |
| `sendOrganizationInviteEmail` | "Kilo: Teams Invitation" |
| `sendMagicLinkEmail` | "Sign in to Kilo Code" |
| `sendBalanceAlertEmail` | "Kilo: Low Balance Alert" |
| `sendAutoTopUpFailedEmail` | "Kilo: Auto Top-Up Failed" |
| `sendOssInviteNewUserEmail` | "Kilo: OSS Sponsorship Offer" |
| `sendOssInviteExistingUserEmail` | "Kilo: OSS Sponsorship Offer" |
| `sendOssExistingOrgProvisionedEmail` | "Kilo: OSS Sponsorship Offer" |
| `sendDeploymentFailedEmail` | "Kilo: Your Deployment Failed" |

### 5. Remove Customer.io Dependencies

- Remove `customerio-node` from `package.json`
- Remove `CUSTOMERIO_EMAIL_API_KEY` from `config.server.ts`
- Remove the `templates` map (no longer needed)
- Remove `SendEmailRequestOptions` type imports
- Note: `src/lib/external-services.ts` also references Customer.io for user deletion — that's a separate concern and uses different API keys (`CUSTOMERIO_SITE_ID`, `CUSTOMERIO_API_KEY`)

### 6. Template Variable Changes

All templates use `{{ variable }}` interpolation. The `renderTemplate()` function replaces each `{{ name }}` with the corresponding value from the provided variables object.

| Template file                    | Variables                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `orgSubscription.html`           | `seats`, `organization_url`, `invoices_url`, `year`                                                                        |
| `orgRenewed.html`                | `seats`, `invoices_url`, `year`                                                                                            |
| `orgCancelled.html`              | `invoices_url`, `year`                                                                                                     |
| `orgSSOUserJoined.html`          | `new_user_email`, `organization_url`, `year`                                                                               |
| `orgInvitation.html`             | `organization_name`, `inviter_name`, `accept_invite_url`, `year`                                                           |
| `magicLink.html`                 | `magic_link_url`, `email`, `expires_in`, `year`                                                                            |
| `balanceAlert.html`              | `minimum_balance`, `organization_url`, `year`                                                                              |
| `autoTopUpFailed.html`           | `reason`, `credits_url`, `year`                                                                                            |
| `ossInviteNewUser.html`          | `tier_name`, `seats`, `seat_value`, `credits_section`, `accept_invite_url`, `integrations_url`, `code_reviews_url`, `year` |
| `ossInviteExistingUser.html`     | `tier_name`, `seats`, `seat_value`, `credits_section`, `organization_url`, `integrations_url`, `code_reviews_url`, `year`  |
| `ossExistingOrgProvisioned.html` | `tier_name`, `seats`, `seat_value`, `credits_section`, `organization_url`, `integrations_url`, `code_reviews_url`, `year`  |
| `deployFailed.html`              | `deployment_name`, `deployment_url`, `repository`, `year`                                                                  |

Notes:

- `year` is always `String(new Date().getFullYear())`
- `credits_section` is built in JS: either the credits HTML snippet or empty string, depending on whether the org has monthly credits

### 7. Environment Variables

New env vars needed:

- `MAILGUN_API_KEY` — Mailgun API key (starts with `key-...`)
- `MAILGUN_DOMAIN` — Mailgun sending domain (e.g., `mail.kilocode.ai`)

## Migration Strategy

1. Add Mailgun env vars and new `send()` function alongside existing Customer.io code
2. Migrate one email at a time (start with `deployFailed` as it's simplest)
3. Test each email by triggering it in staging
   — **TODO: how will this work?** We need a way to trigger each email send path (e.g. trigger a deployment failure, send a magic link, etc.) in a staging environment and verify the email arrives via Mailgun. Need guidance on what staging setup exists and whether there's a way to trigger these flows without side effects.
4. Once all emails are migrated, remove Customer.io code and dependency

## Files Changed

| File                       | Change                                                                          |
| -------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/email.ts`         | Major rewrite: new send(), renderTemplate(), update all send\*Email functions   |
| `src/lib/config.server.ts` | Add MAILGUN_API_KEY, MAILGUN_DOMAIN; eventually remove CUSTOMERIO_EMAIL_API_KEY |
| `package.json`             | Remove `customerio-node`; add `mailgun.js` + `form-data`                        |
| `src/lib/emails/AGENTS.md` | Update to reflect Mailgun                                                       |
| `.env` files               | Add MAILGUN_API_KEY, MAILGUN_DOMAIN                                             |

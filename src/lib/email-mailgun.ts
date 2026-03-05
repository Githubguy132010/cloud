import type { SendEmailRequestOptions } from '@/lib/email-customerio';

// Mailgun send logic — not yet implemented (PR 2)
export function sendViaMailgun(_mailRequest: SendEmailRequestOptions): never {
  throw new Error('Mailgun email provider is not yet implemented');
}

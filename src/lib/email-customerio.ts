import { CUSTOMERIO_EMAIL_API_KEY } from '@/lib/config.server';
import { captureMessage } from '@sentry/nextjs';
import { APIClient, SendEmailRequest } from 'customerio-node';
import type { SendEmailRequestOptions } from 'customerio-node/dist/lib/api/requests';

export type { SendEmailRequestOptions };

export function sendViaCustomerIo(mailRequest: SendEmailRequestOptions) {
  if (!CUSTOMERIO_EMAIL_API_KEY) {
    const message = 'CUSTOMERIO_EMAIL_API_KEY is not set - cannot send email';
    console.warn(message);
    console.warn(JSON.stringify(mailRequest));

    captureMessage(message, {
      level: 'warning',
      tags: { source: 'email_service' },
      extra: {
        mailRequest,
      },
    });
    return;
  }
  console.log('sending email with customerio: ', JSON.stringify(mailRequest));
  const client = new APIClient(CUSTOMERIO_EMAIL_API_KEY);
  const request = new SendEmailRequest(mailRequest);
  return client.sendEmail(request);
}

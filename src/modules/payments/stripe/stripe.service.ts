import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

@Injectable()
export default class StripeService {
  private stripe: Stripe;
  private logger = new Logger(StripeService.name);

  // tweak these as needed (ms / attempts)
  private readonly STRIPE_TIMEOUT = 120_000; // 120s
  private readonly RETRY_ATTEMPTS = 3;

  constructor(private config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('Missing STRIPE_SECRET_KEY in environment');
    }

this.stripe = new Stripe(secretKey, {
  // removed apiVersion to avoid literal-type mismatch with typings
  timeout: this.STRIPE_TIMEOUT,
  maxNetworkRetries: 2,
});
  }

  // --- generic retry helper with exponential backoff ---
  private async withRetries<T>(fn: () => Promise<T>, attempts = this.RETRY_ATTEMPTS): Promise<T> {
    let lastErr: any = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const msg = (err && (err.message ?? err.toString())) || 'unknown';
        const retriable =
          // Stripe SDK connection error type OR common node network errors
          err?.type === 'StripeConnectionError' ||
          /ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN/.test(msg) ||
          // Sometimes SDK uses code property for network issues
          ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(err?.code);

        this.logger.warn(
          `Stripe attempt ${i + 1}/${attempts} failed${retriable ? ' (retriable)' : ''}: ${msg}`,
        );

        if (!retriable || i === attempts - 1) break;

        // exponential backoff (e.g., 500ms, 1000ms, 2000ms)
        const backoff = Math.pow(2, i) * 500;
        await new Promise((res) => setTimeout(res, backoff));
      }
    }

    // rethrow the last error after attempts
    this.logger.error('All Stripe attempts failed', lastErr);
    throw lastErr;
  }

  // --- wrapped createPaymentIntent that uses withRetries ---
  async createPaymentIntent({
    amount,
    currency = 'usd',
    metadata = {},
    capture = false,
    idempotencyKey,
  }: {
    amount: number;
    currency?: string;
    metadata?: Stripe.MetadataParam;
    capture?: boolean;
    idempotencyKey?: string;
  }) {
    const payload: Stripe.PaymentIntentCreateParams = {
      amount,
      currency,
      metadata,
      capture_method: capture ? 'automatic' : 'manual',
    };

    return this.withRetries(() =>
      // pass idempotencyKey in request options (keeps it safe to retry)
      this.stripe.paymentIntents.create(
        payload,
        idempotencyKey ? { idempotencyKey } : undefined,
      ),
    );
  }

  constructEvent(body: Buffer, signature: string, webhookSecret: string) {
    return this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
  }

  client() {
    return this.stripe;
  }
}

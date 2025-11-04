// worker/bootstrap-worker.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import { MailerService } from '@app/modules/mailer/mailer.service';

async function bootstrap() {
  // create a lightweight Nest app context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const mailer = app.get(MailerService);
  const prisma = new PrismaClient();

  // Prefer REDIS_URL but fall back to REDIS_HOST/REDIS_PORT if needed
  const redisUrl = process.env.REDIS_URL?.trim();
  const redisConnection = redisUrl
    ? // bullmq/ioredis accept { url: 'redis://...' }
      { url: redisUrl }
    : {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      };

  console.log('[worker] Redis connection:', redisUrl ?? `${redisConnection.host}:${redisConnection.port}`);

  const worker = new Worker(
    'email-campaigns',
    async (job) => {
      const { campaignId } = job.data;
      if (!campaignId) throw new Error('Missing campaignId in job data');

      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw new Error('Campaign not found');

      console.log('[worker] Processing campaign', campaignId);
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } });

      const batchSize = Number(process.env.CAMPAIGN_BATCH_SIZE ?? 50);
      const batchDelayMs = Number(process.env.CAMPAIGN_BATCH_DELAY_MS ?? 500);

      let offset = 0;
      while (true) {
        const recipients = await prisma.campaignRecipient.findMany({
          where: { campaignId, status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          take: batchSize,
          skip: offset,
        });

        if (!recipients.length) {
          // nothing left to send in this batch
          break;
        }

        await Promise.all(
          recipients.map(async (r) => {
            try {
              let sub = await prisma.subscriber.findUnique({ where: { id: r.subscriberId } });
              if (!sub) {
                await prisma.campaignRecipient.update({
                  where: { id: r.id },
                  data: { status: 'FAILED', error: 'Subscriber not found' },
                });
                return;
              }

              if (!sub.unsubToken) {
                const token = require('crypto').randomBytes(32).toString('hex');
                await prisma.subscriber.update({ where: { id: sub.id }, data: { unsubToken: token } });
                sub = { ...sub, unsubToken: token };
              }

              const unsubUrl = `${process.env.SITE_URL}/unsubscribe?token=${encodeURIComponent(sub.unsubToken!)}`;
              const html = campaign.body.replace(/{{\s*unsubscribe\s*}}/gi, `<a href="${unsubUrl}">Unsubscribe</a>`);

              await mailer.sendMail({
                to: r.email,
                subject: campaign.subject,
                html,
                from: `"${campaign.fromName ?? process.env.FROM_NAME ?? 'No Reply'}" <${campaign.fromEmail}>`,
              });

              await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: new Date() } });
              await prisma.subscriber.update({ where: { id: sub.id }, data: { lastSentAt: new Date() } });
            } catch (err: unknown) {
              const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
              console.error('[worker] send error for recipient', r.id, errorMessage);
              await prisma.campaignRecipient.update({
                where: { id: r.id },
                data: { status: 'FAILED', error: errorMessage },
              });
            }
          })
        );

        if (batchDelayMs > 0) await new Promise((res) => setTimeout(res, batchDelayMs));
        offset += recipients.length;
      }

      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'SENT', updatedAt: new Date() } });
      console.log('[worker] Finished campaign', campaignId);
      return { ok: true };
    },
    {
      connection: redisConnection,
      concurrency: Number(process.env.CAMPAIGN_WORKER_CONCURRENCY ?? 2),
    }
  );

  worker.on('completed', (job) => console.log('[worker] Job completed', job.id));
  worker.on('failed', (job, err) => console.error('[worker] Job failed', job?.id, err));

  // Graceful shutdown
  async function shutdown() {
    try {
      console.log('[worker] Shutting down...');
      await worker.close();
      await prisma.$disconnect();
      await app.close();
      console.log('[worker] Shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('[worker] Shutdown error', err);
      process.exit(1);
    }
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandledRejection', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[worker] uncaughtException', err);
    // give a chance to flush logs then exit
    setTimeout(() => process.exit(1), 1000);
  });
}

bootstrap().catch((err) => {
  console.error('[worker] bootstrap error', err);
  process.exit(1);
});

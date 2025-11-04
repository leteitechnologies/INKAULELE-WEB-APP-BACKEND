// src/campaigns/campaigns.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import Handlebars from 'handlebars';
import { Queue, Worker } from 'bullmq';
import pLimit from 'p-limit';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mailer/mailer.service';
import { extractFirstNameFromEmail } from '@app/lib/nameFromEmail';
import type { CampaignRecipient, Subscriber, Destination } from '@prisma/client';

type RecipientWithSubscriber = CampaignRecipient & { subscriber?: Subscriber | null };

@Injectable()
export class CampaignsService implements OnModuleDestroy {
  private logger = new Logger(CampaignsService.name);
  private queue: Queue;
  private worker: Worker | null = null;

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
    private config: ConfigService,
  ) {
    const redisUrl = (process.env.REDIS_URL ?? this.config.get<string>('REDIS_URL') ?? '').trim();
    const connection = redisUrl
      ? { url: redisUrl }
      : {
          host: process.env.REDIS_HOST ?? this.config.get<string>('REDIS_HOST') ?? '127.0.0.1',
          port: Number(process.env.REDIS_PORT ?? this.config.get<number>('REDIS_PORT') ?? 6379),
        };

    this.queue = new Queue('email-campaigns', { connection });

    this.worker = new Worker(
      'email-campaigns',
      async (job) => {
        if (job.name === 'send-campaign') {
          const campaignId: string = job.data.campaignId;
          this.logger.log(`Worker: processing send-campaign job for ${campaignId}`);
          return this.handleSendCampaign(campaignId);
        }
        this.logger.warn(`Unknown job name ${job.name}`);
      },
      { connection, concurrency: 1 },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed`, err);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      try {
        await this.worker.close();
      } catch (e) {
        this.logger.warn('Error closing worker', (e as any).message ?? e);
      }
      this.worker = null;
    }
    if (this.queue) {
      try {
        await this.queue.close();
      } catch {
        // ignore
      }
    }
  }

  // ---------------------------
  // create / enqueue / get / listRecipients
  // ---------------------------
  async create(payload: {
    title: string;
    subject: string;
    body: string;
    fromEmail: string;
    fromName?: string;
    recipientIds?: string[];
    destinationIds?: string[]; // <- ADDED: optional destinations selected by admin
    scheduledAt?: string | null;
  }) {
    const campaign = await this.prisma.campaign.create({
      data: {
        title: payload.title,
        subject: payload.subject,
        body: payload.body,
        fromEmail: payload.fromEmail,
        fromName: payload.fromName,
        status: payload.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
      },
    });

    // create CampaignDestination rows if provided
    if (Array.isArray(payload.destinationIds) && payload.destinationIds.length) {
      const batch = 200;
      for (let i = 0; i < payload.destinationIds.length; i += batch) {
        const chunk = payload.destinationIds.slice(i, i + batch).map((destId) => ({
          campaignId: campaign.id,
          destinationId: destId,
        }));
        await this.prisma.campaignDestination.createMany({ data: chunk });
      }
    }

    // get recipients
    let subs: { id: string; email: string }[] = [];
    if (payload.recipientIds?.length) {
      subs = await this.prisma.subscriber.findMany({
        where: { id: { in: payload.recipientIds } },
        select: { id: true, email: true },
      });
    } else {
      subs = await this.prisma.subscriber.findMany({
        where: { status: 'SUBSCRIBED' },
        select: { id: true, email: true },
      });
    }

    // chunked inserts (createMany)
    if (subs.length) {
      const batch = 500;
      for (let i = 0; i < subs.length; i += batch) {
        const chunk = subs.slice(i, i + batch).map((s) => ({
          campaignId: campaign.id,
          subscriberId: s.id,
          email: s.email,
        }));
        await this.prisma.campaignRecipient.createMany({ data: chunk });
      }
    }

    // schedule/send via queue
    if (!payload.scheduledAt) {
      await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SCHEDULED' } });
      await this.queue.add('send-campaign', { campaignId: campaign.id }, { attempts: 3 });
    } else {
      const delay = Math.max(0, new Date(payload.scheduledAt).getTime() - Date.now());
      await this.queue.add('send-campaign', { campaignId: campaign.id }, { delay, attempts: 3 });
    }

    return { ...campaign, recipientsCount: subs.length };
  }

  async enqueue(campaignId: string) {
    await this.queue.add('send-campaign', { campaignId }, { attempts: 3 });
    return this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'SCHEDULED' } });
  }

  async get(campaignId: string) {
    return this.prisma.campaign.findUnique({ where: { id: campaignId } });
  }

  async listRecipients(campaignId: string) {
    return this.prisma.campaignRecipient.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---------------------------
  // Worker handler: core per-recipient compile-and-send logic
  // ---------------------------
  private async handleSendCampaign(campaignId: string) {
    const concurrency = Number(this.config.get<number>('CAMPAIGN_SEND_CONCURRENCY') ?? 6);
    const chunkSize = Number(this.config.get<number>('CAMPAIGN_RECIPIENT_PAGE') ?? 200);

    // 1. load campaign
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    // mark campaign as SENDING
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } });

    // 2. prefetch picks (campaign-specific if any, otherwise featured)
    const campaignDestRows = await this.prisma.campaignDestination.findMany({
      where: { campaignId },
      include: {
        destination: {
          include: {
            durations: { take: 1, orderBy: { priceFrom: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    let picks: Array<Record<string, any>> = [];

    if (campaignDestRows && campaignDestRows.length) {
      picks = campaignDestRows.map((row) => {
        // destination has shape from Prisma; we typed Destination import above for safety
        const p = row.destination as Destination & { durations?: any[] };
        const dur = p.durations && p.durations.length ? p.durations[0] : null;
        return {
          title: p.title,
          subtitle: p.subtitle ?? '',
          coverImage: p.coverImage ?? (this.config.get('SITE_ICON') ?? ''),
          url: `${this.config.get('SITE_URL') ?? 'https://your-site.example.com'}/destinations/${p.slug}`,
          priceFrom:
            typeof dur?.priceFrom !== 'undefined' && dur?.priceFrom !== null
              ? String(Math.round(Number(dur.priceFrom)))
              : '',
          currency: dur?.currency ?? 'KSh',
          emoji: '🌍',
          duration: dur?.durationLabel ?? undefined,
        };
      });
    } else {
      const picksRaw = await this.prisma.destination.findMany({
        where: { featured: true },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: { durations: { take: 1, orderBy: { priceFrom: 'asc' } } },
      });
      picks = picksRaw.map((p) => {
        const dur = p.durations && p.durations.length ? p.durations[0] : null;
        return {
          title: p.title,
          subtitle: p.subtitle ?? '',
          coverImage: p.coverImage ?? (this.config.get('SITE_ICON') ?? ''),
          url: `${this.config.get('SITE_URL') ?? 'https://your-site.example.com'}/destinations/${p.slug}`,
          priceFrom:
            typeof dur?.priceFrom !== 'undefined' && dur?.priceFrom !== null
              ? String(Math.round(Number(dur.priceFrom)))
              : '',
          currency: dur?.currency ?? 'KSh',
          emoji: '🌍',
          duration: dur?.durationLabel ?? undefined,
        };
      });
    }

    // 3. compile Handlebars template once
    const bodyTemplateFn = Handlebars.compile(campaign.body ?? '');

    // 4. page through pending recipients using id cursor
    let lastId: string | null = null;
    let totalSent = 0;
    let totalFailed = 0;

    while (true) {
      const recipients: RecipientWithSubscriber[] = await this.prisma.campaignRecipient.findMany({
        where: {
          campaignId,
          status: 'PENDING',
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: chunkSize,
        include: { subscriber: true },
      });

      if (!recipients.length) break;
      lastId = recipients[recipients.length - 1].id;

      const limit = pLimit(concurrency);
      await Promise.all(
        recipients.map((rec) =>
          limit(async () => {
            try {
              const subscriber = rec.subscriber ?? null;
              const firstName =
                (subscriber?.name && String(subscriber.name).trim()) ||
                extractFirstNameFromEmail(rec.email) ||
                'Traveler';

              const tplData = {
                firstName,
                picks,
                campaignId: campaign.id,
                ctaUrl: this.config.get<string>('SITE_URL') ?? 'https://your-site.example.com',
                siteTitle: (this.mailer as any).SITE_TITLE ?? this.config.get<string>('SITE_TITLE') ?? 'Site',
                supportPhone: this.config.get<string>('SUPPORT_PHONE') ?? '',
                promoEnds: (campaign as any).promoEnds ?? '',
              };

              const personalizedBody = bodyTemplateFn(tplData);
              const isFullHtml = /<\s*html|\<\s*body/i.test(personalizedBody);
              const htmlToSend = isFullHtml
                ? personalizedBody
                : this.mailer.buildLayout({
                    title: campaign.subject ?? `Message from ${this.config.get<string>('SITE_TITLE')}`,
                    preheader: campaign.subject ?? '',
                    bodyHtml: personalizedBody,
                  });

              await this.mailer.sendMail({
                from: campaign.fromEmail ? `"${campaign.fromName ?? ''}" <${campaign.fromEmail}>` : (this.mailer as any)._from?.(),
                to: rec.email,
                subject: campaign.subject ?? '(no subject)',
                html: htmlToSend,
              });

              await this.prisma.campaignRecipient.update({
                where: { id: rec.id },
                data: { status: 'SENT', sentAt: new Date(), error: null },
              });

              await this.prisma.subscriber.update({
                where: { id: rec.subscriberId },
                data: { lastSentAt: new Date() },
              }).catch(() => {});

              totalSent++;
              this.logger.log(`Campaign ${campaignId} sent to ${rec.email}`);
            } catch (err: unknown) {
              totalFailed++;
              const message = err instanceof Error ? err.message : String(err);
              this.logger.error(`Failed to send campaign ${campaignId} to ${rec.email}: ${message}`);
              await this.prisma.campaignRecipient.update({
                where: { id: rec.id },
                data: { status: 'FAILED', error: message },
              });
            }
          }),
        ),
      );
    } // end paging loop

    const remainingPending = await this.prisma.campaignRecipient.count({
      where: { campaignId, status: 'PENDING' },
    });

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: remainingPending === 0 ? 'SENT' : 'SENDING', updatedAt: new Date() },
    });

    this.logger.log(
      `Campaign ${campaignId} finished send loop: sent=${totalSent}, failed=${totalFailed}, pending=${remainingPending}`,
    );
    return { sent: totalSent, failed: totalFailed, pending: remainingPending };
  }
}

import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import Handlebars from 'handlebars';
import { MailerService } from '../mailer/mailer.service';
import { extractFirstNameFromEmail } from '@app/lib/nameFromEmail';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

// import AdminGuard if you have one
// import { AdminGuard } from '../auth/admin.guard';

@Controller('campaigns')
// @UseGuards(AdminGuard) // enable in production
export class CampaignsController {
constructor(
  private readonly svc: CampaignsService,
  private readonly mailer: MailerService,
  private readonly prisma: PrismaService,
  private readonly config: ConfigService,
) {}

  @Post()
  async create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Post(':id/send')
  async sendNow(@Param('id') id: string) {
    await this.svc.enqueue(id);
    return { ok: true };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/recipients')
  async recipients(@Param('id') id: string) {
    return this.svc.listRecipients(id);
  }

@Post('preview')
async preview(@Body() body: { html: string; sample: any }) {
  const sample = body.sample || {};

  // firstName fallback
  if (!sample.firstName && sample.email) {
    sample.firstName = sample.name || extractFirstNameFromEmail(sample.email) || 'Friend';
  }

  // If selectedDestinationIds provided, use them; else if picks already present skip; else optionally load featured
  if (!Array.isArray(sample.picks) || !sample.picks.length) {
    const selectedIds: string[] = Array.isArray(sample.selectedDestinationIds) ? sample.selectedDestinationIds : [];

    if (selectedIds.length) {
      // fetch those exact destinations
      const rows = await this.prisma.destination.findMany({
        where: { id: { in: selectedIds } },
        include: { durations: { take: 1, orderBy: { priceFrom: 'asc' } } },
      });

      sample.picks = rows.map((p) => {
        const dur = p.durations && p.durations.length ? p.durations[0] : null;
        return {
          title: p.title,
          subtitle: p.subtitle ?? '',
          coverImage: p.coverImage ?? this.config.get('SITE_ICON') ?? '',
          url: `${this.config.get('SITE_URL') ?? ''}/destinations/${p.slug}`,
          priceFrom: dur?.priceFrom ?? '',
          currency: dur?.currency ?? 'KSh',
          emoji: '🌍',
          duration: dur?.durationLabel ?? undefined,
        };
      });
    } else {
      // optional: fallback small set of featured picks so preview never looks empty
      const picksRaw = await this.prisma.destination.findMany({
        where: { featured: true },
        take: 4,
        include: { durations: { take: 1, orderBy: { priceFrom: 'asc' } } },
      });
      sample.picks = picksRaw.map((p) => {
        const dur = p.durations && p.durations.length ? p.durations[0] : null;
        return {
          title: p.title,
          subtitle: p.subtitle ?? '',
          coverImage: p.coverImage ?? this.config.get('SITE_ICON') ?? '',
          url: `${this.config.get('SITE_URL') ?? ''}/destinations/${p.slug}`,
          priceFrom: dur?.priceFrom ?? '',
          currency: dur?.currency ?? 'KSh',
          emoji: '🌍',
          duration: dur?.durationLabel ?? undefined,
        };
      });
    }
  }

  // site tokens
  sample.siteIcon = sample.siteIcon ?? (this.config.get('SITE_ICON') ?? (this.mailer as any).SITE_ICON ?? '');
  sample.siteTitle = sample.siteTitle ?? (this.config.get('SITE_TITLE') ?? (this.mailer as any).SITE_TITLE ?? 'Site');
  sample.supportPhone = sample.supportPhone ?? this.config.get('SUPPORT_PHONE') ?? '';
  sample.facebookUrl = sample.facebookUrl ?? this.config.get('SOCIAL_FACEBOOK') ?? '';
  sample.instagramUrl = sample.instagramUrl ?? this.config.get('SOCIAL_INSTAGRAM') ?? '';
  sample.ctaUrl = sample.ctaUrl ?? (this.config.get('SITE_URL') ?? '');
  sample.unsubscribe = sample.unsubscribe ?? `${this.config.get('SITE_URL') ?? ''}/unsubscribe`;

  const tpl = Handlebars.compile(body.html || '');
  const html = tpl(sample);
  return { html };
}



  // --- direct test-send of raw HTML (no campaign record required)
  @Post('test-send-direct')
  async testSendDirect(@Body() body: { to: string; subject: string; html: string; text?: string }) {
    const { to, subject, html, text } = body;
    if (!to || !subject || !html) {
      return { ok: false, message: 'Missing to / subject / html' };
    }

    await this.mailer.sendMail({
      to,
      subject,
      html,
      text,
      from: undefined, // MailerService can use default from
    });

    return { ok: true };
  }
}

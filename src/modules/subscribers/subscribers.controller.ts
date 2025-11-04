// src/subscribers/subscribers.controller.ts
import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscribersService } from './subscribers.service';

@Controller('subscribers')
export class SubscribersController {
  // inject both PrismaService and SubscribersService in one constructor
  constructor(
    private readonly prisma: PrismaService,
    private readonly svc: SubscribersService,
  ) {}

  /**
   * GET /subscribers?q=...&status=...&limit=20&page=1
   */
  @Get()
  async list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string,
    @Query('page') pageRaw?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '10', 10) || 10, 1), 200);
    const page = Math.max(parseInt(pageRaw ?? '1', 10) || 1, 1);

    return this.svc.list({ q, status, limit, page });
  }

  @Post('unsubscribe')
  async unsubscribe(@Body('token') token: string) {
    const sub = await this.prisma.subscriber.findFirst({ where: { unsubToken: token } });
    if (!sub) return { ok: false };
    await this.prisma.subscriber.update({
      where: { id: sub.id },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    });
    return { ok: true };
  }
}

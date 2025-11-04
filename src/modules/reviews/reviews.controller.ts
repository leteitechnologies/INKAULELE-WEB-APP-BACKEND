import { Controller, Post, Param, Body, Req, UseGuards, Get, Query, Delete, Patch, HttpCode, NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';


import { seconds, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { CreateReviewDto } from './dtos/create-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';

@Controller()
@UseGuards(ThrottlerGuard)
export class ReviewsController {
  constructor(private svc: ReviewsService) {}
@Throttle({
  default: {
    limit: process.env.NODE_ENV === 'production' ? 5 : 1000,
    ttl: seconds(60),  // shorthand helper for milliseconds
  },
})
  // Create: POST /destinations/:slug/reviews

  @Post('destinations/:slug/reviews')
  async create(@Param('slug') slug: string, @Body() dto: CreateReviewDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    return this.svc.createBySlug(slug, dto, ip as string, ua as string);
  }

  // List: GET /destinations/:slug/reviews
  @Get('destinations/:slug/reviews')
  async list(@Param('slug') slug: string, @Query('page') page?: string, @Query('take') take?: string) {
    const p = Number(page) || 1;
    const t = Math.min(100, Number(take) || 50);
    return this.svc.listForSlug(slug, t, p);
  }

  // Edit: PATCH /reviews/:id
  @Patch('reviews/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.svc.updateById(id, dto);
  }

  // Delete: DELETE /reviews/:id  (body: { token })
  @HttpCode(200)
  @Delete('reviews/:id')
  async delete(@Param('id') id: string, @Body() body: { token?: string }) {
    if (!body?.token) throw new NotFoundException('Missing token');
    return this.svc.deleteById(id, body.token);
  }

  // Admin: PATCH /admin/reviews/:id/status  body { status: 'APPROVED'|'REJECTED' }
  // protect with real auth guard and roles in production
  @Patch('admin/reviews/:id/status')
  async adminSetStatus(@Param('id') id: string, @Body() body: { status: 'APPROVED' | 'REJECTED' }) {
    return this.svc.setStatus(id, body.status);
  }
}

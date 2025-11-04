// src/newsletter/newsletter.controller.ts
import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Post()
  async subscribe(@Body('email') email: string, @Body('name') name?: string, @Body('source') source?: string) {
    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email)) {
      throw new BadRequestException('Valid email required');
    }

    const subscriber = await this.newsletter.subscribe(email, { name, source });
    return { ok: true, subscriberId: subscriber.id };
  }
}

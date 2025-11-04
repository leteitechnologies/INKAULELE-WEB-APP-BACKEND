// src/fx/fx.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { FxService } from './fx.service';

@Controller('admin/fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  // POST /admin/fx/refresh  { base?: 'USD', target?: 'KES' }
  @Post('refresh')
  async refresh(@Body() body: { base?: string; target?: string }) {
    const base = (body?.base ?? 'USD').toUpperCase();
    const target = (body?.target ?? 'KES').toUpperCase();
    const rate = await this.fx.refreshRate(base, target);
    return { base, target, rate };
  }

  // POST /admin/fx/set { base: 'USD', target: 'KES', rate: 129.13, ttlSeconds?: 3600 }
  @Post('set')
  async set(@Body() body: { base: string; target: string; rate: number; ttlSeconds?: number }) {
    if (!body?.base || !body?.target || !body?.rate) return { error: 'base, target and rate required' };
    const result = await this.fx.setRate(body.base, body.target, Number(body.rate), body.ttlSeconds);
    return result;
  }
}

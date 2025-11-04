import { currencyForCountry } from '@app/utils/currency';
import {
  Controller,
  Get,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import geoip from 'geoip-lite'; 


@Controller('geo')
export class GeoController {
  private readonly logger = new Logger(GeoController.name);

  @Get()
  async detect(@Req() req: Request, @Res() res: Response) {
    const country = this.getCountryFromHeaders(req) || this.getCountryFromIp(req);
    const mapping = currencyForCountry(country ?? undefined);

    // set cookies (1 year)
    res.cookie('country', country ?? '', { path: '/', maxAge: 31536000000, sameSite: 'lax' });
    res.cookie('currency', mapping.currency, { path: '/', maxAge: 31536000000, sameSite: 'lax' });
    res.cookie('locale', mapping.locale, { path: '/', maxAge: 31536000000, sameSite: 'lax' });

    // include in headers for frontend or edge cache
    res.setHeader('X-Country', country ?? '');
    res.setHeader('X-Currency', mapping.currency);

    return res.json({
      country: country ?? null,
      currency: mapping.currency,
      locale: mapping.locale,
      source: country ? 'header/ip' : 'default',
    });
  }

  private getCountryFromHeaders(req: Request): string | null {
    const headerKeys = [
      'x-vercel-ip-country',
      'cf-ipcountry',
      'x-country',
      'x-forwarded-country',
      'x-app-country',
    ];

    for (const h of headerKeys) {
      const v = (req.headers[h] as string | undefined)?.trim();
      if (v && v !== 'XX' && v.length === 2) return v.toUpperCase();
    }
    return null;
  }

  private getCountryFromIp(req: Request): string | null {
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
    const ip = forwarded.split(',').map((x) => x.trim()).find(Boolean) ?? req.socket.remoteAddress;
    if (!ip) return null;

    const geo = geoip.lookup(ip);
    if (geo && geo.country) return geo.country.toUpperCase();

    this.logger.warn(`GeoIP failed for IP: ${ip}`);
    return null;
  }
}

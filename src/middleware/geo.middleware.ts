import { currencyForCountry } from '@app/utils/currency';
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import geoip from 'geoip-lite';


@Injectable()
export class GeoMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GeoMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const headerCountry =
      (req.headers['cf-ipcountry'] ||
        req.headers['x-vercel-ip-country'] ||
        req.headers['x-country'])?.toString().toUpperCase() || '';

    let country = headerCountry;
    if (!country || country === 'XX') {
      const xf = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
      const ip = xf.split(',').map((x) => x.trim()).find(Boolean) ?? req.socket.remoteAddress;
      const lookup = ip ? geoip.lookup(ip) : null;
      if (lookup?.country) country = lookup.country.toUpperCase();
    }

    const mapping = currencyForCountry(country || undefined);

    res.cookie('country', country || '', { path: '/', maxAge: 31536000000, sameSite: 'lax' });
    res.cookie('currency', mapping.currency, { path: '/', maxAge: 31536000000, sameSite: 'lax' });
    res.cookie('locale', mapping.locale, { path: '/', maxAge: 31536000000, sameSite: 'lax' });

    res.setHeader('X-Country', country || '');
    res.setHeader('X-Currency', mapping.currency);

    next();
  }
}

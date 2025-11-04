// src/modules/experiences/experiences.controller.ts
import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  Logger,
  DefaultValuePipe,
  Param,
  NotFoundException,
  Post,
  Body,
  Put,
  Delete,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ExperiencesService } from './experiences.service';
import { FxService } from '@app/fx-rates/fx.service';

const DEFAULT_CURRENCY = 'USD';
function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

@Controller('experiences')
export class ExperiencesController {
  private readonly logger = new Logger(ExperiencesController.name);

  constructor(
    private readonly service: ExperiencesService,
    private readonly fx: FxService,
  ) {}

  @Get(':slug')
  async findOne(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('currency') qCurrency?: string,
    @Query('convert', new DefaultValuePipe('true')) convertQ?: string,
  ) {
    const requestedCurrency =
      (qCurrency && qCurrency.toUpperCase()) ||
      (typeof req.headers['x-currency'] === 'string' &&
        (req.headers['x-currency'] as string).toUpperCase()) ||
      (req.cookies?.currency as string) ||
      DEFAULT_CURRENCY;

    const doConvert = convertQ !== 'false';
    const experience = await this.service.getBySlug(slug);

    if (!experience) {
      throw new NotFoundException(`Experience not found: ${slug}`);
    }

    const firstDur = experience.durations?.[0];
    const baseCurrency = (firstDur?.currency || DEFAULT_CURRENCY).toUpperCase();
    const origPrice = typeof firstDur?.priceFrom === 'number' ? firstDur.priceFrom : null;

    const rate =
      requestedCurrency === baseCurrency
        ? 1
        : await this.fx.getRate(baseCurrency, requestedCurrency).catch(() => 1);

    const convertedPrice =
      origPrice != null && doConvert ? Math.round(origPrice * rate * 100) / 100 : null;

    const mapped = {
      ...experience,
      fx: { rate, base: baseCurrency, target: requestedCurrency },
      convertedPrice,
    };

    return res.json(mapped);
  }

  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('featured') featured?: string,
    @Query('currency') qCurrency?: string,
    @Query('sortBy') sortBy?: string,
    @Query('convert', new DefaultValuePipe('true')) convertQ?: string,
  ) {
    const requestedCurrency =
      (qCurrency && qCurrency.toUpperCase()) ||
      (typeof req.headers['x-currency'] === 'string' && (req.headers['x-currency'] as string).toUpperCase()) ||
      (req.cookies?.currency as string) ||
      DEFAULT_CURRENCY;

    const doConvert = convertQ !== 'false';
    const needDurations = doConvert || sortBy === 'price-asc' || sortBy === 'price-desc';

    let raw: any[] = [];
    if (featured === 'true') {
      raw = needDurations ? await this.service.getFeaturedWithDurations() : await this.service.getFeatured();
    } else {
      raw = needDurations ? await this.service.getAllWithDurations() : await this.service.getAll();
    }

    const uniqueBases = new Set<string>();
    for (const d of raw) {
      if (Array.isArray(d.durations)) {
        for (const dur of d.durations) {
          const b = (dur.currency || DEFAULT_CURRENCY).toString().toUpperCase();
          uniqueBases.add(b);
        }
      } else {
        const b = (d.currency || DEFAULT_CURRENCY).toString().toUpperCase();
        uniqueBases.add(b);
      }
    }

    const rates: Record<string, number> = {};
    const ratePromises: Array<Promise<void>> = [];
    for (const base of Array.from(uniqueBases)) {
      if (base === requestedCurrency) {
        rates[base] = 1;
        continue;
      }
      const p = this.fx.getRate(base, requestedCurrency)
        .then((r) => { rates[base] = Number(r); })
        .catch((err) => {
          this.logger.warn(`FX fetch failed for ${base}->${requestedCurrency}: ${String(err?.message ?? err)}. Using fallback 1`);
          rates[base] = 1;
        });
      ratePromises.push(p);
    }
    await Promise.all(ratePromises);

    const mapped = raw.map((d: any) => {
      const convertPrice = (amount: number | null | undefined, baseCurrency?: string) => {
        if (amount == null) return null;
        const base = (baseCurrency || DEFAULT_CURRENCY).toString().toUpperCase();
        const rate = rates[base] ?? 1;
        const converted = round2(amount * rate);
        return { converted, rate, base, target: requestedCurrency };
      };

      let convertedDurations = undefined;
      if (Array.isArray(d.durations)) {
        convertedDurations = d.durations.map((dur: any) => {
          const origPrice = typeof dur.priceFrom === 'number' ? dur.priceFrom : null;
          const baseCurrency = dur.currency || d.currency || DEFAULT_CURRENCY;
          const fx = doConvert ? convertPrice(origPrice, baseCurrency) : null;
          return {
            id: dur.id,
            title: dur.title,
            days: dur.days,
            priceFrom: origPrice,
            priceCurrency: (baseCurrency || DEFAULT_CURRENCY).toUpperCase(),
            convertedPrice: fx ? fx.converted : null,
            fx: fx ? { rate: fx.rate, base: fx.base, target: fx.target } : null,
            priceModel: dur.priceModel,
          };
        });
      }

      const topOrig =
        typeof d.priceFrom === 'number'
          ? d.priceFrom
          : Array.isArray(d.durations) && typeof d.durations[0]?.priceFrom === 'number'
          ? d.durations[0].priceFrom
          : null;

      const topBase =
        (d.currency ||
          (Array.isArray(d.durations) && d.durations[0]?.currency) ||
          DEFAULT_CURRENCY).toString().toUpperCase();

      const topFx = doConvert && topOrig != null ? convertPrice(topOrig, topBase) : null;

      const fxSummary = topFx ?? (convertedDurations && convertedDurations[0]?.fx) ?? null;

      return {
        ...d,
        priceFrom: topOrig,
        priceCurrency: topBase ?? DEFAULT_CURRENCY,
        convertedPrice: topFx ? topFx.converted : (convertedDurations && convertedDurations[0]?.convertedPrice) ?? null,
        fx: fxSummary ? { rate: fxSummary.rate, base: fxSummary.base, target: fxSummary.target } : null,
        durations: convertedDurations ?? d.durations,
      };
    });

    if (sortBy === 'price-asc' || sortBy === 'price-desc') {
      mapped.sort((a: any, b: any) => {
        const aPrice = a.convertedPrice ?? (Array.isArray(a.durations) && a.durations[0]?.convertedPrice) ?? Number.POSITIVE_INFINITY;
        const bPrice = b.convertedPrice ?? (Array.isArray(b.durations) && b.durations[0]?.convertedPrice) ?? Number.POSITIVE_INFINITY;
        return sortBy === 'price-asc' ? aPrice - bPrice : bPrice - aPrice;
      });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('Vary', 'Cookie, Accept-Language, X-Currency, X-Country');

    return res.json({
      data: mapped,
      meta: {
        requestedCurrency,
        ratesUsed: Object.keys(rates).map((b) => ({ base: b, rate: rates[b] })),
        converted: doConvert,
        count: mapped.length,
      },
    });
  }

  // Admin endpoints:
  @Post()
  async create(@Body() body: any, @Res() res: Response) {
    try {
      const created = await this.service.createExperience(body);
      return res.status(201).json({ data: created });
    } catch (err) {
      this.logger.error('create experience failed', err);
      return res.status(500).json({ error: (err as any)?.message ?? 'Server error' });
    }
  }

  @Put(':slug')
  async update(@Param('slug') slug: string, @Body() body: any, @Res() res: Response) {
    try {
      const updated = await this.service.updateExperienceBySlug(slug, body);
      return res.status(200).json({ data: updated });
    } catch (err) {
      this.logger.error('update experience failed', err);
      if (err instanceof NotFoundException) return res.status(404).json({ error: err.message });
      return res.status(500).json({ error: (err as any)?.message ?? 'Server error' });
    }
  }

  @Delete(':slug')
  async remove(@Param('slug') slug: string, @Res() res: Response) {
    try {
      const result = await this.service.deleteBySlug(slug);
      return res.status(200).json(result);
    } catch (err: any) {
      this.logger.error('delete experience failed', err);
      if (err instanceof NotFoundException) return res.status(404).json({ error: err.message });
      return res.status(500).json({ error: err?.message ?? 'Delete failed' });
    }
  }

  @Post('bulk-delete')
  async bulkDelete(@Body() body: { ids?: string[]; by?: 'id'|'slug' }, @Res() res: Response) {
    try {
      const ids = Array.isArray(body?.ids) ? body.ids : [];
      const by: 'id'|'slug' = body?.by === 'slug' ? 'slug' : 'id';
      if (!ids.length) return res.status(200).json({ deleted: 0 });

      const result = await this.service.bulkDelete(ids, by);
      const deleted = (result && typeof (result as any).count === 'number') ? (result as any).count : 0;
      return res.status(200).json({ deleted });
    } catch (err:any) {
      this.logger.error('experience bulk delete failed', err);
      return res.status(500).json({ error: err?.message ?? 'Bulk delete failed' });
    }
  }

  @Delete(':slug/gallery')
  async removeGalleryItem(
    @Param('slug') slug: string,
    @Body() body: { id?: string; imageUrl?: string },
    @Res() res: Response,
  ) {
    try {
      const existing = await this.service.findBySlugOrId(slug);
      if (!existing) return res.status(404).json({ error: `Experience not found: ${slug}` });
      const experienceId = existing.id;

      const { id, imageUrl } = body ?? {};
      if (!id && !imageUrl) return res.status(400).json({ error: 'Provide id or imageUrl to delete' });

      let result = 0;
      if (id) result = await this.service.deleteGalleryById(experienceId, id);
      else result = await this.service.deleteGalleryByUrl(experienceId, imageUrl!);

      return res.status(200).json({ deleted: result });
    } catch (err:any) {
      this.logger.error('removeGalleryItem failed', err);
      return res.status(500).json({ error: err?.message ?? 'Server error' });
    }
  }
}

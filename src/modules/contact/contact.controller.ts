// src/modules/contact/contact.controller.ts
import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Logger,
  UseGuards,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service';
import type { CreateContactDto } from './dto/create-contact.dto';

@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(private readonly contactService: ContactService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 8, ttl: 60 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(@Body() dto: CreateContactDto | undefined, @Req() req: Request) {
    // Robust IP + UA extraction
    const xf = (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string) || '';
    const cf = (req.headers['cf-connecting-ip'] as string) || '';
    const ipFromHeader = xf ? xf.split(',')[0].trim() : cf || undefined;
    const ip = ipFromHeader ?? req.socket?.remoteAddress ?? req.ip;
    const ua = (req.headers['user-agent'] as string) || undefined;

    // debug logging to help trace shape of incoming body
    this.logger.debug('Controller: req.body type', { type: typeof (req as any).body, preview: JSON.stringify((req as any).body ?? '').slice(0, 400) });
    this.logger.debug('Controller: incoming rawBody (if present)', { rawBody: (req as any).rawBody ?? null });
    this.logger.debug('Controller: parsed DTO (before further processing)', dto ?? null);

    // Reconstruct an effective DTO if ValidationPipe returned undefined (e.g. body was a string or String wrapper)
    let effectiveDto: any = dto;

    try {
      if (!effectiveDto || typeof effectiveDto !== 'object' || Array.isArray(effectiveDto)) {
        const raw = (req as any).rawBody ?? (req as any).body ?? undefined;
        let parsed: any = undefined;

        // raw could be a JSON string or a String object
        if (raw && (typeof raw === 'string' || raw instanceof String || Object.prototype.toString.call(raw) === '[object String]')) {
          try {
            parsed = JSON.parse(String(raw));
            this.logger.debug('Controller: parsed raw string body into object for fallback', { preview: JSON.stringify(parsed).slice(0, 400) });
          } catch (e) {
            this.logger.debug('Controller: raw body is string but JSON.parse failed (fallback)', (e as any)?.message ?? e);
          }
        } else if (raw && typeof raw === 'object') {
          parsed = raw;
          // handle String wrapper edge-case
          if (parsed instanceof String || Object.prototype.toString.call(parsed) === '[object String]') {
            try {
              parsed = JSON.parse(String(parsed));
            } catch {
              /* ignore */
            }
          }
        }

        if (parsed && typeof parsed === 'object') {
          effectiveDto = parsed;
          this.logger.warn('Fallback: reconstructed DTO from raw request body (controller).', {
            preview: JSON.stringify(parsed).slice(0, 400),
          });
        }
      }
    } catch (err) {
      this.logger.debug('Error while attempting to parse raw request body for DTO fallback', (err as any)?.message ?? err);
    }

    // Validate required message early so Prisma never receives undefined
    const rawMessage = typeof effectiveDto?.message === 'string' ? String(effectiveDto.message).trim() : '';
    if (!rawMessage) {
      throw new BadRequestException('Message is required.');
    }
    if (rawMessage.length < 7) {
      throw new BadRequestException('Message is too short (min 7 characters).');
    }

    // Normalise
    effectiveDto.message = rawMessage;

    // Ensure optional keys exist as null (so Prisma receives explicit keys rather than omitted)
    effectiveDto.name = effectiveDto.name ?? null;
    effectiveDto.email = effectiveDto.email ?? null;
    effectiveDto.phone = effectiveDto.phone ?? null;
    effectiveDto.reason = effectiveDto.reason ?? null;
    effectiveDto.priority = effectiveDto.priority ?? null;
    effectiveDto.hostType = effectiveDto.hostType ?? null;
    effectiveDto.hostId = effectiveDto.hostId ?? null;
    effectiveDto.hostName = effectiveDto.hostName ?? null;
effectiveDto.hostEmail = effectiveDto.hostEmail ?? null; 
    try {
const result = await this.contactService.createContact(effectiveDto as CreateContactDto, { ip: String(ip ?? ''), userAgent: ua });
// result will be { record, adminSent, hostSent, hostEmail? }
return {
  ok: true,
  id: result.record?.id,
  createdAt: result.record?.createdAt,
  adminSent: !!result.adminSent,
  hostSent: !!result.hostSent,
  hostEmail: result.hostEmail ?? null,
  debug: {
    adminActual: result.adminSent,
    hostActual: result.hostSent,
  },
};

    } catch (err) {
      this.logger.error('contact create failed', err as any);
      throw new InternalServerErrorException('Failed to create contact');
    }
  }
}

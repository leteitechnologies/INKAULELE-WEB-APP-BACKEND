// src/modules/contact/admin.controller.ts
import {
  Controller,
  Get,
  Param,
  Query,
  Delete,
  Post,
  Logger,
  UseGuards,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { ContactService } from './contact.service';
import { AdminApiKeyGuard } from './admin.guard';

@Controller('admin/contact-requests')
@UseGuards(AdminApiKeyGuard)
export class AdminContactController {
  private readonly logger = new Logger(AdminContactController.name);

  constructor(private readonly contactService: ContactService) {}

  // GET /admin/contact-requests?limit=200&resolved=true
  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('resolved') resolved?: string,
    @Query('reason') reason?: string,
    @Query('excludeReason') excludeReason?: string, // <-- added
  ) {
    let l: number | undefined;
    if (typeof limit === 'string' && limit.trim() !== '') {
      const n = Number(limit);
      if (Number.isNaN(n) || n <= 0) {
        throw new BadRequestException('limit must be a positive integer');
      }
      l = Math.trunc(n);
    }

    let resolvedBool: boolean | undefined;
    if (typeof resolved === 'string') {
      if (resolved === 'true') resolvedBool = true;
      else if (resolved === 'false') resolvedBool = false;
      else throw new BadRequestException('resolved must be "true" or "false"');
    }

    const rows = await this.contactService.listContactRequests({
      limit: l,
      resolved: resolvedBool,
      reason,
      excludeReason, // <-- pass through
    });
    return { data: rows };
  }

  // GET /admin/contact-requests/:id
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const rec = await this.contactService.getContactRequest(id);
    if (!rec) throw new NotFoundException('Contact not found');
    return rec;
  }

  // DELETE /admin/contact-requests/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.contactService.deleteContactRequest(id);
    return;
  }

  // POST /admin/contact-requests/:id/resolve
  @Post(':id/resolve')
  async resolve(@Param('id') id: string) {
    const rec = await this.contactService.getContactRequest(id);
    if (!rec) throw new NotFoundException('Contact not found');
    if (rec.resolved) return { ok: true, alreadyResolved: true };
    await this.contactService.markContactResolved(id);
    return { ok: true };
  }

  // POST /admin/contact-requests/:id/view  -> mark viewed
  @Post(':id/view')
  async markViewed(@Param('id') id: string) {
    const rec = await this.contactService.getContactRequest(id);
    if (!rec) throw new NotFoundException('Contact not found');
    if (rec.viewed) return { ok: true, alreadyViewed: true };

    const updated = await this.contactService.markContactViewed(id);
    return { ok: true, viewed: updated.viewed, viewedAt: updated.viewedAt };
  }

  // POST /admin/contact-requests/:id/reply  -> send reply email
  @Post(':id/reply')
  async reply(@Param('id') id: string, @Body() body: { subject?: string; body?: string }) {
    const subject = (body?.subject ?? "").trim();
    const message = (body?.body ?? "").trim();
    if (!subject || !message) throw new BadRequestException('subject and body are required');
    await this.contactService.replyToContact(id, subject, message);
    return { ok: true };
  }
}

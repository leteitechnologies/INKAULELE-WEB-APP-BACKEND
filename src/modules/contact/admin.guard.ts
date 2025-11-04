// src/modules/contact/admin.guard.ts
import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(AdminApiKeyGuard.name);
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const headerKey = (req.headers['x-admin-api-key'] as string) || '';
    const authHeader = (req.headers['authorization'] as string) || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const expected = process.env.ADMIN_API_KEY ?? '';

    if (!expected) {
      // no key set in env -> allow (but warn)
      this.logger.warn('ADMIN_API_KEY is not set — admin guard permitting access (dev mode).');
      return true;
    }

    if (headerKey === expected || bearer === expected) {
      return true;
    }

    this.logger.warn('Admin API key mismatch', { headerKey: headerKey ? '[present]' : '[missing]', hasAuthBearer: !!bearer });
    return false;
  }
}

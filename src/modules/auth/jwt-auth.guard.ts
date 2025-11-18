// src/auth/backend-jwt.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const cookies = req.cookies || {};
    const header = req.headers?.authorization;
    const tokenFromHeader = header?.startsWith('Bearer ') ? header.split(' ')[1] : null;
    const token = tokenFromHeader || cookies[process.env.BACKEND_COOKIE_NAME || 'bk_admin'];

    if (!token) throw new UnauthorizedException('No admin token');

    try {
      const payload = jwt.verify(token, process.env.BACKEND_JWT_SECRET!);
      const sub = (payload as any).sub;
      if (!sub || sub !== process.env.ADMIN_CLERK_USER_ID) {
        throw new UnauthorizedException('Not the configured admin');
      }
      // attach user payload for other guards/controllers
      req.user = { id: sub, role: (payload as any).role || 'ADMIN' };
      return true;
    } catch (err) {
      console.warn('Backend token verify failed', (err as Error)?.message ?? err);
      throw new UnauthorizedException('Invalid admin token');
    }
  }
}

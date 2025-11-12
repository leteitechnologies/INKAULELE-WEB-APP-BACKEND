import { Controller, Post, Body, Res, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response, Request } from 'express';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  private readonly cookieName: string;
  private readonly cookieDomain?: string;

  constructor(
    private auth: AuthService,
    private users: UsersService,
    private cfg: ConfigService
  ) {
    // Initialize cookie-related values here — constructor runs after DI so this.cfg is available
    this.cookieName = this.cfg.get('COOKIE_NAME') || 'jid';
    // Optional: set COOKIE_DOMAIN in env to ".inkaulelesidan.com" in production
    this.cookieDomain = this.cfg.get('COOKIE_DOMAIN') || process.env.COOKIE_DOMAIN;
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Res() res: Response) {
    const user = await this.auth.validateUserByEmailAndPassword(body.email, body.password);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const token = this.auth.signToken({ id: user.id, email: user.email, role: user.role });

    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // For cross-subdomain usage in production, use 'none' + secure: true.
      // For local dev use 'lax' so cookies work on http://localhost.
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      domain: process.env.NODE_ENV === 'production' && this.cookieDomain ? this.cookieDomain : undefined,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log('Generated JWT token:', token);

    const safe = { id: user.id, email: user.email, name: user.name, role: user.role };
    return res.json({ user: safe });
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie(this.cookieName, {
      path: '/',
      domain: process.env.NODE_ENV === 'production' && this.cookieDomain ? this.cookieDomain : undefined,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });
    return res.json({ ok: true });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return { user: req.user };
  }
    @Post('forgot')
  async forgot(@Body() body: { email: string }) {
    await this.auth.sendPasswordReset(body.email);
    // always return 200 to avoid leaking whether email exists
    return { ok: true };
  }

  @Post('reset')
  async reset(@Body() body: { token: string; password: string }) {
    const ok = await this.auth.resetPassword(body.token, body.password);
    if (!ok) return { ok: false, message: 'Invalid or expired token' };
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@Req() req: Request, @Body() body: { currentPassword: string; newPassword: string }) {
    const user = req.user as any;
    const ok = await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
    if (!ok) return { ok: false, message: 'Invalid current password' };
    return { ok: true };
  }
}

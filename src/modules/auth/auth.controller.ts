import { Controller, Post, Body, Res, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response, Request } from 'express';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private users: UsersService,
    private cfg: ConfigService
  ) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Res() res: Response) {
    const user = await this.auth.validateUserByEmailAndPassword(body.email, body.password);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const token = this.auth.signToken({ id: user.id, email: user.email, role: user.role });

    res.cookie(this.cfg.get('COOKIE_NAME') || 'jid', token, {
      httpOnly: true,
     sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
secure: process.env.NODE_ENV === 'production' ? true : false,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
console.log('Generated JWT token:', token);

    // return user safe object
    const safe = { id: user.id, email: user.email, name: user.name, role: user.role };
    return res.json({ user: safe });
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie(this.cfg.get('COOKIE_NAME') || 'jid');
    return res.json({ ok: true });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    // validated by JwtStrategy -> req.user
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

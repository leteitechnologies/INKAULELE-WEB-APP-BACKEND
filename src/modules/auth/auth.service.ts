import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import * as crypto from 'crypto';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../../../prisma/prisma.service';
@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
  constructor(
    private jwt: JwtService,
    private usersService: UsersService,
    private prisma: PrismaService,
    private mailer: MailerService,
  ) {}
  async validateUserByEmailAndPassword(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const ok = await bcrypt.compare(password, (user as any).passwordHash);
    if (!ok) return null;
    return user;
  }

  signToken(user: { id: string; email: string; role?: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwt.sign(payload);
  }
  async sendPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // don't reveal

    // rate limit: check recent tokens
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      // optional: don't create a new token if one exists — re-send email instead
      try {
        await this.sendResetEmail(user.email, /* token placeholder? better store */ null, user.id);
      } catch (e) { this.logger.warn('failed to re-send reset email'); }
      return;
    }

    // create token
    const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    // send email with link to frontend reset page
    await this.sendResetEmail(user.email, token, user.id);
  }

  private async sendResetEmail(email: string, token: string | null, userId: string) {
    // create a friendly reset link
    const base = process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const link = token ? `${base}/admin/reset/${token}` : `${base}/admin/forgot?sent=1`;
    const subject = 'Reset your password';
    const html = `
      <p>We received a request to reset your password. Click the link below to set a new password (valid 1 hour):</p>
      <p><a href="${link}">Reset password</a></p>
      <p>If you did not request this, ignore this email.</p>
    `;

    // your MailerService.send(to, subject, html)
    await this.mailer.sendMail({ to: email, subject, html });
  }

  // consume token and set new password
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenRow = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, used: false, expiresAt: { gt: new Date() } },
    });
    if (!tokenRow) return false;

    // set new password
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: tokenRow.userId }, data: { passwordHash: hash } });

    // mark token used (single-use)
    await this.prisma.passwordResetToken.update({ where: { id: tokenRow.id }, data: { used: true } });

    // optionally: revoke active sessions — depends on your auth approach (rotate secret or maintain session table)
    return true;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) return false;
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return false;
    const newHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    return true;
  }
}

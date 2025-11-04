// src/modules/bookings/verify-voucher.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createHash } from 'crypto';

@Controller('admin/bookings')
export class VerifyVoucherController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('verify-voucher')
  async verify(@Body() body: { qrData?: string }) {
    const qrData = String(body?.qrData ?? '').trim();
    if (!qrData) return { ok: false, message: 'Missing qrData' };

    // 1) Try match by plain voucherToken (if you stored plain token)
    const byToken = await this.prisma.booking.findFirst({ where: { voucherToken: qrData } });
    if (byToken) {
      return { ok: true, bookingId: byToken.id, status: byToken.status, message: 'Voucher token matched' };
    }

    // 2) Try match by hashed token (if you store voucherTokenHash)
    const hash = createHash('sha256').update(qrData).digest('hex');
    const byHash = await this.prisma.booking.findFirst({ where: { voucherTokenHash: hash } });
    if (byHash) {
      return { ok: true, bookingId: byHash.id, status: byHash.status, message: 'Voucher token hash matched' };
    }

    // 3) Try lookup by voucher publicId contained in URL (QR might encode full URL or public id)
    const voucher = await this.prisma.voucher.findFirst({ where: { publicId: { contains: qrData } }});
    if (voucher) {
const b = await this.prisma.booking.findUnique({ where: { id: voucher.bookingId } });
if (!b) {
  return { ok: false, message: 'Booking not found for this voucher' };
}

return { ok: true, bookingId: b.id, status: b.status, message: 'Voucher publicId matched' };

    }

    // 4) Try lookup by receipt publicId
    const receipt = await this.prisma.receipt.findFirst({ where: { publicId: { contains: qrData } }});
    if (receipt) {
const b = await this.prisma.booking.findUnique({ where: { id: receipt.bookingId } });
if (!b) {
  return { ok: false, message: 'Booking not found for this receipt' };
}

return { ok: true, bookingId: b.id, status: b.status, message: 'Receipt matched' };

    }

    // 5) fallback: maybe QR encodes booking reference (ref)
    const byRef = await this.prisma.booking.findFirst({ where: { reference: qrData }});
    if (byRef) {
      return { ok: true, bookingId: byRef.id, status: byRef.status, message: 'Booking reference matched' };
    }

    return { ok: false, message: 'No matching voucher/receipt found' };
  }
}

// src/modules/files/files.controller.ts
import { Controller, Get, Param, Req, Res, Query, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReceiptService } from '../receipt/receipt.service';
import { VoucherService } from '../voucher/voucher.service';

@Controller()
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptService: ReceiptService,
    private readonly voucherService: VoucherService,
  ) {}

  // Short, friendly URL -> redirects to Cloudinary signed URL
  // GET /bookings/:id/receipt/download
  @Get('bookings/:id/receipt/download')
  async downloadReceipt(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: any,
    @Query('session_id') sessionId?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, include: { receipt: true } });
    if (!booking) throw new NotFoundException('Booking not found');

    // authorization same as your other endpoints (owner/admin or session)
    const user = req.user;
    const allowedBySession = !!(sessionId && booking.stripeCheckoutSessionId && sessionId === booking.stripeCheckoutSessionId);
    if (!user && !allowedBySession) throw new ForbiddenException('Authentication required');
    if (user && user.role !== 'ADMIN' && user.email !== booking.travelerEmail) {
      throw new ForbiddenException('You do not have access to this receipt');
    }

    if (!booking.receipt?.publicId) {
      // Option: generate here (sync) or return 404/instruction
      throw new NotFoundException('Receipt not available');
    }

    const filename = booking.receipt.filename ?? `Inkaulele-Receipt-${booking.reference ?? booking.id}.pdf`;
    const url = await this.receiptService.createPrivateDownloadUrl(booking.receipt.publicId, filename, 60 * 60);

    // Server-side redirect to cloudinary (location header); browser will download
    return res.redirect(url);
  }

  // Similarly for voucher: GET /bookings/:id/voucher/download
  @Get('bookings/:id/voucher/download')
  async downloadVoucher(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: any,
    @Query('session_id') sessionId?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, include: { voucher: true } });
    if (!booking) throw new NotFoundException('Booking not found');

    const user = req.user;
    const allowedBySession = !!(sessionId && booking.stripeCheckoutSessionId && sessionId === booking.stripeCheckoutSessionId);
    if (!user && !allowedBySession) throw new ForbiddenException('Authentication required');
    if (user && user.role !== 'ADMIN' && user.email !== booking.travelerEmail) {
      throw new ForbiddenException('You do not have access to this voucher');
    }

    if (!booking.voucher?.publicId) {
      throw new NotFoundException('Voucher not available');
    }

    const filename = booking.voucher.filename ?? `Inkaulele-Voucher-${booking.reference ?? booking.id}.pdf`;
    const url = await this.voucherService.createPrivateDownloadUrl(booking.voucher.publicId, filename, 60 * 60);
    return res.redirect(url);
  }
}

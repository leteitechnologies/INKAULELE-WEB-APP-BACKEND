// src/workers/documents.worker.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module'; // adjust to your repository AppModule path

import { VoucherService } from '../modules/voucher/voucher.service';
import { ReceiptService } from '../modules/receipt/receipt.service';
import { TravelPackService } from '../modules/travelpack/travelpack.service';
import { MailerService } from '../modules/mailer/mailer.service';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export class DocumentsWorker {
  private readonly logger = new Logger(DocumentsWorker.name);

  // services (will be populated by create())
  private prisma!: PrismaService;
  private voucherService!: VoucherService;
  private receiptService!: ReceiptService;
  private travelPackService!: TravelPackService;
  private mailer!: MailerService;
// simple helper - find by email or name, or create
private async findOrCreateSupplierRow(s: { name?: string; email?: string; phone?: string; type?: string }) {
  let where: any = {};
  if (s.email) where.email = s.email;
  else if (s.name) where.name = s.name;

  let sup = null;
  if (Object.keys(where).length) {
    sup = await this.prisma.supplier.findFirst({ where });
  }

  if (!sup) {
    sup = await this.prisma.supplier.create({
      data: {
        name: s.name ?? 'Supplier',
        type: (s.type ?? 'OTHER') as any,
        phone: s.phone ?? undefined,
        email: s.email ?? undefined,
      },
    });
  }

  return sup;
}

  private constructor() {}

  static async create(): Promise<DocumentsWorker> {
    // bootstrap Nest application context so DI provides configured services
    const appCtx = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const w = new DocumentsWorker();

    w.prisma = appCtx.get(PrismaService);
    w.voucherService = appCtx.get(VoucherService);
    w.receiptService = appCtx.get(ReceiptService);
    w.travelPackService = appCtx.get(TravelPackService);
    w.mailer = appCtx.get(MailerService);

    // optional: handle termination to close appCtx
    process.on('SIGINT', async () => {
      await appCtx.close();
      process.exit(0);
    });

    return w;
  }

  async handle(bookingId: string) {
    this.logger.log(`Processing booking ${bookingId}`);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { destination: true, durationOption: true, receipt: true, voucher: true },
    });
    if (!booking) {
      this.logger.warn('Booking not found: ' + bookingId);
      return;
    }

    // If TravelPack exists, still ensure supplier vouchers present & emailed
    const existingTravelPack = await this.prisma.travelPack.findUnique({ where: { bookingId } });
    if (existingTravelPack) {
      this.logger.log('TravelPack already exists; ensuring supplier vouchers exist');
      const suppliers = this.extractSuppliers(booking);
      for (const s of suppliers) {
        const found = await this.prisma.supplierVoucher.findFirst({
          where: { bookingId: booking.id, supplierName: s.name, supplierRef: s.ref },
        });
        if (!found) {
          const sv = await this.voucherService.prepareSupplierVoucherAndGetUrl(booking, s, 24 * 3600);
  const supplierRow = await this.findOrCreateSupplierRow({ name: s.name, email: s.email, phone: s.phone, type: s.type });

await this.prisma.supplierVoucher.create({
  data: {
    publicId: sv.publicId,
    filename: sv.filename,
    uploadedAt: new Date(),
    contactJson: { phone: s.phone ?? null, email: s.email ?? null },
    // connect relations (typed-safe)
    booking: { connect: { id: booking.id } },
    supplier: { connect: { id: supplierRow.id } },
    // keep supplierName/type/ref scalar columns if you still want them populated
    supplierName: s.name,
    supplierType: s.type,
    supplierRef: s.ref,
  },
});

          await this.mailer.sendSupplierVoucherEmail({ supplier: s, booking, voucherUrl: sv.url });
          await this.prisma.supplierVoucher.updateMany({
            where: { bookingId: booking.id, publicId: sv.publicId },
            data: { emailedAt: new Date() },
          });
        }
      }
      return { already: true };
    }

    // 1) Generate receipt (if you use receipts in travel pack)
    const receiptResult = await this.receiptService.prepareReceiptAndGetUrl(booking, 24 * 3600);

    // 2) Generate supplier vouchers and persist safely
    const suppliers = this.extractSuppliers(booking);
    const supplierResults: Array<{ url: string; publicId: string; filename: string; buffer?: Buffer }> = [];

    for (const s of suppliers) {
      const sv = await this.voucherService.prepareSupplierVoucherAndGetUrl(booking, s, 24 * 3600);
      supplierResults.push(sv);

      // persist record safely (findFirst -> create/update)
      const existing = await this.prisma.supplierVoucher.findFirst({
        where: { OR: [{ publicId: sv.publicId }, { bookingId: booking.id, supplierRef: s.ref ?? undefined }] },
      });

      if (existing) {
        await this.prisma.supplierVoucher.update({
          where: { id: existing.id },
          data: { filename: sv.filename, uploadedAt: new Date(), contactJson: { phone: s.phone ?? null, email: s.email ?? null } as any },
        });
      } else {
const supplierRow = await this.findOrCreateSupplierRow({ name: s.name, email: s.email, phone: s.phone, type: s.type });

await this.prisma.supplierVoucher.create({
  data: {
    publicId: sv.publicId,
    filename: sv.filename,
    uploadedAt: new Date(),
    contactJson: { phone: s.phone ?? null, email: s.email ?? null },
    booking: { connect: { id: booking.id } },
    supplier: { connect: { id: supplierRow.id } },
    supplierName: s.name,
    supplierType: s.type,
    supplierRef: s.ref,
  },
});

      }

      // email supplier
      await this.mailer.sendSupplierVoucherEmail({ supplier: s, booking, voucherUrl: sv.url });
      await this.prisma.supplierVoucher.updateMany({
        where: { bookingId: booking.id, publicId: sv.publicId },
        data: { emailedAt: new Date() },
      }).catch(() => {});
    }

    // 3) Build travel pack (merge receipt + supplier buffers)
    const buffers = [receiptResult.buffer, ...supplierResults.map(r => r.buffer)].filter(Boolean) as Buffer[];
    const travelPackResult = await this.travelPackService.prepareTravelPackAndGetUrl(booking, buffers, 24 * 3600);

    // 4) Email traveler with travel pack
    if (booking.travelerEmail) {
      await this.mailer.sendTravelPackEmail({
        to: booking.travelerEmail,
        booking,
        travelPackUrl: travelPackResult.url,
        travelPackPdfBuffer: travelPackResult.buffer,
      });

      await this.prisma.travelPack.update({
        where: { bookingId: booking.id },
        data: { emailedAt: new Date() },
      }).catch(() => {});
    } else {
      this.logger.warn(`Booking ${booking.id} has no travelerEmail; travel pack created but not emailed`);
    }

    this.logger.log(`Processing complete for booking ${bookingId}`);
    return { success: true };
  }

  private extractSuppliers(booking: any) {
    const suppliers: any[] = [];
    // host as supplier
    if (booking.destination?.host) {
      const host = booking.destination.host;
      suppliers.push({
        name: host.name ?? host.company ?? 'Supplier',
        type: host.type ?? 'supplier',
        ref: host.id ?? null,
        phone: host.phone ?? host.contact ?? booking.supplierPhone ?? null,
        email: host.email ?? null,
      });
    }
    // booking-level supplier fallback
    if (booking.supplierName) {
      suppliers.push({
        name: booking.supplierName,
        type: 'supplier',
        ref: null,
        phone: booking.supplierPhone ?? null,
        email: null,
      });
    }
    // extend for transfers/activities when you store them on booking/durationOption
    return suppliers;
  }
}

// src/modules/documents/documents.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { VoucherService } from '@app/modules/voucher/voucher.service';
import { ReceiptService } from '@app/modules/receipt/receipt.service';
import { MailerService } from '@app/modules/mailer/mailer.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TravelPackService } from '../travelpack/travelpack.service';

// Raw supplier shape from DB / booking (may contain nulls)
type SupplierMeta = {
  name?: string;
  type?: string;
  ref?: string | null;
  phone?: string | null;
  email?: string | null;
  extras?: any;
};

// Normalized supplier shape expected by other services (no nulls)
type NormalizedSupplier = {
  name?: string;
  type?: string;
  ref?: string;
  phone?: string;
  email?: string;
  extras?: any;
};

type PdfArtifact = {
  url: string;
  publicId: string;
  filename?: string | null;
  buffer?: Buffer | ArrayBuffer | Uint8Array | ArrayBufferView | undefined;
};

type SupplierResult = {
  url: string;
  publicId: string;
  filename: string;
  buffer?: Buffer;
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private voucherService: VoucherService,
    private receiptService: ReceiptService,
    private travelPackService: TravelPackService,
    private mailer: MailerService,
  ) {}

  /**
   * Find or create a Supplier DB row for a NormalizedSupplier.
   * Uses findFirst by email or name (email isn't unique in your schema by default).
   * Returns the supplier row (including id).
   */
  private async findOrCreateSupplierRow(s: NormalizedSupplier) {
    // Build basic where clause preference: email -> name
    const where: any = {};
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
          // cast because your enum type may expect SupplierType; adapt if you keep strong typing
          type: (s.type ?? 'OTHER') as any,
          phone: s.phone ?? undefined,
          email: s.email ?? undefined,
          // optionally persist extras to `notes` or other field if desirable:
          // notes: JSON.stringify(s.extras || {}),
        },
      });
    }

    return sup;
  }

  // job processor
  async generateForBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { destination: true, durationOption: true },
    });
    if (!booking) throw new Error('booking not found');

    // idempotency: check if travelpack exists
    const existing = await this.prisma.travelPack.findUnique({ where: { bookingId } });
    if (existing) {
      this.logger.log(`TravelPack already exists for ${bookingId}`);
      return {
        already: true,
        url: this.travelPackService.createDownloadUrl(
          existing.publicId,
          existing.filename ?? `TravelPack-${booking.reference ?? booking.id}.pdf`,
          24 * 3600,
        ),
      };
    }

    // 1) Generate receipt PDF artifact
    const receiptRes: PdfArtifact = await this.receiptService.prepareReceiptAndGetUrl(booking, 24 * 3600);

    // 2) Discover & create supplier vouchers
    const supplierList = this.extractSuppliers(booking); // SupplierMeta[]
    const supplierResults: SupplierResult[] = [];

    for (const rawSupplier of supplierList) {
      // Normalize supplier: convert null -> undefined; ensure string types
      const supplier: NormalizedSupplier = {
        name: rawSupplier.name ?? undefined,
        type: rawSupplier.type ?? undefined,
        ref: rawSupplier.ref ?? undefined,
        phone: rawSupplier.phone ?? undefined,
        email: rawSupplier.email ?? undefined,
        extras: rawSupplier.extras,
      };

      // Pass normalized supplier to voucher generator (matches expected signature)
      const sv: PdfArtifact = await this.voucherService.prepareSupplierVoucherAndGetUrl(booking, supplier, 24 * 3600);

      // Coerce any buffer-like into Node Buffer
      let coercedBuffer: Buffer | undefined = undefined;
      if (sv.buffer) {
        if (Buffer.isBuffer(sv.buffer)) {
          coercedBuffer = sv.buffer;
        } else if (ArrayBuffer.isView(sv.buffer)) {
          coercedBuffer = Buffer.from(new Uint8Array((sv.buffer as any).buffer, (sv.buffer as any).byteOffset, (sv.buffer as any).byteLength));
        } else if (sv.buffer instanceof ArrayBuffer) {
          coercedBuffer = Buffer.from(new Uint8Array(sv.buffer));
        } else {
          coercedBuffer = Buffer.from(sv.buffer as any);
        }
      }

      const safeFilename =
        sv.filename ??
        `SupplierVoucher-${(supplier.name ?? 'supplier').replace(/\s+/g, '_')}-${booking.reference ?? booking.id}.pdf`;

      supplierResults.push({
        url: sv.url,
        publicId: sv.publicId,
        filename: safeFilename,
        buffer: coercedBuffer,
      });

      // --- NEW: ensure supplier DB row and upsert supplierVoucher with nested connect ---
      try {
        // ensure supplier row exists (and get id)
        const supplierRow = await this.findOrCreateSupplierRow(supplier);
        const supplierId = supplierRow?.id;

        // Build create & update payloads using nested relations (booking + supplier)
        const createPayload: any = {
          publicId: sv.publicId,
          supplierName: supplier.name ?? undefined,
          supplierType: supplier.type ?? undefined,
          supplierRef: supplier.ref ?? undefined,
          filename: safeFilename,
          uploadedAt: new Date(),
          contactJson: {
            phone: supplier.phone ?? undefined,
            email: supplier.email ?? undefined,
          },
          // nested relation - booking must be connected
          booking: { connect: { id: booking.id } },
        };

        if (supplierId) {
          createPayload.supplier = { connect: { id: supplierId } };
        }

        const updatePayload: any = {
          supplierName: supplier.name ?? undefined,
          supplierType: supplier.type ?? undefined,
          filename: safeFilename,
          uploadedAt: new Date(),
          contactJson: {
            phone: supplier.phone ?? undefined,
            email: supplier.email ?? undefined,
          },
          // ensure booking relation remains connected (safe to call)
          booking: { connect: { id: booking.id } },
        };
        if (supplierId) {
          updatePayload.supplier = { connect: { id: supplierId } };
        }

        await this.prisma.supplierVoucher.upsert({
          where: { publicId: sv.publicId },
          update: updatePayload,
          create: createPayload,
        });
      } catch (err) {
        this.logger.warn('Failed to upsert supplierVoucher row', err);
      }

      // Email supplier: pass normalized supplier (no nulls)
      await this.mailer.sendSupplierVoucherEmail({
        supplier: { name: supplier.name, phone: supplier.phone, email: supplier.email },
        booking,
        voucherUrl: sv.url,
      });

      // mark emailedAt (best effort)
      await this.prisma.supplierVoucher
        .updateMany({
          where: { bookingId: booking.id, publicId: sv.publicId },
          data: { emailedAt: new Date() },
        })
        .catch(() => {});
    } // end supplier loop

    // 3) Build master TravelPack: collect buffers (receipt + supplier buffers)
    const mergedBuffers: Buffer[] = [];

    // receipt buffer coercion
    if (receiptRes?.buffer) {
      if (Buffer.isBuffer(receiptRes.buffer)) mergedBuffers.push(receiptRes.buffer);
      else if (ArrayBuffer.isView(receiptRes.buffer)) mergedBuffers.push(Buffer.from(new Uint8Array((receiptRes.buffer as any).buffer, (receiptRes.buffer as any).byteOffset, (receiptRes.buffer as any).byteLength)));
      else if (receiptRes.buffer instanceof ArrayBuffer) mergedBuffers.push(Buffer.from(new Uint8Array(receiptRes.buffer)));
      else mergedBuffers.push(Buffer.from(receiptRes.buffer as any));
    }

    // supplier buffers
    for (const r of supplierResults) {
      if (r.buffer) mergedBuffers.push(r.buffer);
    }

    const travelPackResult = await this.travelPackService.prepareTravelPackAndGetUrl(booking, mergedBuffers, 24 * 3600);

    // 4) Email traveler with TravelPack attached and links (only if traveler email exists)
    if (booking.travelerEmail) {
      await this.mailer.sendTravelPackEmail({
        to: booking.travelerEmail,
        booking,
        travelPackUrl: travelPackResult.url,
        travelPackPdfBuffer: travelPackResult.buffer as Buffer | undefined,
      });

      // persist emailedAt
      await this.prisma.travelPack
        .update({
          where: { bookingId: booking.id },
          data: { emailedAt: new Date() },
        })
        .catch(() => {});
    } else {
      this.logger.warn(`Booking ${booking.id} has no travelerEmail — travel pack created but not emailed.`);
      // option: send admin notification here
    }

    return { travelPack: travelPackResult, suppliers: supplierResults };
  }

  private extractSuppliers(booking: any): SupplierMeta[] {
    const suppliers: SupplierMeta[] = [];

    if (booking.destination?.host) {
      try {
        const host = booking.destination.host;
        suppliers.push({
          name: (host.name as string | undefined) ?? (host.company as string | undefined) ?? 'Supplier',
          type: host.type ?? 'supplier',
          ref: host.id ?? null,
          phone: (host.phone as string | undefined) ?? (host.contact as string | undefined) ?? booking.supplierPhone ?? null,
          email: host.email ?? null,
          extras: {},
        });
      } catch {
        // ignore malformed host
      }
    }

    if (booking.supplierName) {
      suppliers.push({
        name: booking.supplierName,
        type: 'supplier',
        ref: null,
        phone: booking.supplierPhone ?? null,
        email: null,
      });
    }

    return suppliers;
  }
}

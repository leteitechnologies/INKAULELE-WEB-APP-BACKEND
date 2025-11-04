// src/modules/travelpack/travelpack.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const prisma = new PrismaClient();

@Injectable()
export class TravelPackService {
  private readonly logger = new Logger(TravelPackService.name);

  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  private sanitizeFilename(name: string) {
    const base = path.basename(name || 'travelpack.pdf');
    return base.replace(/[^\w\s.\-()_,]/g, '_');
  }

  private async uploadPdf(buffer: Buffer, publicId: string) {
    return new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({
        resource_type: 'raw',
        type: 'private',
        public_id: publicId,
        overwrite: true,
        use_filename: false,
      }, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
      const streamifier = require('streamifier');
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  private async mergeBuffers(buffers: Buffer[]) {
    const merged = await PDFDocument.create();
    for (const b of buffers) {
      const donor = await PDFDocument.load(b);
      const copied = await merged.copyPages(donor, donor.getPageIndices());
      for (const page of copied) merged.addPage(page);
    }
    const out = await merged.save();
    return Buffer.from(out);
  }

  // booking: booking object; componentBuffers: array of Buffer (receipt, supplier vouchers)
  async prepareTravelPackAndGetUrl(booking: any, componentBuffers: Buffer[], expiresSeconds = 3600) {
    try {
      const ref = booking.reference ?? `BK-${(booking.id || '').slice(0,8).toUpperCase()}`;
      const filename = `TravelPack-${ref}.pdf`;
      const publicId = `travelpacks/${booking.id}/${ref}.pdf`;

      // Merge buffers (if components exist). If no buffers, create a simple single-page HTML rendered by puppeteer (omitted here)
      const mergedBuf = await this.mergeBuffers(componentBuffers);

      // upload
      await this.uploadPdf(mergedBuf, publicId);

      // persist TravelPack row
      try {
        await prisma.travelPack.upsert({
          where: { bookingId: booking.id },
          update: { publicId, filename, uploadedAt: new Date() },
          create: { bookingId: booking.id, publicId, filename, uploadedAt: new Date() },
        });
      } catch (err) {
        this.logger.warn('Failed to persist travelPack row', err);
      }

      const url = this.createDownloadUrl(publicId, filename, expiresSeconds); // public method
      return { url, publicId, filename, buffer: mergedBuf };
    } catch (err) {
      this.logger.error('prepareTravelPack failed', err);
      throw new InternalServerErrorException('Failed to prepare travel pack');
    }
  }

  // <-- PUBLIC helper: make this accessible from other services
  public createDownloadUrl(publicId: string, filename = 'travelpack.pdf', expiresSeconds = 3600) {
    const safeFilename = this.sanitizeFilename(filename);
    const expiresAt = Math.floor(Date.now() / 1000) + expiresSeconds;
    const url = cloudinary.utils.private_download_url(publicId, 'pdf', {
      resource_type: 'raw',
      type: 'private',
      expires_at: expiresAt,
      attachment: safeFilename as any,
    });
    return url;
  }
}

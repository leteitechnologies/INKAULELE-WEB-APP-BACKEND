// src/utils/pdf-utils.ts
import { PDFDocument } from 'pdf-lib';

export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const b of buffers) {
    const donor = await PDFDocument.load(b);
    const copied = await merged.copyPages(donor, donor.getPageIndices());
    copied.forEach(p => merged.addPage(p));
  }
  const out = await merged.save();
  return Buffer.from(out);
}

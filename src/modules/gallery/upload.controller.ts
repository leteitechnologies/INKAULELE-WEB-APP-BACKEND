import { Controller, Post, Body, UseGuards, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Express } from 'express'; 
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import * as crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { FileInterceptor } from '@nestjs/platform-express';

// configure Cloudinary once (safe to do here)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

@Controller('/admin/gallery')
export class GalleryUploadController {
  // 1) Return a signature + metadata so client can upload directly to Cloudinary
  // Client will POST to https://api.cloudinary.com/v1_1/<cloudName>/auto/upload (or use 'image' endpoint)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'EDITOR')
  @Post('upload-signature')
  async getUploadSignature(
    @Body() body: { folder?: string; eager?: string; useFilename?: boolean; uniqueFilename?: boolean },
  ) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
    const apiKey = process.env.CLOUDINARY_API_KEY!;
    const apiSecret = process.env.CLOUDINARY_API_SECRET!;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException('Cloudinary is not configured on the server.');
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Build params that will be signed.
    // Add any additional params you will send from client (folder, eager, etc).
    const paramsToSign: Record<string, any> = { timestamp };

    // allow caller to pass a folder (otherwise default folder)
    const folder = body.folder || process.env.CLOUDINARY_UPLOAD_FOLDER || 'gallery';
    paramsToSign.folder = folder;

    // example: add eager transformations if provided (optional)
    if (body.eager) {
      paramsToSign.eager = body.eager; // e.g. "c_fill,w_800,h_600"
    }

    // Build the string to sign: sorted keys joined with '&' e.g. "folder=gallery&timestamp=1234"
    const toSign = Object.keys(paramsToSign)
      .sort()
      .map((k) => `${k}=${paramsToSign[k]}`)
      .join('&');

    const signature = crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');

    return {
      cloudName,
      apiKey,
      timestamp,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      folder,
      // client-side hints:
      useFilename: body.useFilename ?? true,
      uniqueFilename: body.uniqueFilename ?? false,
    };
  }

  // 2) Optional: server-side upload (admin posts the file directly to your backend)
  // Use this if you prefer not to allow client direct uploads.
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles('ADMIN', 'EDITOR')
//   @UseInterceptors(FileInterceptor('file'))
//   @Post('upload')
//   async serverUpload(@UploadedFile() file: Express.Multer.File, @Body() body: { folder?: string }) {
//     if (!file) {
//       throw new BadRequestException('No file uploaded');
//     }
//     const folder = body.folder || process.env.CLOUDINARY_UPLOAD_FOLDER || 'gallery';

//     // use upload_stream for streaming buffer
//     const uploadResult: any = await new Promise((resolve, reject) => {
//       const stream = cloudinary.uploader.upload_stream(
//         {
//           folder,
//           use_filename: true,
//           unique_filename: false,
//           resource_type: 'auto', // accepts images & video automatically
//         },
//         (error, result) => {
//           if (error) return reject(error);
//           resolve(result);
//         },
//       );

//       stream.end(file.buffer);
//     });

//     // uploadResult contains secure_url, public_id, width, height, format, etc.
//     return {
//       ok: true,
//       result: {
//         publicUrl: uploadResult.secure_url,
//         publicId: uploadResult.public_id,
//         width: uploadResult.width,
//         height: uploadResult.height,
//         format: uploadResult.format,
//         bytes: uploadResult.bytes,
//       },
//     };
//   }
}

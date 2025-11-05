// // main.ts
// import dns from 'dns';
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import * as bodyParser from 'body-parser';
// import * as dotenv from 'dotenv';
// import { GeoMiddleware } from './middleware/geo.middleware';
// import cookieParser from 'cookie-parser';
// import { ValidationPipe } from '@nestjs/common';
// // TEMP - debug only
// const raw = process.env.DATABASE_URL ?? '<not-set>';
// const masked = raw.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
// console.log('DATABASE_URL (masked):', masked);


// dotenv.config();
// dns.setDefaultResultOrder?.('ipv4first'); 
// async function bootstrap() {
//   // rawBody: true ensures Nest doesn't drop the raw buffer
//   const app = await NestFactory.create(AppModule, { rawBody: true });
// app.use(cookieParser());
//   // IMPORTANT: register raw parser for the exact stripe webhook route BEFORE any JSON parser
//   // Adjust path if your controller uses different route (e.g. '/checkout/webhook' or '/webhooks/stripe')
//   app.use('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }));
//   app.use(new GeoMiddleware().use);
//   // Normal JSON parser for all other routes
//   app.use(bodyParser.json());


//   // read a comma-separated list of allowed origins from env
// const raw =
//   process.env.FRONTEND_ORIGIN ||
//   "http://localhost:3001,http://localhost:3002,http://192.168.8.12:3001,http://192.168.8.12:3002,https://eda8be0d3324.ngrok-free.app,https://inkaulele.vercel.app,https://inkaulele-887fo627q-leteis-projects.vercel.app,https://www.inkaulelesidan.com";


//   const allowed = raw.split(",").map(s => s.trim()).filter(Boolean);
  
//   const wildcardAllowed = [
//   /\.vercel\.app$/,
//   /\.ngrok-free\.app$/,
// ];
// app.enableCors({
//   origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
//     // allow non-browser (server-to-server) requests without origin (curl, Postman)
//     if (!origin) return callback(null, true);
//     if (allowed.includes("*")) return callback(null, true);
//     if (allowed.includes(origin)) return callback(null, true);

//     console.warn(`CORS blocked origin: ${origin}. Allowed: ${allowed.join(", ")}`);
//     return callback(new Error("CORS not allowed"), false);
//   },
//   methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
//   allowedHeaders: "Content-Type,Authorization,Accept",
//   credentials: true,
// });


//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       transform: true,
//       forbidNonWhitelisted: false,
//       transformOptions: { enableImplicitConversion: true },
//     }),
//   );
//   const port = Number(process.env.PORT ?? 4001);
//   await app.listen(port, '0.0.0.0');
//   console.log(`Listening on http://0.0.0.0:${port}`);
// }
// bootstrap();
// main.ts (serverless-friendly for Vercel)
// NOTE: keep top-level imports and dotenv early
import 'reflect-metadata';
import dns from 'dns';
import express, { Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { GeoMiddleware } from './middleware/geo.middleware';

dotenv.config();
dns.setDefaultResultOrder?.('ipv4first');

// Masked debug (optional)
const rawDb = process.env.DATABASE_URL ?? '<not-set>';
try {
  const masked = rawDb.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
  console.log('DATABASE_URL (masked):', masked);
} catch {
  console.log('DATABASE_URL present but masking failed');
}

let cachedExpressApp: express.Express | null = null;

async function createNestApp(): Promise<express.Express> {
  if (cachedExpressApp) return cachedExpressApp;

  const expressApp = express();

  // IMPORTANT: register raw parser for Stripe BEFORE JSON parser
  expressApp.use('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }));

  // Now other parsers / middleware
  expressApp.use(cookieParser());
  expressApp.use(bodyParser.json());

  // If GeoMiddleware is a simple function that accepts (req,res,next),
  // register it on expressApp as you did with app.use(new GeoMiddleware().use)
  try {
    expressApp.use(new GeoMiddleware().use);
  } catch (err) {
    console.warn('Could not register GeoMiddleware on express app directly — falling back to Nest middleware if needed.', err);
  }

  // Create Nest with ExpressAdapter and disable built-in body parser (we registered ours)
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bodyParser: false,
  });

  // CORS: re-create your existing logic
  const rawOrigins =
    process.env.FRONTEND_ORIGIN ||
    'http://localhost:3001,http://localhost:3002,http://192.168.8.12:3001,http://192.168.8.12:3002,https://eda8be0d3324.ngrok-free.app,https://inkaulele.vercel.app,https://inkaulele-887fo627q-leteis-projects.vercel.app,https://www.inkaulelesidan.com';
  const allowed = rawOrigins.split(',').map(s => s.trim()).filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (allowed.includes('*')) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);

      console.warn(`CORS blocked origin: ${origin}. Allowed: ${allowed.join(', ')}`);
      return callback(new Error('CORS not allowed'), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,Accept',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();

  cachedExpressApp = expressApp;
  return expressApp;
}

/**
 * Handler exported for Vercel (serverless). Vercel will call this file
 * as a module; the exported default function will be invoked per-request.
 *
 * Locally (non-Vercel), we also start a listener so `node dist/main.js` still works.
 */
export default async function handler(req: Request, res: Response) {
  try {
    const server = await createNestApp();
    return server(req, res);
  } catch (err) {
    console.error('Handler bootstrap error:', err);
    res.status(500).send('Server bootstrap failed');
  }
}

// If not running on Vercel, start an HTTP server for local dev:
if (!process.env.VERCEL) {
  (async () => {
    try {
      const server = await createNestApp();
      const port = Number(process.env.PORT ?? 4001);
      server.listen(port, '0.0.0.0', () => {
        console.log(`Listening on http://0.0.0.0:${port}`);
      });
    } catch (err) {
      console.error('Failed to start local server:', err);
      process.exit(1);
    }
  })();
}

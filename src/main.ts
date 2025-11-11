// main.ts
import 'tsconfig-paths/register';
import dns from 'dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import { GeoMiddleware } from './middleware/geo.middleware';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
// TEMP - debug only
const raw = process.env.DATABASE_URL ?? '<not-set>';
const masked = raw.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
console.log('DATABASE_URL (masked):', masked);


dotenv.config();
dns.setDefaultResultOrder?.('ipv4first'); 
async function bootstrap() {
  // rawBody: true ensures Nest doesn't drop the raw buffer
  const app = await NestFactory.create(AppModule, { rawBody: true });
app.use(cookieParser());
  // IMPORTANT: register raw parser for the exact stripe webhook route BEFORE any JSON parser
  // Adjust path if your controller uses different route (e.g. '/checkout/webhook' or '/webhooks/stripe')
  app.use('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }));
  app.use(new GeoMiddleware().use);
  // Normal JSON parser for all other routes
  app.use(bodyParser.json());


  // read a comma-separated list of allowed origins from env
const raw =
  process.env.FRONTEND_ORIGIN ||
  "http://localhost:3001,http://localhost:3002,http://192.168.8.12:3001,http://192.168.8.12:3002,https://eda8be0d3324.ngrok-free.app,https://inkaulele.vercel.app,https://inkaulele-887fo627q-leteis-projects.vercel.app,https://www.inkaulelesidan.com,https://inkaulele-web-app-admin.vercel.app/";


  const allowed = raw.split(",").map(s => s.trim()).filter(Boolean);
  
  const wildcardAllowed = [
  /\.vercel\.app$/,
  /\.ngrok-free\.app$/,
];
app.enableCors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // allow non-browser (server-to-server) requests without origin (curl, Postman)
    if (!origin) return callback(null, true);
    if (allowed.includes("*")) return callback(null, true);
    if (allowed.includes(origin)) return callback(null, true);

    console.warn(`CORS blocked origin: ${origin}. Allowed: ${allowed.join(", ")}`);
    return callback(new Error("CORS not allowed"), false);
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization,Accept",
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
  const port = Number(process.env.PORT ?? 4001);
  await app.listen(port, '0.0.0.0');
  console.log(`Listening on http://0.0.0.0:${port}`);
}
bootstrap();


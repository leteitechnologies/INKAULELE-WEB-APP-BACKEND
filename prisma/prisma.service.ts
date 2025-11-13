import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static instances = 0;
  private readonly logger = new Logger(PrismaService.name);
  private connecting = false;
  private connected = false;

  constructor() {
    super();
    PrismaService.instances++;
    this.logger.log(`PrismaService created. instances=${PrismaService.instances}, pid=${process.pid}, render_instance=${process.env.RENDER_SERVICE_ID ?? 'unknown'}`);
  }

  async onModuleInit() {
    // Option 1: eager connect at startup (blocks app start until connected)
    // await this.tryConnectWithRetries();

    // Option 2 (recommended if you want faster "started" time): comment out the line above,
    // leaving the app to start quickly and call `ensureConnected()` on first DB operation.
  }

  async ensureConnected() {
    if (this.connected) return;
    await this.tryConnectWithRetries();
  }

  private async tryConnectWithRetries(maxAttempts = 6, baseDelayMs = 2000) {
    if (this.connected) {
      this.logger.log('Already connected — skipping connect.');
      return;
    }
    if (this.connecting) {
      this.logger.log('Connect in progress by another caller — waiting.');
      // wait until other connect attempt finishes or times out
      const start = Date.now();
      while (this.connecting && Date.now() - start < baseDelayMs * maxAttempts * 2) {
        await new Promise((r) => setTimeout(r, 200));
      }
      return;
    }

    this.connecting = true;
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        this.logger.log(`Prisma connect attempt ${attempt}/${maxAttempts}`);
        await this.$connect();
        this.connected = true;
        this.connecting = false;
        this.logger.log('Prisma connected successfully');
        return;
      } catch (err: any) {
        this.logger.error(`Prisma connect failed (attempt ${attempt}): ${err?.message ?? String(err)}`);
        if (attempt >= maxAttempts) {
          this.logger.error('Reached max attempts. Prisma not connected. App will continue — DB queries will fail until connection is restored.');
          this.connecting = false;
          return;
        }
        const delay = baseDelayMs * attempt; // linear backoff - you can switch to exponential if you prefer
        this.logger.log(`Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    this.connecting = false;
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (e) {
      /* ignore */
    }
  }
}

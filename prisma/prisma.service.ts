import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.tryConnectWithRetries();
  }

  private async tryConnectWithRetries(maxAttempts = 6, baseDelayMs = 2000) {
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        attempt++;
        this.logger.log(`Prisma connect attempt ${attempt}/${maxAttempts}`);
        await this.$connect();
        this.logger.log('Prisma connected successfully');
        return;
      } catch (err: any) {
        this.logger.error(`Prisma connect failed (attempt ${attempt}): ${err?.message ?? String(err)}`);
        if (attempt >= maxAttempts) {
          this.logger.error('Reached max attempts. Prisma not connected. App will continue — DB queries will fail until connection is restored.');
          return;
        }
        // linear backoff (increasing wait)
        const delay = baseDelayMs * attempt;
        this.logger.log(`Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
}

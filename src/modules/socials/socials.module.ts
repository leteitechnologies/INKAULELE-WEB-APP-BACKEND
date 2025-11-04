import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SocialsService } from './socials.service';
import { SocialsController } from './socials.controller';

@Module({
  imports: [PrismaModule],
  providers: [SocialsService],
  controllers: [SocialsController],
  exports: [SocialsService],
})
export class SocialsModule {}

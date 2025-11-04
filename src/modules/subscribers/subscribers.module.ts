import { Module } from '@nestjs/common';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';
import { PrismaService } from '../../../prisma/prisma.service';


@Module({
  controllers: [SubscribersController],
  providers: [SubscribersService, PrismaService],
  exports: [SubscribersService],
})
export class SubscribersModule {}

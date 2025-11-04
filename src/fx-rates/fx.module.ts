// src/fx/fx.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';
// optional admin controller (see below)

@Module({
  imports: [HttpModule],
  providers: [FxService],
  exports: [FxService],
  controllers: [FxController], // remove or keep if you don't want admin endpoints
})
export class FxModule {}

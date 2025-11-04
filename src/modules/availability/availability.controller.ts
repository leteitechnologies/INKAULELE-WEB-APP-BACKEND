// src/modules/availability/availability.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { CheckAvailabilityDto } from './dtos/check-availability.dto';
import { AvailabilityService } from './availability.service';
import { GenerateInventoryDto } from './dtos/generate-inventory.dto';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly svc: AvailabilityService) {}

  @Post('check')
  async check(@Body() dto: CheckAvailabilityDto) {
    return this.svc.checkAvailability(dto);
  }

  @Post('confirm')
  async confirm(@Body() body: { bookingId?: string; holdToken?: string; paymentInfo?: any }) {
    return this.svc.confirmHold(body.bookingId, body.holdToken, body.paymentInfo);
  }

  @Post('release')
  async release(@Body() body: { bookingId?: string; holdToken?: string }) {
    return this.svc.releaseHold(body.bookingId, body.holdToken);
  }

  // Admin API - upsert experience OR destination inventory
  @Post('admin/inventory/upsert')
  async upsertInventory(@Body() body: {
    experienceId?: string;
    destinationId?: string;
    items: { date: string; capacity: number }[];
  }) {
    if (body.experienceId) {
      return this.svc.upsertExperienceInventory(body.experienceId, body.items || []);
    }
    if (body.destinationId) {
      return this.svc.upsertDestinationInventory(body.destinationId, body.items || []);
    }
    throw new Error('experienceId or destinationId required');
  }
  @Post('admin/inventory/generate-range')
async generateRange(@Body() body: GenerateInventoryDto) {
  return this.svc.generateInventoryRange(
    body.destinationId,
    body.experienceId,
    body.from,
    body.to,
    body.capacity,
  );
}
}

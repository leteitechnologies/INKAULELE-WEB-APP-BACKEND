// src/modules/testimonials/testimonials.controller.ts
import { Controller, Get } from '@nestjs/common';
import { TestimonialsService } from './testimonials.service';

@Controller('testimonials')
export class TestimonialsController {
  constructor(private svc: TestimonialsService) {}

  @Get()
  async list() {
    return this.svc.listAll();
  }
}

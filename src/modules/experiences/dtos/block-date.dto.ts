// src/modules/experiences/dtos/block-date.dto.ts
import { IsString, IsISO8601, IsOptional } from 'class-validator';

export class BlockDateDto {
  @IsString()
  experienceId!: string;

  @IsISO8601()
  date!: string; // YYYY-MM-DD

  @IsOptional()
  reason?: string;
}

// src/modules/experiences/dtos/inventory.dto.ts
import { IsString, IsISO8601, IsInt, Min } from 'class-validator';

export class UpsertInventoryDto {
  @IsString()
  experienceId!: string;

  @IsISO8601()
  date!: string; // YYYY-MM-DD

  @IsInt()
  @Min(0)
  capacity!: number;
}

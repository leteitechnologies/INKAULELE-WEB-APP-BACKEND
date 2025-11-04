// src/modules/admin-search/admin-search.dto.ts
import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class AdminSearchQueryDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 5; // items per section
}

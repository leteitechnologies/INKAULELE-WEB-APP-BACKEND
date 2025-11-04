// src/modules/experiences/dtos/list-experiences.dto.ts
import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';

export class ListExperiencesQueryDto {
  @IsOptional()
  @IsString()
  featured?: string; // 'true'|'false'

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  sortBy?: 'price-asc' | 'price-desc' | 'newest';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  perPage?: number;
}

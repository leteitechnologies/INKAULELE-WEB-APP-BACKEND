import { IsString, IsUUID, IsDateString, ValidateNested, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

class GuestCountsDto {
  @IsOptional() // allow 0
  adults?: number;

  @IsOptional()
  children?: number;

  @IsOptional()
  infants?: number;

  @IsOptional()
  rooms?: number;
}

export class CheckAvailabilityDto {
  @IsUUID()
  destinationId!: string;

  @IsOptional()
  @IsString()
  experienceId?: string; 
  
  @IsOptional()
  @IsUUID()
  durationOptionId?: string;

  @IsDateString()
  from!: string; // YYYY-MM-DD

  @IsDateString()
  to!: string; // YYYY-MM-DD

  @ValidateNested()
  @Type(() => GuestCountsDto)
  guests!: GuestCountsDto;

  @IsOptional()
  @IsBoolean()
  createHold?: boolean;
}

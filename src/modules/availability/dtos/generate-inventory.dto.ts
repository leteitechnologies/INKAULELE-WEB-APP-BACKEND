import { IsDateString, IsInt, IsOptional, IsUUID, Min } from "class-validator";

export class GenerateInventoryDto {
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @IsOptional()
  @IsUUID()
  experienceId?: string;

  @IsDateString()
  from!: string; // YYYY-MM-DD

  @IsDateString()
  to!: string; // YYYY-MM-DD

  @IsInt()
  @Min(1)
  capacity!: number;
}

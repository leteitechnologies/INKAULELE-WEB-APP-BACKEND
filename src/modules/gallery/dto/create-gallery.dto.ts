import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateGalleryDto {
  @IsString()
  imageUrl!: string;

  @IsOptional()
  @IsString()
  destinationId?: string | null;

  @IsOptional()
  @IsString()
  experienceId?: string | null;


  @IsOptional()
  @IsString()
  alt?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string; // <-- new field

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]; // <-- new field

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  publicId?: string; // <-- new field

  @IsOptional()
  @IsInt()
  width?: number; // <-- new field

  @IsOptional()
  @IsInt()
  height?: number; // <-- new field

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
  
}

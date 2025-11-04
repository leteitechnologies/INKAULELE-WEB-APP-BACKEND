// src/modules/experiences/dtos/create-update-experience.dto.ts
import { IsString, IsOptional, IsArray, IsNumber, IsBoolean } from 'class-validator';

export class CreateExperienceDto {
  @IsString() title!: string;
  @IsString() slug!: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsString() overview?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsString() coverImage!: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsArray() inclusions?: string[];
  @IsOptional() @IsArray() exclusions?: string[];
  @IsOptional() practicalInfo?: any;
  @IsOptional() host?: any;
  @IsOptional() @IsString() metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;
  @IsOptional() @IsNumber() priceFrom?: number;
  @IsOptional() @IsArray() durations?: any[];
  @IsOptional() @IsArray() gallery?: any[];
}

export class UpdateExperienceDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsString() overview?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsArray() inclusions?: string[];
  @IsOptional() @IsArray() exclusions?: string[];
  @IsOptional() practicalInfo?: any;
  @IsOptional() host?: any;
  @IsOptional() @IsString() metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;
  @IsOptional() @IsNumber() priceFrom?: number;
  @IsOptional() @IsArray() durations?: any[];
  @IsOptional() @IsArray() gallery?: any[];
}

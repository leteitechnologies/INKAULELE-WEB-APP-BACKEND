import { IsString, IsOptional, IsNumber, Min, Max, IsEmail } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  author!: string; // <-- add !

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsNumber()
  @Min(0)
  @Max(5)
  rating!: number; // <-- also non-optional, add !

  @IsString()
  text!: string; // <-- add !

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  recaptchaToken?: string;
}

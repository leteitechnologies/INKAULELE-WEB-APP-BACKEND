// src/modules/contact/dto/create-contact.dto.ts
import { IsEmail, IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

export class CreateContactDto {
  @IsOptional()
  @IsIn(['experience', 'destination'])
  hostType?: 'experience' | 'destination';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostName?: string;

    @IsOptional()
  @IsEmail({}, { message: 'hostEmail must be a valid email address' })
  hostEmail?: string | null;
  
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  // new fields from the multi-step contact page
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  priority?: string;

  @IsString()
  @MaxLength(5000)
  message!: string;
}

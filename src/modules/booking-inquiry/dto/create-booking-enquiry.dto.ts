// src/modules/booking-inquiry/dto/create-booking-enquiry.dto.ts
import { IsOptional, IsString, IsEmail, IsObject, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GuestInfo {
  @IsOptional() @IsNumber() @Type(() => Number) adults?: number;
  @IsOptional() @IsNumber() @Type(() => Number) children?: number;
  @IsOptional() @IsNumber() @Type(() => Number) infants?: number;
}

export class CreateBookingEnquiryDto {
  // general host/destination/external links
  @IsOptional() @IsString() hostType?: string;
  @IsOptional() @IsString() hostId?: string;
  @IsOptional() @IsString() hostName?: string;
  @IsOptional() @IsString() hostEmail?: string;
  @IsOptional() @IsString() hostPhone?: string;

  // optional friendly helpers (frontend sometimes sends these)
  @IsOptional() @IsString() placeTitle?: string;

  // booking reference / hold token (frontend may send these when hold is created)
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @IsString() holdToken?: string;

  // new: optional relation ids (were missing)
  @IsOptional() @IsString() destinationId?: string;
  @IsOptional() @IsString() experienceId?: string;

  // duration option (already present)
  @IsOptional() @IsString() durationOptionId?: string;
  @IsOptional() @IsString() durationTitle?: string;

  // dates (ISO strings expected)
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;

  // guests/rooms/nights
  @IsOptional() @ValidateNested() @Type(() => GuestInfo) guests?: GuestInfo;
  @IsOptional() @IsNumber() @Type(() => Number) rooms?: number;
  @IsOptional() @IsNumber() @Type(() => Number) nights?: number;

  // currency / price
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() @Type(() => Number) priceEstimate?: number;
  @IsOptional() @IsNumber() @Type(() => Number) totalPrice?: number;

  // message & contact (message required)
  @IsString() message!: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;

  // flexible raw payloads
  @IsOptional() @IsObject() bookingEnquiry?: any;
  @IsOptional() @IsObject() meta?: any;

  @IsOptional() @IsString() source?: string;
}

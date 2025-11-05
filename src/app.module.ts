import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { DestinationsModule } from './modules/destinations/destinations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { NewsletterModule } from './modules/newsletter/newsletter.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { AvailabilityModule } from './modules/availability/availability.module';
import { StripeModule } from './modules/payments/stripe/stripe.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { FxModule } from './fx-rates/fx.module';
import { ExperiencesModule } from './modules/experiences/experiences.module';
import { ContactModule } from './modules/contact/contact.module';
import { AboutModule } from './modules/about/about.module';
import { HighlightsModule } from './modules/highlights/highlights.module';
import { TestimonialsModule } from './modules/testimonials/testimonials.module';
import { SocialsModule } from './modules/socials/socials.module';
import { DurationsModule } from './modules/durations/durations.module';
import { MpesaModule } from './modules/mpesa/mpesa.module';
import { AdminModule } from './modules/admin/admin.module';
import { SubscribersModule } from './modules/subscribers/subscribers.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { GalleryModule } from './modules/gallery/gallery.module';
import { AdminSearchModule } from './modules/admin-search/admin-search.module';
import { BookingInquiryModule } from './modules/booking-inquiry/booking.inquiry.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }), // load env globally
ThrottlerModule.forRoot({
  throttlers: [
    {
      ttl: 60_000, // 60 seconds
      limit: process.env.NODE_ENV === 'production' ? 30 : 100,
    },
  ],
}),
    ReviewsModule,
    AdminModule,
    AdminSearchModule,
    GalleryModule,
HighlightsModule,
CampaignsModule,
MpesaModule,
DurationsModule,
TestimonialsModule,
SocialsModule,
    BookingsModule,
    AboutModule,
    ContactModule,
      SubscribersModule,
    FxModule,
    AuthModule,
    StripeModule,
    BookingInquiryModule,
    ExperiencesModule,
    DestinationsModule,
    PrismaModule,
    AvailabilityModule,
    MailerModule,
    NewsletterModule,
  ],
    controllers: [AppController],
      providers: [AppService],
})
export class AppModule {}

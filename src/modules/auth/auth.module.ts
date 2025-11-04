import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    UsersModule,
    MailerModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
useFactory: (cfg: ConfigService) => ({
  secret: cfg.get<string>('JWT_SECRET')!,
  signOptions: {
    expiresIn: Number(cfg.get<string>('JWT_EXPIRES_IN') || '604800'), // seconds (7 days = 604800s)
  },
}),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly cfg: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => {
          if (!req || !req.cookies) return null;
          return req.cookies[cfg.get('COOKIE_NAME') || 'jid'];
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: cfg.get<string>('JWT_SECRET')!, 
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}

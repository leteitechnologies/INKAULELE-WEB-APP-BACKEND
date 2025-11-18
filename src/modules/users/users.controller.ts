import { Controller, Get, Query, Param, Patch, Body, Post, Delete, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
// import guards you use in project
// import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
// import { RolesGuard } from '../../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  // @UseGuards(JwtAuthGuard, RolesGuard) // enable in production, permit ADMIN
  @Get()
  async list(@Query() q: ListUsersDto) {
    const skip = q.skip ?? 0;
    const take = q.take ?? 25;
    const res = await this.svc.list({ q: q.q, skip, take, role: q.role });
    return { data: res.items, total: res.total };
  }

  // @UseGuards(JwtAuthGuard)
  @Get(':id')
  async get(@Param('id') id: string) {
    const user = await this.svc.getById(id);
    if (!user) return { error: 'Not found' };
    return { data: user };
  }

  // @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    const updated = await this.svc.update(id, body as any);
    return { data: updated };
  }

  // @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.svc.deactivate(id);
    return { ok: true };
  }

  // create user (admin)
  // @UseGuards(JwtAuthGuard, RolesGuard)
@Post()
async create(@Body() body: { email: string; username?: string; name?: string; role?: string; password?: string; clerkId?: string }) {
  const created = await this.svc.create({
    email: body.email,
    username: body.username,
    name: body.name,
    role: body.role,
    passwordHash: null,
    clerkId: body.clerkId,
  });
  return { data: created };
}
  @Post('ensure-admin')
  async ensureAdmin(@Body() body: { clerkId: string; email?: string; name?: string }, @Req() req: any) {
    console.log('[ensure-admin] incoming body:', body);
    console.log('[ensure-admin] cookies:', req.cookies);
    try {
      const created = await this.svc.ensureSingleAdmin({
        clerkId: body.clerkId,
        email: body.email ?? '',
        name: body.name,
      });
      return { data: created };
    } catch (err) {
      console.error('[ensure-admin] error', (err as Error).message, err);
      throw err; // let Nest return appropriate HTTP response
    }
  }
}

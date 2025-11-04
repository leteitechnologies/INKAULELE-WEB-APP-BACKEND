import { Controller, Get, Query, Param, Patch, Body, Post, Delete, UseGuards } from '@nestjs/common';
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
  async create(@Body() body: { email: string; name?: string; role?: string; password?: string }) {
    // If you store passwords, hash them in auth service (bcrypt). For now, create without passwordHash.
    const created = await this.svc.create({
      email: body.email,
      name: body.name,
      role: body.role,
      passwordHash: null,
    });
    return { data: created };
  }
}

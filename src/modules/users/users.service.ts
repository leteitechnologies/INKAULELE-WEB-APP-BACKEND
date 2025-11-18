import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    q?: string;
    skip?: number;
    take?: number;
    role?: string | null;
  }) {
    const { q, skip = 0, take = 25, role } = params;

    const where: Prisma.UserWhereInput = {
      AND: [] as Prisma.UserWhereInput[],
    };

    // 🔍 Search filter
    if (q && q.trim()) {
      const term = q.trim();
      (where.AND as Prisma.UserWhereInput[]).push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    // 👤 Role filter (MUST match enum Role)
    if (role && Object.values(Role).includes(role as Role)) {
      (where.AND as Prisma.UserWhereInput[]).push({
        role: { equals: role as Role },
      });
    }

    const whereFinal: Prisma.UserWhereInput =
      (where.AND as Prisma.UserWhereInput[]).length === 0 ? {} : where;

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where: whereFinal }),
      this.prisma.user.findMany({
        where: whereFinal,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return { total, items };
  }

  async getById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: string, data: { name?: string; role?: string; email?: string }) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        role: data.role ? (data.role as Role) : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deactivate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { role: 'USER' },
      select: { id: true },
    });
  }

 async create(data: {
    email: string;
    username?: string;          // <--- allow optional in method input
    name?: string | null;
    role?: string | null;
    passwordHash?: string | null;
    clerkId?: string | null;
  }) {
    // derive username if not provided (strip domain, fallback to email)
    const username =
      data.username ??
      (data.email ? data.email.split('@')[0].replace(/[^a-z0-9._-]/gi, '') : `user_${Date.now()}`);

    const created = await this.prisma.user.create({
      data: {
        email: data.email,
        username,
        clerkId: data.clerkId ?? null,
        name: data.name ?? null,
        role: (data.role as Role) ?? Role.USER,
        passwordHash: data.passwordHash ?? null,
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return created;
  }
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // for admin counts, etc
  async countAll() {
    return this.prisma.user.count();
  }

}

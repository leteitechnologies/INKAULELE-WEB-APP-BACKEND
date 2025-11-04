import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const pw = await bcrypt.hash(process.env.SEED_ADMIN_PW || 'gp6tEYN22RNGyTa', 10);
  await prisma.user.upsert({
    where: { email: 'johnsonKantai4@gmail.com' },
    update: { name: 'Admin', role: 'ADMIN', passwordHash: pw },
    create: { email: 'johnsonKantai4@gmail.com', name: 'Admin', role: 'ADMIN', passwordHash: pw },
  });
  console.log('seeded admin');
}

main().catch(console.error).finally(() => prisma.$disconnect());

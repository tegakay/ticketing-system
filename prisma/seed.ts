import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/utils/password';

async function main() {
  const email = 'admin@ticketforge.dev';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Bootstrap admin already exists: ${email}`);
    return;
  }

  const password = await hashPassword('ChangeMe123!');
  await prisma.user.create({
    data: { email, password, name: 'Bootstrap Admin', role: 'ADMIN' },
  });
  console.log(`Created bootstrap admin: ${email} / ChangeMe123!`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

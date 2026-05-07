import "dotenv/config";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { Role } from "../generated/prisma/enums";

const rootEmail = process.env.ROOT_EMAIL ?? "root@luckywiki.local";
const rootPassword = process.env.ROOT_PASSWORD ?? "ChangeMe123!";
const rootName = process.env.ROOT_NAME ?? "LuckyWiki Root";
const origin =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

async function main() {
  const existing = await prisma.user.findUnique({
    where: {
      email: rootEmail,
    },
  });

  if (!existing) {
    await auth.api.signUpEmail({
      body: {
        email: rootEmail,
        password: rootPassword,
        name: rootName,
      },
      headers: new Headers({
        origin,
      }),
    });
  }

  const rootUser = await prisma.user.update({
    where: {
      email: rootEmail,
    },
    data: {
      name: rootName,
      role: Role.ROOT,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.info(`Seeded root user ${rootUser.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

const authBaseUrl =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

const authSecret =
  process.env.BETTER_AUTH_SECRET ??
  "luckywiki-dev-secret-change-me-please-update";

const userAdditionalFields = {
  role: {
    type: "string",
    required: false,
    defaultValue: "USER",
    input: false,
  },
} as const;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: authBaseUrl,
  secret: authSecret,
  trustedOrigins: [authBaseUrl],
  user: {
    additionalFields: userAdditionalFields,
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    minPasswordLength: 8,
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      id,
      ...coreFields,
      role: String(additionalFields.role ?? "USER"),
    }),
  },
  emailVerification: {
    sendOnSignIn: true,
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    async sendVerificationEmail({ user, url }) {
      await sendVerificationEmail({
        user: {
          email: user.email,
          name: user.name,
        },
        url,
      });
    },
    async afterEmailVerification(user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
        },
      });
    },
  },
  plugins: [nextCookies()],
});

import { Role } from "@/generated/prisma/enums";

export type PermissionUser = {
  role: Role | string | null | undefined;
  emailVerified: boolean;
} | null;

export function isRootUser(user: PermissionUser) {
  return user?.role === Role.ROOT;
}

export function canManageWiki(user: PermissionUser) {
  return isRootUser(user);
}

export function canComment(user: PermissionUser) {
  return Boolean(user && user.emailVerified);
}

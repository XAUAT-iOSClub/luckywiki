import { Role } from "@/generated/prisma/enums";

export type PermissionUser = {
  role: Role | string | null | undefined;
  emailVerified: boolean;
} | null;

export function isRootUser(user: PermissionUser) {
  return user?.role === Role.ROOT;
}

export function isAuthorUser(user: PermissionUser) {
  return user?.role === Role.AUTHOR;
}

export function canWriteArticles(user: PermissionUser) {
  return isRootUser(user) || isAuthorUser(user);
}

export function canAccessAdminShell(user: PermissionUser) {
  return canWriteArticles(user);
}

export function canManageWiki(user: PermissionUser) {
  return canAccessAdminShell(user);
}

export function canModerateComments(user: PermissionUser) {
  return isRootUser(user);
}

export function canManageUsers(user: PermissionUser) {
  return isRootUser(user);
}

export function canChangeUserRole(
  currentRole: Role | string | null | undefined,
  targetRole: Role,
  rootUsersCount: number,
) {
  if (!currentRole || currentRole === targetRole) {
    return false;
  }

  if (currentRole === Role.ROOT && targetRole !== Role.ROOT && rootUsersCount <= 1) {
    return false;
  }

  return true;
}

export function canComment(user: PermissionUser) {
  return Boolean(user && user.emailVerified);
}

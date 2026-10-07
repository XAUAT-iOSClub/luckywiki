import { canAccessAdminShell } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import {
  WikiSidebarAccount,
  WikiSidebarAdminNavigation,
} from "@/components/wiki-sidebar";

export async function WikiSidebarAdminSlot() {
  const session = await getCurrentSession();
  if (!canAccessAdminShell(session?.user ?? null)) return null;
  return <WikiSidebarAdminNavigation />;
}

export async function WikiSidebarAccountSlot() {
  const session = await getCurrentSession();
  return <WikiSidebarAccount user={session?.user} />;
}

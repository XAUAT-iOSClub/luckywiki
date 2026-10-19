import { notFound } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { AdminHeader } from "@/components/admin-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getSiteSettings } from "@/lib/site";
import { hasLocale } from "@/lib/i18n/config";
import { requireAuthorSession } from "@/lib/auth/session";

type Params = Promise<{ lang: string }>;

export default async function AdminLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Params;
}>) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const [session, siteSettings] = await Promise.all([
    requireAuthorSession(lang),
    getSiteSettings(),
  ]);
  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    role: session.user.role,
  };

  return (
    <SidebarProvider className="admin-shell">
      <AppSidebar user={user} siteName={siteSettings.siteName} />
      <SidebarInset>
        <AdminHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

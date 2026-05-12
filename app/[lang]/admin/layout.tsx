import { notFound } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { AdminHeader } from "@/components/admin-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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

  const session = await requireAuthorSession(lang);
  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    role: session.user.role,
  };

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <AdminHeader />
        <div className="flex flex-1 flex-col min-h-0 gap-4 p-4 md:p-8 md:pt-6 admin-layout-container">
          <div className="mx-auto w-full max-w-6xl flex-1 flex flex-col min-h-0 admin-layout-content">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

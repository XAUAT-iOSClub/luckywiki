export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-[420px]">{children}</div>
    </main>
  );
}

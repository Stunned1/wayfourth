export default function AuthLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center">
        <div className="mb-10 w-full max-w-md">
          <div className="mb-2 text-sm font-medium text-zinc-400">Wayfourth</div>
          <div className="text-2xl font-semibold tracking-tight text-zinc-50">
            Welcome back
          </div>
          <div className="mt-2 text-sm text-zinc-400">
            Sign in or create an account to continue.
          </div>
        </div>

        {children}
      </div>
    </main>
  );
}


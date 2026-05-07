"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
  nextPath: string;
};

export function AuthForm({ mode, nextPath }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: "/auth/verify-email",
        });

        if (result.error) {
          setError(result.error.message ?? "Could not create your account.");
          return;
        }

        setNotice("Account created. Check your inbox for the verification link.");
        setPassword("");
        return;
      }

      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Could not sign you in.");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <Link href="/wiki" className="flex items-center gap-2 group transition-transform hover:scale-105 active:scale-95">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 ring-1 ring-white/10">
          <BookOpen className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">LuckyWiki</span>
      </Link>
      
      <Card className="w-full max-w-[400px] overflow-hidden border-border/50 bg-white/70 shadow-2xl shadow-black/5 backdrop-blur-xl dark:bg-zinc-900/70 dark:shadow-black/20">
        <CardHeader className="space-y-1 pb-6 text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {isSignUp ? "Create an account" : "Welcome back"}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {isSignUp 
              ? "Enter your details below to create your account" 
              : "Enter your email below to sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Steve Jobs"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border-border/50 bg-background/50 focus-visible:ring-primary/30"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border-border/50 bg-background/50 focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!isSignUp && (
                  <Link 
                    href="/auth/forgot-password" 
                    className="text-xs text-primary hover:underline underline-offset-4"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border-border/50 bg-background/50 focus-visible:ring-primary/30"
              />
            </div>
            
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {notice && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p>{notice}</p>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full rounded-xl py-6 text-sm font-semibold shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] active:translate-y-[0px]" 
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Please wait
                </>
              ) : (
                isSignUp ? "Sign Up" : "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col border-t border-border/50 bg-muted/30 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link 
              href={isSignUp 
                ? `/auth/sign-in?next=${encodeURIComponent(nextPath)}` 
                : `/auth/sign-up?next=${encodeURIComponent(nextPath)}`
              }
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </Link>
          </p>
        </CardFooter>
      </Card>
      
      <p className="px-8 text-center text-xs leading-relaxed text-muted-foreground">
        By clicking continue, you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

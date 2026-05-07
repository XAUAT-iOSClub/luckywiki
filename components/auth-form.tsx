"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

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
    <div className="surface-panel w-full max-w-lg space-y-6">
      <div>
        <p className="eyebrow">{isSignUp ? "Sign Up" : "Sign In"}</p>
        <h1 className="text-3xl font-semibold">
          {isSignUp ? "Create your LuckyWiki account" : "Welcome back"}
        </h1>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        {isSignUp ? (
          <label className="field-block">
            <span>Name</span>
            <input
              required
              className="field-input"
              name="name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Your display name"
              value={name}
            />
          </label>
        ) : null}
        <label className="field-block">
          <span>Email</span>
          <input
            required
            className="field-input"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
            value={email}
          />
        </label>
        <label className="field-block">
          <span>Password</span>
          <input
            required
            className="field-input"
            minLength={8}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            type="password"
            value={password}
          />
        </label>
        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {notice ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}
        <button className="button-primary w-full justify-center" disabled={pending} type="submit">
          {pending ? "Working..." : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-muted-foreground">
        {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
        <a className="text-primary hover:underline" href={isSignUp ? `/auth/sign-in?next=${encodeURIComponent(nextPath)}` : `/auth/sign-up?next=${encodeURIComponent(nextPath)}`}>
          {isSignUp ? "Sign in" : "Create one"}
        </a>
      </p>
    </div>
  );
}

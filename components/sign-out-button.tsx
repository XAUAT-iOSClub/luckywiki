"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/wiki");
    router.refresh();
  }

  return (
    <button className="button-secondary" onClick={handleSignOut} type="button">
      Sign out
    </button>
  );
}

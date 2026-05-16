"use client";

import { GitHubCalendar } from "react-github-calendar";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function GitHubCalendarCard({
  username,
  className,
}: {
  username?: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!username) return null;

  return (
    <div
      className={cn(
        "my-6 flex justify-center overflow-x-auto rounded-3xl border border-border bg-card p-6 shadow-sm",
        className,
      )}
    >
      <GitHubCalendar
        username={username}
        blockSize={12}
        blockMargin={4}
        fontSize={12}
        colorScheme={
          mounted ? (resolvedTheme as "light" | "dark") : "light"
        }
        theme={{
          light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
          dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
        }}
      />
    </div>
  );
}

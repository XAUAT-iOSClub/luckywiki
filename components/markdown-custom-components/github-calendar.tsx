"use client";

import { GitHubCalendar } from "react-github-calendar";
import { cn } from "@/lib/utils";

export function GitHubCalendarCard({
  username,
  className,
}: {
  username?: string;
  className?: string;
}) {
  if (!username) return null;

  return (
    <div
      className={cn(
        "my-6 flex justify-center overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-sm",
        className,
      )}
    >
      <GitHubCalendar
        username={username}
        blockSize={12}
        blockMargin={4}
        fontSize={12}
        // colorScheme="light"
      />
    </div>
  );
}

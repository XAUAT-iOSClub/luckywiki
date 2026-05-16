"use client";

import { cn } from "@/lib/utils";

type Message = {
  userName?: string;
  messages?: string;
  isMe?: boolean;
};

export function Chat({
  data,
  className,
}: {
  data?: Message[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "my-6 space-y-4 rounded-3xl border border-border/50 bg-muted/30 p-6",
        className,
      )}
    >
      {data?.map((msg, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-3",
            msg.isMe ? "flex-row-reverse" : "flex-row",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-sm font-bold text-muted-foreground shadow-sm ring-1 ring-border">
            {msg.userName?.[0] || "?"}
          </div>
          <div
            className={cn(
              "max-w-[80%] px-4 py-2 text-sm shadow-sm",
              msg.isMe
                ? "rounded-2xl rounded-tr-none bg-primary text-primary-foreground"
                : "rounded-2xl rounded-tl-none border border-border/50 bg-card text-foreground",
            )}
          >
            {msg.messages}
          </div>
        </div>
      ))}
    </div>
  );
}

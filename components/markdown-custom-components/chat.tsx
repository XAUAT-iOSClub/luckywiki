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
        "my-6 space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4",
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
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-[11px] font-medium text-muted-foreground">
            {msg.userName?.[0] || "?"}
          </div>
          <div
            className={cn(
              "max-w-[80%] px-3 py-2 text-[13px] leading-5",
              msg.isMe
                ? "rounded-lg rounded-tr-none bg-primary text-primary-foreground"
                : "rounded-lg rounded-tl-none border border-border/70 bg-card text-foreground",
            )}
          >
            {msg.messages}
          </div>
        </div>
      ))}
    </div>
  );
}

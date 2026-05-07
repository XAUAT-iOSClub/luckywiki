"use client";

import { Icon as IconifyIcon } from "@iconify/react";
import { cn } from "@/lib/utils";

export function Icon({
  icon,
  className,
}: {
  icon?: string;
  className?: string;
}) {
  if (!icon) return null;
  return (
    <IconifyIcon
      icon={icon}
      className={cn("inline-block align-text-bottom", className)}
    />
  );
}

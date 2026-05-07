"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CustomCard({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("my-6", className)}>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

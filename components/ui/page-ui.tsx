import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared layout primitives for the admin console and public site.
 *
 * The visual language follows macOS 15: a quiet canvas, hairline separators,
 * 10px corner radii, no elevation on content surfaces, 13px body copy and
 * generous vertical rhythm.
 */

export function Page({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-7 px-5 py-7 sm:px-7 md:px-10 md:py-8",
        wide ? "max-w-none" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
  titleClassName,
  descriptionClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1
          className={cn(
            "text-[22px] font-semibold leading-tight tracking-[-0.015em] text-foreground",
            titleClassName,
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "max-w-2xl text-[13px] leading-5 text-muted-foreground",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  footer,
  className,
  headerClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  headerClassName?: string;
}) {
  const hasHeader = Boolean(title || description || action);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border/70 bg-card",
        className,
      )}
    >
      {hasHeader ? (
        <div
          className={cn(
            "flex flex-col gap-2 border-b border-border/60 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between",
            headerClassName,
          )}
        >
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <h2 className="text-[14px] font-semibold leading-5 tracking-[-0.005em] text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-[12.5px] leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
      {footer ? (
        <div className="flex flex-col gap-3 border-t border-border/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function PanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function List({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border/60", className)}>{children}</div>
  );
}

export function ListRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "px-5 py-4 transition-colors hover:bg-muted/35",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type MetricItem = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
};

export function Metrics({
  items,
  className,
}: {
  items: MetricItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 md:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => {
        const content = (
          <div className="flex h-full flex-col gap-2 bg-card px-5 py-4 transition-colors group-hover:bg-muted/40">
            <p className="text-[12px] leading-4 text-muted-foreground">
              {item.label}
            </p>
            <p className="text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
              {item.value}
            </p>
            {item.detail ? (
              <p className="text-[11.5px] leading-4 text-muted-foreground/90">
                {item.detail}
              </p>
            ) : null}
          </div>
        );

        return item.href ? (
          <Link
            key={index}
            className="group transition-colors focus-visible:outline-none"
            href={item.href}
          >
            {content}
          </Link>
        ) : (
          <div key={index}>{content}</div>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-16 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon className="mb-1 size-6 text-muted-foreground/60" aria-hidden />
      ) : null}
      <p className="text-[13.5px] font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-[12.5px] leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

const statusToneClass: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-primary",
  muted: "bg-muted-foreground/50",
};

export function StatusDot({
  tone = "muted",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-foreground/80",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", statusToneClass[tone])}
      />
      {children}
    </span>
  );
}

"use client";

import {
  createContext,
  useContext,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { clsx } from "clsx";

type MarkdownBadgeProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  shape?: string;
};

type MarkdownTipProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  copy?: boolean;
  text?: string;
  tip?: string;
  value?: string;
};

type MarkdownTabsProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  defaultValue?: string;
};

type MarkdownTabsContextValue = {
  activeValue: string;
  setActiveValue: (value: string) => void;
};

type MarkdownTabsItemProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  value?: string;
};

type MarkdownComponentFallbackProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  "data-language"?: string;
  "data-mdx-name"?: string;
  chart?: string;
  count?: unknown;
  score?: string;
  spec?: string;
  title?: string;
};

const tabsContext = createContext<MarkdownTabsContextValue | null>(null);

function useTabsContext() {
  return useContext(tabsContext);
}

function stringifyUnknownProps(props: MarkdownComponentFallbackProps) {
  const preview = props.spec ?? props.chart ?? props.score;

  if (typeof preview === "string" && preview.trim()) {
    return preview;
  }

  if (props.title) {
    return props.title;
  }

  if (props.count !== undefined) {
    try {
      return JSON.stringify(props.count);
    } catch {
      return String(props.count);
    }
  }

  return "";
}

function childrenToPlainText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map(childrenToPlainText).join("");
  }

  return "";
}

function copyToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(value);
}

function MarkdownBadge({ children, className, shape, ...props }: MarkdownBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide",
        shape === "outline"
          ? "border-primary/30 bg-transparent text-primary"
          : "border-primary/10 bg-primary/10 text-primary",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

function MarkdownTip({
  children,
  className,
  copy,
  text,
  tip,
  value,
  ...props
}: MarkdownTipProps) {
  const label = childrenToPlainText(children) || text || value || "";

  if (copy) {
    return (
      <button
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-primary/40 hover:text-primary",
          className,
        )}
        onClick={() => copyToClipboard(value || label)}
        title={tip || "Copy"}
        type="button"
        {...props}
      >
        <span>{label}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Copy</span>
      </button>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800",
        className,
      )}
      title={tip || label}
      {...props}
    >
      {children || text}
    </span>
  );
}

function MarkdownTabs({ children, className, defaultValue, ...props }: MarkdownTabsProps) {
  const [activeValue, setActiveValue] = useState(defaultValue ?? "");

  return (
    <tabsContext.Provider value={{ activeValue, setActiveValue }}>
      <div
        className={clsx(
          "mt-6 rounded-3xl border border-border/70 bg-white/80 p-4 shadow-sm shadow-slate-200/40",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </tabsContext.Provider>
  );
}

function MarkdownTabsList({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <div
      className={clsx("flex flex-wrap gap-2 rounded-2xl bg-slate-100/80 p-2", className)}
      role="tablist"
      {...props}
    >
      {children}
    </div>
  );
}

function MarkdownTabsTrigger({
  children,
  className,
  value,
  ...props
}: MarkdownTabsItemProps) {
  const context = useTabsContext();
  const isActive = context ? context.activeValue === value : false;

  return (
    <button
      aria-selected={isActive}
      className={clsx(
        "rounded-2xl px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-white text-slate-900 shadow-sm shadow-slate-300/40"
          : "text-slate-500 hover:text-slate-900",
        className,
      )}
      onClick={() => {
        if (context && value) {
          context.setActiveValue(value);
        }
      }}
      role="tab"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

function MarkdownTabsContent({
  children,
  className,
  value,
  ...props
}: MarkdownTabsItemProps) {
  const context = useTabsContext();
  const isVisible = !context || !value || context.activeValue === value;

  if (!isVisible) {
    return null;
  }

  return (
    <div className={clsx("mt-4", className)} role="tabpanel" {...props}>
      {children}
    </div>
  );
}

function MarkdownComponentBlock({
  children,
  className,
  "data-language": language,
  "data-mdx-name": name,
  ...props
}: MarkdownComponentFallbackProps) {
  const preview = stringifyUnknownProps(props);

  return (
    <div
      className={clsx(
        "mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{name || "Component"}</span>
        {language ? <span className="rounded-full bg-white px-2 py-1 tracking-normal">{language}</span> : null}
      </div>
      {preview ? (
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          <code>{preview}</code>
        </pre>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function MarkdownComponentInline({
  children,
  className,
  "data-mdx-name": name,
}: MarkdownComponentFallbackProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600",
        className,
      )}
      title={name || "Component"}
    >
      {children || name}
    </span>
  );
}

export const markdownComponentRenderers = {
  "mdx-badge": MarkdownBadge,
  "mdx-component-block": MarkdownComponentBlock,
  "mdx-component-inline": MarkdownComponentInline,
  "mdx-tabs": MarkdownTabs,
  "mdx-tabs-content": MarkdownTabsContent,
  "mdx-tabs-list": MarkdownTabsList,
  "mdx-tabs-trigger": MarkdownTabsTrigger,
  "mdx-tip": MarkdownTip,
};

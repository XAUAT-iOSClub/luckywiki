"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { clsx } from "clsx";
import { useT } from "@/lib/i18n/provider";
import mermaid from "mermaid";

const Icon = lazy(() =>
  import("./markdown-custom-components/icon").then((m) => ({
    default: m.Icon,
  })),
);
const CustomCard = lazy(() =>
  import("./markdown-custom-components/card").then((m) => ({
    default: m.CustomCard,
  })),
);
const Timeline = lazy(() =>
  import("./markdown-custom-components/timeline").then((m) => ({
    default: m.Timeline,
  })),
);
const Chat = lazy(() =>
  import("./markdown-custom-components/chat").then((m) => ({
    default: m.Chat,
  })),
);
const InfographicDiagram = lazy(() =>
  import("./markdown-custom-components/infographic").then((m) => ({
    default: m.InfographicDiagram,
  })),
);

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
  "data-mdx-props"?: string;
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

function parseMdxProps(
  props: MarkdownComponentFallbackProps,
): Record<string, unknown> {
  const { "data-mdx-props": propsStr, ...rest } = props;
  if (!propsStr) return rest as Record<string, unknown>;
  try {
    return { ...rest, ...JSON.parse(propsStr) };
  } catch {
    return rest as Record<string, unknown>;
  }
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

function MarkdownBadge({
  children,
  className,
  shape,
  ...props
}: MarkdownBadgeProps) {
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
  const t = useT();
  const label = childrenToPlainText(children) || text || value || "";

  if (copy) {
    return (
      <button
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary",
          className,
        )}
        onClick={() => copyToClipboard(value || label)}
        title={tip || t.common.copy}
        type="button"
        {...props}
      >
        <span>{label}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t.common.copy}
        </span>
      </button>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-amber-200/50 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:border-amber-500/20 dark:text-amber-400",
        className,
      )}
      title={tip || label}
      {...props}
    >
      {children || text}
    </span>
  );
}

function MarkdownTabs({
  children,
  className,
  defaultValue,
  ...props
}: MarkdownTabsProps) {
  const [activeValue, setActiveValue] = useState(defaultValue ?? "");

  return (
    <tabsContext.Provider value={{ activeValue, setActiveValue }}>
      <div
        className={clsx(
          "mt-6 rounded-3xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </tabsContext.Provider>
  );
}

function MarkdownTabsList({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <div
      className={clsx(
        "flex flex-wrap gap-2 rounded-2xl bg-muted/80 p-2",
        className,
      )}
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
          ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
          : "text-muted-foreground hover:text-foreground",
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
  "data-mdx-props": propsStr,
  ...rest
}: MarkdownComponentFallbackProps) {
  const mdxProps = parseMdxProps({ "data-mdx-props": propsStr, ...rest });
  const Component =
    name === "Icon"
      ? Icon
      : name === "Card"
          ? CustomCard
          : name === "timeline"
            ? Timeline
            : name === "Chat"
              ? Chat
              : null;

  if (Component) {
    return (
      <Suspense
        fallback={
          <div
            className="flex h-24 animate-pulse items-center justify-center rounded-3xl border border-dashed border-border bg-muted/50 text-xs font-medium text-muted-foreground"
            data-mdx-name={name}
            data-mdx-props={propsStr}
          >
            Loading {name}...
          </div>
        }
      >
        <Component {...mdxProps} className={className}>
          {children}
        </Component>
      </Suspense>
    );
  }

  const preview = stringifyUnknownProps(mdxProps);

  return (
    <div
      className={clsx(
        "mt-6 rounded-3xl border border-dashed border-border bg-muted/30 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <span>{name || "Component"}</span>
        {language ? (
          <span className="rounded-full bg-card px-2 py-1 tracking-normal border border-border/50">
            {language}
          </span>
        ) : null}
      </div>
      {preview ? (
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
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
  "data-mdx-props": propsStr,
  ...rest
}: MarkdownComponentFallbackProps) {
  const mdxProps = parseMdxProps({ "data-mdx-props": propsStr, ...rest });

  if (name === "Icon") {
    return (
      <Suspense
        fallback={
          <span
            className="inline-block h-4 w-4 animate-pulse rounded bg-muted"
            data-mdx-name={name}
            data-mdx-props={propsStr}
          />
        }
      >
        <Icon {...mdxProps} className={clsx("mx-0.5", className)} />
      </Suspense>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-dashed border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
      title={name || "Component"}
    >
      {children || name}
    </span>
  );
}

import { useTheme } from "next-themes";

function MarkdownMermaid({ chart }: { chart?: string }) {
  const [svg, setSvg] = useState("");
  const generatedId = useId();
  const id = useRef(`mermaid-${generatedId.replace(/:/g, "")}`);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!chart) return;

    mermaid.initialize({
      startOnLoad: false,
      theme: resolvedTheme === "dark" ? "dark" : "default",
      securityLevel: "loose",
    });

    mermaid
      .render(id.current, chart)
      .then((result) => {
        setSvg(result.svg);
      })
      .catch((err) => {
        console.error("Mermaid render error:", err);
      });
  }, [chart, resolvedTheme]);

  if (!chart) return null;

  return (
    <div
      className="mt-6 flex justify-center overflow-hidden rounded-3xl border border-border bg-muted/20 p-6"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

import plantumlEncoder from "plantuml-encoder";

function MarkdownPlantUML({ code }: { code?: string }) {
  if (!code) return null;

  const encoded = plantumlEncoder.encode(code);
  const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;

  return (
    <div className="mt-6 flex justify-center overflow-hidden rounded-3xl border border-border bg-muted/20 p-6">
      <img
        src={url}
        alt="PlantUML diagram"
        className="max-w-full"
        loading="lazy"
      />
    </div>
  );
}

import {
  Info,
  Lightbulb,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";

type MarkdownAlertProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  type?: "NOTE" | "TIP" | "WARNING" | "IMPORTANT" | "CAUTION";
};

const ALERT_CONFIG = {
  NOTE: {
    icon: Info,
    className: "border-blue-200/50 bg-blue-500/5 text-blue-700 dark:border-blue-500/20 dark:text-blue-400",
    iconClassName: "text-blue-500",
    label: "Note",
  },
  TIP: {
    icon: Lightbulb,
    className: "border-emerald-200/50 bg-emerald-500/5 text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-400",
    iconClassName: "text-emerald-500",
    label: "Tip",
  },
  WARNING: {
    icon: AlertTriangle,
    className: "border-amber-200/50 bg-amber-500/5 text-amber-700 dark:border-amber-500/20 dark:text-amber-400",
    iconClassName: "text-amber-500",
    label: "Warning",
  },
  IMPORTANT: {
    icon: AlertCircle,
    className: "border-indigo-200/50 bg-indigo-500/5 text-indigo-700 dark:border-indigo-500/20 dark:text-indigo-400",
    iconClassName: "text-indigo-500",
    label: "Important",
  },
  CAUTION: {
    icon: ShieldAlert,
    className: "border-red-200/50 bg-red-500/5 text-red-700 dark:border-red-500/20 dark:text-red-400",
    iconClassName: "text-red-500",
    label: "Caution",
  },
};

function MarkdownAlert({ children, className, type = "NOTE", ...props }: MarkdownAlertProps) {
  const config = ALERT_CONFIG[type] || ALERT_CONFIG.NOTE;
  const Icon = config.icon;

  return (
    <div
      className={clsx(
        "my-6 flex gap-4 rounded-2xl border p-4 text-sm leading-relaxed",
        config.className,
        className,
      )}
      {...props}
    >
      <div className="mt-0.5 shrink-0">
        <Icon className={clsx("h-5 w-5", config.iconClassName)} />
      </div>
      <div className="flex-1">
        <div className="mb-1 font-semibold tracking-wide uppercase text-xs opacity-90">
          {config.label}
        </div>
        <div className="markdown-alert-content">{children}</div>
      </div>
    </div>
  );
}

function MarkdownInfographic({ syntax }: { syntax?: string }) {
  return (
    <Suspense
      fallback={
        <div className="mt-6 flex h-48 animate-pulse items-center justify-center rounded-3xl border border-dashed border-border bg-muted/50 text-xs font-medium text-muted-foreground">
          Loading infographic...
        </div>
      }
    >
      <InfographicDiagram syntax={syntax} />
    </Suspense>
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
  "mdx-mermaid": MarkdownMermaid,
  "mdx-plantuml": MarkdownPlantUML,
  "mdx-infographic": MarkdownInfographic,
  "mdx-alert": MarkdownAlert,
};

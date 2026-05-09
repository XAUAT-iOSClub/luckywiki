"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

function isModifiedEvent(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function isInternalNavigationTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest("a[href]");

  if (!(anchor instanceof HTMLAnchorElement)) {
    return null;
  }

  if (
    anchor.target === "_blank" ||
    anchor.hasAttribute("download") ||
    anchor.getAttribute("rel")?.includes("external")
  ) {
    return null;
  }

  const href = anchor.getAttribute("href");

  if (!href || href.startsWith("#")) {
    return null;
  }

  const url = new URL(anchor.href, window.location.href);

  if (url.origin !== window.location.origin) {
    return null;
  }

  const currentUrl = new URL(window.location.href);

  if (url.pathname === currentUrl.pathname && url.search === currentUrl.search) {
    return null;
  }

  return url;
}

export function TopRouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = React.useState(false);
  const completeTimeoutRef = React.useRef<number | null>(null);

  const clearCompleteTimeout = React.useCallback(() => {
    if (completeTimeoutRef.current !== null) {
      window.clearTimeout(completeTimeoutRef.current);
      completeTimeoutRef.current = null;
    }
  }, []);

  const start = React.useCallback(() => {
    clearCompleteTimeout();
    setVisible(true);
  }, [clearCompleteTimeout]);

  const finish = React.useCallback(() => {
    clearCompleteTimeout();
    completeTimeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      completeTimeoutRef.current = null;
    }, 220);
  }, [clearCompleteTimeout]);

  React.useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || isModifiedEvent(event) || event.button !== 0) {
        return;
      }

      const url = isInternalNavigationTarget(event.target);

      if (!url) {
        return;
      }

      start();
    };

    const handlePopState = () => {
      start();
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      clearCompleteTimeout();
    };
  }, [clearCompleteTimeout, start]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-primary/10" />
      <div className="route-progress-bar h-full w-full bg-primary" />
    </div>
  );
}

"use client";

import { useEffect, useId, useRef } from "react";
import { Infographic } from "@antv/infographic";

export function InfographicDiagram({ syntax }: { syntax?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const infographicRef = useRef<Infographic | null>(null);
  const generatedId = useId();
  const containerId = useRef(
    `infographic-${generatedId.replace(/:/g, "")}`,
  );

  useEffect(() => {
    if (!syntax || !containerRef.current) return;

    infographicRef.current?.destroy?.();

    const instance = new Infographic({
      container: `#${containerId.current}`,
      width: "100%",
      height: "100%",
    });

    instance.render(syntax);
    infographicRef.current = instance;

    return () => {
      infographicRef.current?.destroy?.();
      infographicRef.current = null;
    };
  }, [syntax]);

  if (!syntax) return null;

  return (
    <div
      id={containerId.current}
      ref={containerRef}
      className="mt-6 overflow-hidden rounded-3xl border border-border bg-muted/20 p-6"
    />
  );
}

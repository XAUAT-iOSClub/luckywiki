"use client";

import { Check, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useRef, useEffect, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const COLLAPSED_HEIGHT = 320;

export function CodeBlock({
  children,
  className,
  ...props
}: {
  children?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Extract language from children's className if available
  const codeElement = (Array.isArray(children) ? children[0] : children) as
    | ReactElement<{ className?: string }>
    | undefined;
  const codeClassName = codeElement?.props?.className || "";
  const language = codeClassName.match(/language-(\w+)/)?.[1] || "";

  useEffect(() => {
    if (preRef.current) {
      const height = preRef.current.scrollHeight;
      if (height > COLLAPSED_HEIGHT + 40) { // Add some buffer
        setIsCollapsible(true);
      }
    }
  }, [children]);

  const onCopy = () => {
    if (!preRef.current) return;
    
    const rawCode = preRef.current.innerText;
    navigator.clipboard.writeText(rawCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-container group relative">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          {language || "code"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground"
          onClick={onCopy}
          title="Copy code"
        >
          {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
        </Button>
      </div>
      
      <div 
        ref={containerRef}
        className={cn(
          "relative overflow-hidden transition-[max-height] duration-500 ease-in-out",
          isCollapsible && !isExpanded ? "max-h-[320px]" : "max-h-[5000px]"
        )}
      >
        <pre 
          ref={preRef}
          className={cn("m-0! overflow-x-auto border-none! bg-transparent! p-4 text-[13px] leading-6", className)} 
          {...props}
        >
          {children}
        </pre>
        
        {isCollapsible && !isExpanded && (
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent pointer-events-none" />
        )}
      </div>

      {isCollapsible && (
        <div className="flex justify-center border-t border-border/60 bg-muted/20 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="size-3" />
                <span>Show less</span>
              </>
            ) : (
              <>
                <ChevronDown className="size-3" />
                <span>Show more</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}


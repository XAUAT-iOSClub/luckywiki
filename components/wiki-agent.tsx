"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  FileText,
  RefreshCcw,
  Sparkles,
  Square,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/components/ui/marker";
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageGroup,
} from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { resolveAgentMessageContentOnError } from "@/lib/agent/message-state";
import { buildWikiHref } from "@/lib/wiki/path";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { AgentLocale } from "@/types/agent";
import type { AgentToolCallEvent } from "@/types/agent";

type AgentSource = {
  path: string;
  title: string;
};

type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AgentSource[];
  toolCalls?: AgentToolCallEvent[];
};

type AgentStatusStage = "retrieving" | "answering";

const storageKeyPrefix = "luckywiki-agent:";
const deltaFlushIntervalMs = 60;
const storageFlushDelayMs = 400;

export function WikiAgent() {
  const locale = useLocale();
  const t = useT();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [statusStage, setStatusStage] = useState<AgentStatusStage | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storageKey = useMemo(() => `${storageKeyPrefix}${locale}`, [locale]);
  const hasLoadedStorageRef = useRef(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as AgentMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // Storage can be unavailable in private mode; chat still works.
      }
    } finally {
      hasLoadedStorageRef.current = true;
    }
  }, [storageKey]);

  // Persisting on every token means a synchronous JSON.stringify for the whole
  // conversation on the main thread. Debounce it so streaming stays smooth.
  useEffect(() => {
    if (!hasLoadedStorageRef.current) return;

    const timer = window.setTimeout(() => {
      try {
        if (messages.length === 0) {
          sessionStorage.removeItem(storageKey);
        } else {
          sessionStorage.setItem(storageKey, JSON.stringify(messages));
        }
      } catch {
        // Storage can be unavailable in private mode; chat still works.
      }
    }, storageFlushDelayMs);

    return () => window.clearTimeout(timer);
  }, [messages, storageKey]);

  useEffect(() => {
    if (userScrolledUp) return;

    // Jump to the bottom without stacking smooth-scroll animations on every
    // streaming update.
    const frame = window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading, userScrolledUp]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setUserScrolledUp(scrollHeight - scrollTop - clientHeight > 120);
  }, []);

  useEffect(() => {
    setUserScrolledUp(false);
  }, [messages.length]);

  const handleStop = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setStreamingMessageId(null);
    setStatusStage(null);
  }, []);

  async function handleSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();

    setInput("");
    setUserScrolledUp(false);
    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantId,
        role: "assistant" as const,
        content: "",
        sources: [],
        toolCalls: [],
      },
    ]);
    setIsLoading(true);
    setStreamingMessageId(assistantId);
    setStatusStage("retrieving");

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current = controller;

    let pendingDelta = "";
    let flushTimer: number | null = null;

    const flushDelta = () => {
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }

      if (!pendingDelta) return;

      const delta = pendingDelta;
      pendingDelta = "";
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: message.content + delta }
            : message,
        ),
      );
    };

    const scheduleDeltaFlush = () => {
      if (flushTimer !== null) return;
      flushTimer = window.setTimeout(flushDelta, deltaFlushIntervalMs);
    };

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          messages: [...messages, userMessage]
            .filter(
              (message) =>
                (message.role === "user" || message.role === "assistant") &&
                message.content.trim().length > 0,
            )
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(t.agent.errors.generic);
      }

      await readAgentEventStream(response.body, {
        onStatus: (stage) => {
          setStatusStage(stage);
        },
        onSources: (sources) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, sources } : message,
            ),
          );
        },
        onDelta: (delta) => {
          pendingDelta += delta;
          scheduleDeltaFlush();
        },
        onToolCall: (toolCall) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    toolCalls: [...(message.toolCalls ?? []), toolCall],
                  }
                : message,
            ),
          );
        },
        onMessage: (message) => {
          pendingDelta = "";
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId ? { ...item, content: message } : item,
            ),
          );
        },
        onError: (message) => {
          flushDelta();
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: resolveAgentMessageContentOnError(
                      item.content,
                      message || t.agent.errors.generic,
                    ),
                  }
                : item,
            ),
          );
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      flushDelta();
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: resolveAgentMessageContentOnError(
                  message.content,
                  error instanceof Error ? error.message : t.agent.errors.generic,
                ),
              }
            : message,
        ),
      );
    } finally {
      flushDelta();

      if (requestIdRef.current === requestId) {
        setIsLoading(false);
        setStreamingMessageId(null);
        setStatusStage(null);
        abortRef.current = null;
      }
    }
  }

  function handleReset() {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setStreamingMessageId(null);
    setStatusStage(null);
    setMessages([]);
    sessionStorage.removeItem(storageKey);
    setInput("");
    setUserScrolledUp(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  const hasMessages = messages.length > 0;
  const thinkingLabel =
    statusStage === "retrieving"
      ? t.agent.retrieving
      : statusStage === "answering"
        ? t.agent.answering
        : t.agent.thinking;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {!hasMessages ? (
        <div className="flex flex-1 items-center justify-center px-5 pb-24">
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-6 flex justify-center">
              <div className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-card text-primary">
                <Sparkles className="size-5" />
              </div>
            </div>
            <h1 className="text-center text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[30px]">
              {t.agent.title}
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-center text-[13.5px] leading-6 text-muted-foreground">
              {t.agent.description}
            </p>

            <div className="mt-8 grid gap-2 sm:grid-cols-2">
              {t.agent.promptIdeas.map((idea) => (
                <button
                  key={idea}
                  onClick={() => {
                    setInput(idea);
                    textareaRef.current?.focus();
                  }}
                  type="button"
                  className="rounded-lg border border-border/70 bg-card px-4 py-3 text-left text-[13px] leading-5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto max-w-3xl px-5 py-8">
            <MessageGroup className="gap-8">
              {messages.map((message) => (
                <AgentMessageRow
                  key={message.id}
                  isStreaming={message.id === streamingMessageId}
                  linkToSectionLabel={t.common.linkToSection}
                  locale={locale}
                  message={message}
                  thinkingLabel={thinkingLabel}
                />
              ))}
            </MessageGroup>
          </div>
        </div>
      )}

      <div
        className={
          hasMessages
            ? "shrink-0 border-t border-border/60 bg-background/80 backdrop-blur-xl"
            : "shrink-0"
        }
      >
        <div className="mx-auto max-w-3xl px-5 py-4">
          <form onSubmit={handleSubmit} className="relative">
            <label className="sr-only" htmlFor="agent-input">
              {t.agent.inputPlaceholder}
            </label>
            <Textarea
              ref={textareaRef}
              id="agent-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.agent.inputPlaceholder}
              rows={1}
              className="min-h-11 resize-none rounded-lg border-input bg-card py-3 pl-3.5 pr-12 text-[13.5px] leading-6 transition-colors placeholder:text-muted-foreground/70"
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={handleStop}
                  className="size-7 text-muted-foreground hover:text-foreground"
                >
                  <Square className="h-4 w-4" fill="currentColor" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim()}
                  className="size-7 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>

          <div className="mt-2.5 flex items-center justify-between gap-4">
            <p className="text-[11.5px] leading-5 text-muted-foreground/80">
              {t.agent.disclaimer}
            </p>
            {hasMessages && (
              <Button
                onClick={handleReset}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1.5 px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                <RefreshCcw className="h-3 w-3" />
                {t.agent.reset}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const AgentMessageRow = memo(
  function AgentMessageRow({
    message,
    isStreaming,
    locale,
    linkToSectionLabel,
    thinkingLabel,
  }: {
    message: AgentMessage;
    isStreaming: boolean;
    locale: AgentLocale;
    linkToSectionLabel: string;
    thinkingLabel: string;
  }) {
    const isAssistant = message.role === "assistant";

    return (
      <Message align={isAssistant ? "start" : "end"}>
        <MessageContent>
          {isAssistant ? (
            message.content ? (
              <Bubble variant="ghost">
                <BubbleContent className="text-[13.5px] leading-6">
                  {isStreaming ? (
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  ) : (
                    <MarkdownRenderer
                      className="text-[13.5px] leading-6"
                      linkToSectionLabel={linkToSectionLabel}
                      markdown={message.content}
                    />
                  )}
                </BubbleContent>
              </Bubble>
            ) : isStreaming ? (
              <Marker role="status">
                <MarkerIcon>
                  <Spinner />
                </MarkerIcon>
                <MarkerContent>{thinkingLabel}</MarkerContent>
              </Marker>
            ) : null
          ) : (
            <Bubble>
              <BubbleContent>
                <span className="whitespace-pre-wrap text-[13.5px] leading-6">
                  {message.content}
                </span>
              </BubbleContent>
            </Bubble>
          )}

          {isAssistant &&
            message.sources &&
            message.sources.length > 0 && (
              <MessageFooter className="flex-col items-start gap-1.5 px-0 text-[11.5px]">
                {message.sources.map((source) => (
                  <Marker asChild key={source.path}>
                    <Link href={buildWikiHref(source.path, locale)}>
                      <MarkerIcon>
                        <FileText />
                      </MarkerIcon>
                      <MarkerContent>{source.title}</MarkerContent>
                    </Link>
                  </Marker>
                ))}
              </MessageFooter>
            )}
        </MessageContent>
      </Message>
    );
  },
  (previous, next) =>
    previous.message === next.message &&
    previous.isStreaming === next.isStreaming &&
    previous.locale === next.locale &&
    previous.linkToSectionLabel === next.linkToSectionLabel &&
    (!next.isStreaming || previous.thinkingLabel === next.thinkingLabel),
);

async function readAgentEventStream(
  stream: ReadableStream<Uint8Array>,
  handlers: {
    onSources: (sources: AgentSource[]) => void;
    onDelta: (delta: string) => void;
    onMessage: (message: string) => void;
    onError: (message: string) => void;
    onStatus?: (stage: AgentStatusStage) => void;
    onToolCall?: (event: AgentToolCallEvent) => void;
    signal?: AbortSignal;
  },
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const abortHandler = () => reader.cancel();
  handlers.signal?.addEventListener("abort", abortHandler, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const lines = event.split("\n");
        const eventName = lines
          .find((line) => line.startsWith("event:"))
          ?.slice("event:".length)
          .trim();
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).trim())
          .join("\n");

        if (!eventName || !data) continue;

        const payload = JSON.parse(data) as {
          text?: string;
          message?: string;
          stage?: string;
          sources?: AgentSource[];
          name?: string;
          label?: string;
          summary?: string;
        };

        if (eventName === "status") {
          if (payload.stage === "retrieving" || payload.stage === "answering") {
            handlers.onStatus?.(payload.stage);
          }
        }
        if (eventName === "sources") {
          handlers.onSources(payload.sources ?? []);
        }
        if (eventName === "delta" && payload.text) {
          handlers.onDelta(payload.text);
        }
        if (eventName === "message" && payload.text) {
          handlers.onMessage(payload.text);
        }
        if (eventName === "tool" && payload.name && payload.label) {
          handlers.onToolCall?.({
            name: payload.name,
            label: payload.label,
            summary: payload.summary ?? "",
          });
        }
        if (eventName === "error") {
          handlers.onError(payload.message ?? "");
        }
        if (eventName === "done") {
          return;
        }
      }
    }
  } finally {
    handlers.signal?.removeEventListener("abort", abortHandler);
  }
}

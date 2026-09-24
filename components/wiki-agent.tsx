"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Cpu,
  FileText,
  RefreshCcw,
  Sparkles,
  Square,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
} from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { resolveAgentMessageContentOnError } from "@/lib/agent/message-state";
import { buildWikiHref } from "@/lib/wiki/path";
import { useLocale, useT } from "@/lib/i18n/provider";
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

const storageKeyPrefix = "luckywiki-agent:";

export function WikiAgent() {
  const locale = useLocale();
  const t = useT();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storageKey = useMemo(() => `${storageKeyPrefix}${locale}`, [locale]);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as AgentMessage[];
      if (Array.isArray(parsed)) setMessages(parsed);
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey]);

  useEffect(() => {
    if (!userScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
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
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          messages: [
            ...messages,
            userMessage,
          ]
            .filter(
              (m) =>
                (m.role === "user" || m.role === "assistant") &&
                m.content.trim().length > 0,
            )
            .map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(t.agent.errors.generic);
      }

      await readAgentEventStream(response.body, {
        onSources: (sources) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((m) =>
                m.id === assistantId ? { ...m, sources } : m,
              ),
            );
          });
        },
        onDelta: (delta) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + delta }
                  : m,
              ),
            );
          });
        },
        onToolCall: (event) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((m) =>
                m.id === assistantId
                  ? { ...m, toolCalls: [...(m.toolCalls ?? []), event] }
                  : m,
              ),
            );
          });
        },
        onMessage: (message) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((m) =>
                m.id === assistantId ? { ...m, content: message } : m,
              ),
            );
          });
        },
        onError: (message) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: resolveAgentMessageContentOnError(
                        m.content,
                        message || t.agent.errors.generic,
                      ),
                    }
                  : m,
              ),
            );
          });
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: resolveAgentMessageContentOnError(
                  m.content,
                  error instanceof Error ? error.message : t.agent.errors.generic,
                ),
              }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  function handleReset() {
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

  return (
    <div className="relative flex h-full flex-col">
      {!hasMessages ? (
        <div className="flex flex-1 items-center justify-center px-4 pb-32">
          <div className="mx-auto w-full max-w-xl animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="mb-8 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
                <Sparkles className="h-8 w-8" />
              </div>
            </div>
            <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t.agent.title}
            </h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground md:text-base">
              {t.agent.description}
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {t.agent.promptIdeas.map((idea) => (
                <button
                  key={idea}
                  onClick={() => {
                    setInput(idea);
                    textareaRef.current?.focus();
                  }}
                  type="button"
                  className="rounded-2xl border border-border/40 bg-card/60 px-5 py-4 text-left text-sm leading-relaxed text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:border-primary/30 hover:bg-card hover:text-foreground hover:shadow-sm"
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
          <div className="mx-auto max-w-3xl px-4 py-8">
            <MessageGroup className="gap-8">
              {messages.map((message) => (
                <Message
                  align={message.role === "user" ? "end" : "start"}
                  key={message.id}
                >
                  {/* {message.role === "assistant" && (
                    <MessageAvatar>
                      <Avatar>
                        <AvatarFallback>
                          <Sparkles />
                        </AvatarFallback>
                      </Avatar>
                    </MessageAvatar>
                  )} */}

                  <MessageContent>
                    {message.role === "assistant" ? (
                      message.content ? (
                        <Bubble variant="ghost">
                          <BubbleContent className="prose-sm prose-p:my-2 prose-headings:mb-3 prose-headings:mt-5 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-pre:my-3 prose-code:text-inherit dark:prose-invert">
                            <MarkdownRenderer
                              linkToSectionLabel={t.common.linkToSection}
                              markdown={message.content}
                            />
                          </BubbleContent>
                        </Bubble>
                      ) : isLoading ? (
                        <Marker role="status">
                          <MarkerIcon>
                            <Spinner />
                          </MarkerIcon>
                          <MarkerContent className="sr-only">
                            {t.agent.title}
                          </MarkerContent>
                        </Marker>
                      ) : null
                    ) : (
                      <Bubble>
                        <BubbleContent>
                          <span className="whitespace-pre-wrap">
                            {message.content}
                          </span>
                        </BubbleContent>
                      </Bubble>
                    )}
                    {/* 工具调用记录已隐藏
                    {message.role === "assistant" &&
                      message.toolCalls &&
                      message.toolCalls.length > 0 && (
                        <MessageFooter className="flex-col items-start gap-2 px-0">
                          {message.toolCalls.map((call, index) => (
                            <Marker key={`${call.name}-${index}`} variant="border">
                              <MarkerIcon>
                                <Cpu />
                              </MarkerIcon>
                              <MarkerContent>
                                {call.summary
                                  ? `${call.label}: ${call.summary}`
                                  : call.label}
                              </MarkerContent>
                            </Marker>
                          ))}
                        </MessageFooter>
                      )} */}

                    {message.role === "assistant" &&
                      message.sources &&
                      message.sources.length > 0 && (
                        <MessageFooter className="flex-col items-start gap-2 px-0">
                          {message.sources.map((source) => (
                            <Marker
                              asChild
                              key={source.path}
                            >
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
              ))}
              <div ref={bottomRef} />
            </MessageGroup>
          </div>
        </div>
      )}

      <div
        className={
          hasMessages
            ? "shrink-0 border-t border-border/40 bg-background/80 backdrop-blur-xl"
            : "shrink-0"
        }
      >
        <div className="mx-auto max-w-3xl px-4 py-4">
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
              className="min-h-14 resize-none rounded-2xl border-border/50 bg-card/60 py-4 pl-5 pr-14 text-sm leading-7 shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-muted-foreground/70 hover:border-border focus:border-primary/40 focus:bg-card focus:shadow-md focus:ring-0"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-1">
              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={handleStop}
                  className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                >
                  <Square className="h-4 w-4" fill="currentColor" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim()}
                  className="h-8 w-8 rounded-xl transition-all duration-200 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>

          <div className="mt-3 flex items-center justify-between px-1">
            <p className="text-xs leading-5 text-muted-foreground/70">
              {t.agent.disclaimer}
            </p>
            {hasMessages && (
              <Button
                onClick={handleReset}
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto gap-1.5 rounded-xl px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
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

async function readAgentEventStream(
  stream: ReadableStream<Uint8Array>,
  handlers: {
    onSources: (sources: AgentSource[]) => void;
    onDelta: (delta: string) => void;
    onMessage: (message: string) => void;
    onError: (message: string) => void;
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
          sources?: AgentSource[];
          name?: string;
          label?: string;
          summary?: string;
        };

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

"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCcw, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildWikiHref } from "@/lib/wiki-path";
import { useLocale, useT } from "@/lib/i18n/provider";

type AgentSource = {
  path: string;
  title: string;
};

type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AgentSource[];
};

const storageKeyPrefix = "luckywiki-agent:";

export function WikiAgent() {
  const locale = useLocale();
  const t = useT();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const storageKey = useMemo(() => `${storageKeyPrefix}${locale}`, [locale]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);

      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as AgentMessage[];
      if (Array.isArray(parsed)) {
        setMessages(parsed);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const nextMessages = [
      ...messages,
      userMessage,
      {
        id: assistantId,
        role: "assistant" as const,
        content: "",
        sources: [],
      },
    ];

    setInput("");
    setMessages(nextMessages);
    setIsLoading(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locale,
          messages: nextMessages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(t.agent.errors.generic);
      }

      await readAgentEventStream(response.body, {
        onSources: (sources) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      sources,
                    }
                  : message,
              ),
            );
          });
        },
        onDelta: (delta) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: message.content + delta,
                    }
                  : message,
              ),
            );
          });
        },
        onMessage: (message) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      content: message,
                    }
                  : entry,
              ),
            );
          });
        },
        onError: (message) => {
          startTransition(() => {
            setMessages((current) =>
              current.map((entry) =>
                entry.id === assistantId
                  ? {
                      ...entry,
                      content: message,
                    }
                  : entry,
              ),
            );
          });
        },
      });
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: error instanceof Error ? error.message : t.agent.errors.generic,
              }
            : message,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setMessages([]);
    sessionStorage.removeItem(storageKey);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section className="surface-panel !rounded-[2.5rem] !p-5 md:!p-6 border-border/40 shadow-xl shadow-black/5 dark:shadow-black/20 min-h-[560px] flex flex-col">
        <div className="mb-4 flex items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <p className="text-sm font-semibold">{t.agent.chatTitle}</p>
            <p className="text-sm text-muted-foreground">{t.agent.chatHint}</p>
          </div>
          <Button
            onClick={handleReset}
            type="button"
            variant="outline"
            className="rounded-xl"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {t.agent.reset}
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-border/60 bg-muted/20 p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold">{t.agent.emptyTitle}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t.agent.emptyDescription}
              </p>
            </div>
          ) : null}

          {messages.map((message) => (
            <article
              key={message.id}
              className={message.role === "user" ? "ml-auto max-w-3xl" : "mr-auto max-w-4xl"}
            >
              <div
                className={
                  message.role === "user"
                    ? "rounded-[1.75rem] rounded-br-md bg-primary px-5 py-4 text-primary-foreground shadow-sm"
                    : "rounded-[1.75rem] rounded-bl-md border border-border/50 bg-card/70 px-5 py-4 shadow-sm"
                }
              >
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {message.content || (isLoading && message.role === "assistant" ? t.agent.thinking : "")}
                </p>
              </div>

              {message.role === "assistant" && message.sources && message.sources.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.sources.map((source) => (
                    <Badge
                      asChild
                      key={source.path}
                      variant="secondary"
                      className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium hover:bg-background"
                    >
                      <Link href={buildWikiHref(source.path, locale)}>
                        {source.title}
                      </Link>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </article>
          ))}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="mt-6 border-t border-border/40 pt-4">
          <label className="sr-only" htmlFor="agent-input">
            {t.agent.inputPlaceholder}
          </label>
          <Textarea
            id="agent-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t.agent.inputPlaceholder}
            className="min-h-32 rounded-[1.75rem] border-border/50 bg-background/60 px-5 py-4 text-sm leading-7 shadow-sm"
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-6 text-muted-foreground">{t.agent.disclaimer}</p>
            <Button disabled={isLoading || !input.trim()} type="submit" className="rounded-xl">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t.agent.send}
            </Button>
          </div>
        </form>
      </section>

      <aside className="space-y-4">
        <div className="surface-panel !rounded-[2rem] !p-5 border-border/40">
          <p className="text-sm font-semibold">{t.agent.promptIdeasTitle}</p>
          <div className="mt-3 flex flex-col gap-2">
            {t.agent.promptIdeas.map((idea) => (
              <button
                key={idea}
                className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3 text-left text-sm leading-6 transition hover:border-primary/30 hover:bg-background"
                onClick={() => setInput(idea)}
                type="button"
              >
                {idea}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-panel !rounded-[2rem] !p-5 border-border/40">
          <p className="text-sm font-semibold">{t.agent.sourcesTitle}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t.agent.sourcesHint}
          </p>
        </div>
      </aside>
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
  },
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

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

      if (!eventName || !data) {
        continue;
      }

      const payload = JSON.parse(data) as {
        text?: string;
        message?: string;
        sources?: AgentSource[];
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

      if (eventName === "error") {
        handlers.onError(payload.message ?? "");
      }

      if (eventName === "done") {
        return;
      }
    }
  }
}

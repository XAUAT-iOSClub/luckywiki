export type AgentLocale = "zh" | "en";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentSource = {
  path: string;
  title: string;
};

export type RetrievedAgentChunk = AgentSource & {
  heading: string | null;
  content: string;
  score: number;
};

export type AgentToolCallEvent = {
  name: string;
  label: string;
  summary: string;
};

export type StreamAgentAnswerInput = {
  locale: AgentLocale;
  context: Array<{
    title: string;
    path: string;
    heading: string | null;
    content: string;
  }>;
  messages: AgentChatMessage[];
  onDelta: (delta: string) => void;
  onToolCall?: (event: AgentToolCallEvent) => void;
  signal?: AbortSignal;
};

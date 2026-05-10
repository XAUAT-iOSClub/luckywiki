export type AgentLocale = "zh" | "en";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
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
  signal?: AbortSignal;
};

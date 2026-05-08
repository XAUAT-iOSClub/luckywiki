import { getDictionary } from "@/lib/i18n/get-dictionary";
import { createAgentRouteResponse } from "@/lib/agent-route";
import { streamAgentAnswer } from "@/lib/agent-openai";
import {
  findSuggestedAgentSources,
  retrieveRelevantAgentChunks,
} from "@/lib/agent-search";

export async function POST(request: Request) {
  return createAgentRouteResponse(request, {
    getDictionary,
    retrieveRelevantChunks: retrieveRelevantAgentChunks,
    findSuggestedSources: findSuggestedAgentSources,
    streamAnswer: streamAgentAnswer,
  });
}

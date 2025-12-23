import OpenAI from "openai";
import fs from "fs";
import dotenv from "dotenv";

import {
  createAgent,
  getAgentByAssistantId,
  addFilesToAgent as mongoAddFilesToAgent,
  createThread,
} from "./mongoService";
import { Agent } from "../types/mongoModels.types";
import { AssistantResponse } from "../types/openAI.types";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export { openai };

export async function createUserAssistant(
  phone: string | null,
  userEmail: string,
  instructions?: string
): Promise<AssistantResponse> {

  const vectorStore = await openai.vectorStores.create({
    name: phone ? `Vector store for ${phone}` : "Vector store",
  });

  console.log("Vector store:", vectorStore);

  // Create new assistant with vector store
  const assistant = await openai.beta.assistants.create({
    name: phone ? `Assistant for ${phone}` : "Assistant",
    instructions:
      instructions ||
      "You are a helpful assistant that can answer questions based on the provided documents and context.",
    model: "gpt-5-mini",
    tools: [{ type: "file_search" }],
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStore.id],
      },
    },
  });

  // Store in MongoDB with vector store ID and user email
  await createAgent(phone || "", assistant.id, vectorStore.id);

  return {
    assistantId: assistant.id,
    vectorStoreId: vectorStore.id,
  };
}

export async function uploadFileToOpenAI(filePath: string): Promise<string> {
  const file = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: "assistants",
  });
  return file.id;
}

export async function attachFilesToAssistant(
  assistantId: string,
  fileIds: string[]
): Promise<void> {
  console.log("Attaching files to assistant:", assistantId, fileIds);

  // Get the agent to find the vector store ID
  const agent: Agent | null = await getAgentByAssistantId(assistantId);
  if (!agent || !agent.vectorStoreId) {
    throw new Error("Agent or vector store not found");
  }

  const vectorStoreId = agent.vectorStoreId as string; // Type assertion since we verified it exists

  // Add files to vector store
  await openai.vectorStores.files.create(agent.vectorStoreId, {
    file_id: fileIds[0]!,
  });

  // Add files to OpenAI assistant
  const updatedAssistant = await openai.beta.assistants.update(assistantId, {
    // file_ids: fileIds,
    tools: [{ type: "file_search" }],
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStoreId],
      },
    },
  });

  console.log("Updated assistant:", updatedAssistant);

  // Store file references in MongoDB
  await mongoAddFilesToAgent(assistantId, fileIds);
}

export async function handleAssistantReply({
  assistantId,
  threadId,
  userMessage,
}: {
  assistantId: string;
  threadId: string;
  userMessage: string;
}): Promise<string> {
  if (!assistantId || !threadId || !userMessage) {
    throw new Error("Assistant ID, thread ID, and user message are required.");
  }

  // Get the agent to verify it exists
  const agent = await getAgentByAssistantId(assistantId);
  if (!agent) {
    throw new Error("Agent not found.");
  }

  const threadMessages = await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: userMessage,
  });

  console.log("[chat/run] Message created for OpenAI", {
    assistantId,
    threadId,
    promptPreview: userMessage.substring(0, 200),
    promptLength: userMessage.length,
  });

  console.log("Thread messages:", threadMessages);

  // Run assistant on thread
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
  });

  // Poll until complete
  let completedRun;
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds timeout

  while (attempts < maxAttempts) {
    try {
      console.log("Retrieving run with:", {
        threadId,
        runId: run.id,
        attempt: attempts + 1,
      });

      completedRun = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId });

      if (!completedRun) {
        throw new Error("Run not found in thread");
      }

      console.log("Run status:", completedRun.status);

      if (completedRun.status === "completed") {
        console.log("[chat/run] Completed run", {
          assistantId,
          threadId,
          runId: completedRun.id,
          model: completedRun.model ?? "unknown",
        });
        break;
      }

      if (["failed", "cancelled", "expired"].includes(completedRun.status)) {
        throw new Error(`Run failed with status: ${completedRun.status}`);
      }

      attempts++;
      await new Promise((r) => setTimeout(r, 1000)); // wait 1s
    } catch (error) {
      console.error("Error retrieving run:", {
        error: error instanceof Error ? error.message : "Unknown error",
        threadId,
        runId: run.id,
        attempt: attempts + 1,
      });
      throw error;
    }
  }

  if (attempts >= maxAttempts) {
    throw new Error("Run timed out after 30 seconds");
  }

  // Get assistant reply
  const messages = await openai.beta.threads.messages.list(threadId);
  const lastMessage = messages.data.find((m) => m.role === "assistant");
  const reply =
    lastMessage?.content?.[0] && "text" in lastMessage.content[0]
      ? lastMessage.content[0].text.value
      : "No response";

  return reply;
}


export async function handleAssistantReplyCardsDetails({
  assistantId,
  threadId,
  userMessage,
  instruction
}: {
  assistantId: string;
  threadId: string;
  userMessage: string;
  instruction: string
}): Promise<string> {
  if (!assistantId || !threadId || !userMessage) {
    throw new Error("Assistant ID, thread ID, and user message are required.");
  }

  // Get the agent to verify it exists
  const agent = await getAgentByAssistantId(assistantId);
  if (!agent) {
    throw new Error("Agent not found.");
  }

  const threadMessages = await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: userMessage,
  });

  console.log("[cards/run] Message created for OpenAI", {
    assistantId,
    threadId,
    promptPreview: userMessage.substring(0, 200),
    promptLength: userMessage.length,
    instructionPreview: instruction.substring(0, 200),
    instructionLength: instruction.length,
  });

  console.log("Thread messages:", threadMessages);

  // Run assistant on thread
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
    tools: [],
    instructions: instruction,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "cards_schema",
        schema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer", enum: [1, 2, 3, 4] },
                  title: { type: "string", enum: ["Cross Roads", "Think Different", "Builder Mode", "Surprise Me!"] },
                  description: { type: "string" },
                  prompt: { type: "string" },
                  img_ref: { type: "string" }
                },
                required: ["id", "title", "description", "prompt", "img_ref"],
                additionalProperties: false
              },
              minItems: 4,
              maxItems: 4
            }
          },
          required: ["cards"],
          additionalProperties: false
        }
      }
    }
  });

  // Poll until complete
  let completedRun;
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds timeout

  while (attempts < maxAttempts) {
    try {
      console.log("Retrieving run with:", {
        threadId,
        runId: run.id,
        attempt: attempts + 1,
      });

      completedRun = await openai.beta.threads.runs.retrieve(run.id, { thread_id: threadId });

      if (!completedRun) {
        throw new Error("Run not found in thread");
      }

      console.log("Run status:", completedRun.status);

      if (completedRun.status === "completed") {
        console.log("[cards/run] Completed run", {
          assistantId,
          threadId,
          runId: completedRun.id,
          model: completedRun.model ?? "unknown",
        });
        break;
      }

      if (["failed", "cancelled", "expired"].includes(completedRun.status)) {
        throw new Error(`Run failed with status: ${completedRun.status}`);
      }

      attempts++;
      await new Promise((r) => setTimeout(r, 1000)); // wait 1s
    } catch (error) {
      console.error("Error retrieving run:", {
        error: error instanceof Error ? error.message : "Unknown error",
        threadId,
        runId: run.id,
        attempt: attempts + 1,
      });
      throw error;
    }
  }

  if (attempts >= maxAttempts) {
    throw new Error("Run timed out after 30 seconds");
  }

  // Get assistant reply
  const messages = await openai.beta.threads.messages.list(threadId);
  const lastMessage = messages.data.find((m) => m.role === "assistant");
  const reply =
    lastMessage?.content?.[0] && "text" in lastMessage.content[0]
      ? lastMessage.content[0].text.value
      : "No response";

  return reply;
}

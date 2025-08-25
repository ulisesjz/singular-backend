import multer from "multer";
import * as path from "path";
import * as fs from "fs";
import {
  createUserAssistant,
  uploadFileToOpenAI,
  attachFilesToAssistant,
  openai,
  handleAssistantReply,
} from "../services/openAIService";
import {
  getAgentByPhone,
  getAgentByAssistantId,
  addMessageToThread,
  createThread,
} from "../services/mongoService";
import { Request, Response, Router } from "express";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post(
  "/create-agent",
  async (req: Request, res: Response): Promise<void> => {
    try {
       const { phone, userEmail, instructions } = req.body as {
         phone?: string;
         userEmail: string;
         instructions?: string;
       };

       if (!userEmail) {
         res.status(400).json({ error: "User email is required." });
         return;
       }

      // If phone is provided, check if agent already exists
      if (phone) {
        const existingAgent = await getAgentByPhone(phone);
        if (existingAgent) {
          res.json({
            assistantId: existingAgent.assistantId,
            threadId: existingAgent.threadId,
            message: "Agent already exists",
          });
          return;
        }
      }

      const { assistantId } = await createUserAssistant(
        phone || null,
        userEmail,
        instructions
      );

      res.json({ assistantId });
    } catch (err) {
      console.error("Create agent error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Create a new thread and send a message to the assistant
router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { assistantId, threadId, userMessage } = req.body as {
      assistantId: string;
      threadId: string;
      userMessage: string;
    };
    const reply = await handleAssistantReply({
      assistantId,
      threadId,
      userMessage,
    });
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

router.post("/chat/stream", async (req: Request, res: Response) => {
  const { assistantId, threadId, userMessage, instruction } = req.body;

  if (!assistantId || !threadId || !userMessage) {
    res.write(
      `event: error\ndata: Missing assistantId, threadId or userMessage\n\n`
    );
    res.end();
    return;
  }

  //headers para SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const agent = await getAgentByAssistantId(assistantId);
    if (!agent) {
      res.write(`event: error\ndata: Agent not found\n\n`);
      res.end();
      return;
    }

    const promptToSend = userMessage.trim();

    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: promptToSend,
      // attachments: [
      //   {
      //     file_id: "file-1unjAdSXMCbEyG2gXg4hu6",
      //     tools: [{ type: "file_search" }],
      //   },
      // ],
    });

    const stream = await openai.beta.threads.runs.stream(threadId, {
      assistant_id: assistantId,
      additional_instructions: instruction,
      tools: []
    });

    let fullResponse = "";

    stream
      .on("textDelta", (delta) => {
        if (delta.value) {
          fullResponse += delta.value;
          // Usamos JSON.stringify para que los \n y otros caracteres especiales se manejen correctamente
          res.write(`data: ${JSON.stringify(delta.value)}\n\n`);
        }
      })
      .on("end", async () => {
        await addMessageToThread(threadId, "user", userMessage);
        await addMessageToThread(threadId, "assistant", fullResponse);

        res.write(`event: done\ndata: [DONE]\n\n`);
        res.end();
      })
      .on("error", (err) => {
        console.error("Run stream error:", err);
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`
        );
        res.end();
      });
  } catch (err) {
    console.error("Stream error:", err);
    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: "Internal server error",
      })}\n\n`
    );
    res.end();
  }
});

router.post(
  "/add-files",
  upload.array("files"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { assistantId } = req.body as { assistantId: string };
      if (!assistantId) {
        res.status(400).json({ error: "Assistant ID is required." });
        return;
      }
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({ error: "No files were uploaded." });
        return;
      }
      console.log("Files:", req.files);
      console.log("assistantId:", assistantId);
      // Verify agent exists
      const agent = await getAgentByAssistantId(assistantId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const fileIds: string[] = [];

      for (const file of req.files) {
        try {
          console.log("Uploading file:", file.path);
          const ext = path.extname(file.originalname) || ".pdf"; // fallback for safety
          const renamedPath = `${file.path}${ext}`;

          fs.renameSync(file.path, renamedPath); // Add back the extension

          const fileId = await uploadFileToOpenAI(renamedPath); // same stream logic
          fileIds.push(fileId);

          fs.unlinkSync(renamedPath); // cleanup
        } catch (error) {
          console.error("Error uploading file:", error);
          // Clean up any remaining files
          req.files.forEach((f) => {
            if (fs.existsSync(f.path)) {
              fs.unlinkSync(f.path);
            }
          });
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
          throw new Error(`Failed to upload file: ${errorMessage}`);
        }
      }

      if (fileIds.length > 0) {
        await attachFilesToAssistant(assistantId, fileIds);
      }

      res.json({
        message: "Files added successfully",
        fileIds,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error("Add files error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  "/create-thread",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { assistantId, userEmail } = req.body as {
        assistantId: string;
        userEmail: string;
      };
      if (!assistantId || !userEmail) {
        res
          .status(400)
          .json({ error: "Assistant ID and user email are required." });
        return;
      }

      // Verify agent exists
      const agent = await getAgentByAssistantId(assistantId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      // Create new thread in OpenAI
      const thread = await openai.beta.threads.create();

      // Store thread in MongoDB with user email
      await createThread(assistantId, thread.id, userEmail);

      res.json({
        threadId: thread.id,
        message: "Thread created successfully",
      });
    } catch (err) {
      console.error("Create thread error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      res.status(500).json({ error: errorMessage });
    }
  }
);

export default router;

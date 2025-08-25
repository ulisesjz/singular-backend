import { Request, Response, Router } from "express";
import {
  deleteThread,
  getThreadById,
  getThreadByThreadId,
  updateThreadIsPending,
  updateThreadName,
} from "../services/mongoService";
import { handleAssistantReply, openai } from "../services/openAIService";
import { getUserById, updateUser } from "../services/Singular/userService";

const router = Router();

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: "Id is required." });
      return;
    }

    await deleteThread(id);
    res.json({ message: "Thread deleted successfully" });
  } catch (err) {
    console.error("Create question error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

router.post("/generate-name", async (req: Request, res: Response) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const { userId, threadId, firstMessage } = req.body;

    // 1️⃣ Validaciones
    if (!userId || !threadId || !firstMessage) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: "User ID, Thread ID and firstMessage are required.",
        })}\n\n`
      );
      res.write(`event: done\ndata: [DONE]\n\n`);
      res.end();
      return;
    }

    // 2️⃣ Obtener thread real
    const thread = await getThreadById(threadId);
    if (!thread) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: "Thread not found",
        })}\n\n`
      );
      res.write(`event: done\ndata: [DONE]\n\n`);
      res.end();
      return;
    }

    // 3️⃣ NamingThread del usuario
    let user = await getUserById(userId);
    let namingThreadId = user?.namingThreadId;
    if (!namingThreadId) {
      const namingThread = await openai.beta.threads.create();
      namingThreadId = namingThread.id;
      await updateUser(userId, { namingThreadId });
    }

    // 4️⃣ Prompt
    const prompt = `
Genera un título breve y claro para identificar este hilo de conversación, basándote únicamente en el siguiente primer mensaje del usuario:
"${firstMessage}"

Requisitos:
- Máximo 4 palabras.
- Específico y conciso.
- Evita palabras genéricas como "consulta" o "pregunta".
- Reflejar el tema principal.
Devuélveme solo el título sin explicaciones adicionales.
`;

    // 5️⃣ Crear mensaje en namingThread
    await openai.beta.threads.messages.create(namingThreadId, {
      role: "user",
      content: prompt,
    });

    // 6️⃣ Stream
    const stream = await openai.beta.threads.runs.stream(namingThreadId, {
      assistant_id: thread.assistantId,
    });

    let fullResponse = "";

    stream
      .on("textDelta", (delta) => {
        if (delta.value) {
          fullResponse += delta.value;
          res.write(`data: ${delta.value}\n\n`);
        }
      })
      .on("end", async () => {
        const finalName = fullResponse.trim() || "Nuevo chat";
        await updateThreadName(threadId, finalName);

        // Enviar nombre final limpio
        res.write(`event: finalName\ndata: ${JSON.stringify(finalName)}\n\n`);

        res.write(`event: done\ndata: [DONE]\n\n`);
        res.end();
      })
      .on("error", (err) => {
        console.error("Run stream error:", err);
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`
        );
        res.write(`event: done\ndata: [DONE]\n\n`);
        res.end();
      });
  } catch (err) {
    console.error("Create name thread error:", err);
    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      })}\n\n`
    );
    res.write(`event: done\ndata: [DONE]\n\n`);
    res.end();
  }
});

router.put("/:threadId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { threadId } = req.params;
    const { name, isPendingThread } = req.body;
    console.log(threadId);

    if (!threadId) {
      res.status(400).json({ error: "threadId is required." });
      return;
    }

    const thread = await getThreadByThreadId(threadId);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    if (name) {
      await updateThreadName(threadId, name);
    }
    if (isPendingThread !== undefined) {
      await updateThreadIsPending(threadId, isPendingThread);
    }
    res.json({ name: name, isPendingThread: isPendingThread });
  } catch (err) {
    console.error("Update thread error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

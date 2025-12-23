import { Request, Response, Router } from "express";
import { Question } from "../../types/singular/mongoModels.singular.types";
import {
  assignAnswersToUser,
  createQuestion,
  getQuestions,
} from "../../services/Singular/questionService";
import {
  getFormattedUserAnswers,
  getUserById,
} from "../../services/Singular/userService";
import { getThreadByEmail } from "../../services/mongoService";
import { handleAssistantReply, handleAssistantReplyCardsDetails } from "../../services/openAIService";

const router = Router();

router.get("/questions", async (req: Request, res: Response): Promise<void> => {
  try {
    const questions = await getQuestions();
    res.json({ questions });
  } catch (err) {
    console.error("Get questions error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

router.post("/question", async (req: Request, res: Response): Promise<void> => {
  try {
    const { title } = req.body as Question;

    if (!title) {
      res.status(400).json({ error: "Title is required." });
      return;
    }

    const question = await createQuestion(req.body);
    res.json({ question });
  } catch (err) {
    console.error("Create question error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    res.status(500).json({ error: errorMessage });
  }
});

router.post(
  "/respond-questions/:userId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { answers } = req.body as {
        answers: { questionId: string; response: string }[];
      };
      const userId = req.params["userId"];

      if (!userId || !Array.isArray(answers)) {
        res.status(400).json({ error: "User ID and answers are required." });
        return;
      }
      const user = await getUserById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const invalidAnswer = answers.find((a) => !a.questionId || !a.response);

      if (invalidAnswer) {
        res
          .status(400)
          .json({ error: "Each answer must include questionId and response." });
        return;
      }

      await assignAnswersToUser(userId, answers);
      res.json({ message: "Answers assigned successfully" });
    } catch (err) {
      console.error("Create question error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.get(
  "/formatted-answers-and-questions/:userId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params["userId"];

      if (!userId) {
        res.status(400).json({ error: "User ID is required." });
        return;
      }

      console.log("[formatted-answers] Incoming request", { userId });

      const user = await getUserById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const formattedAnswers = await getFormattedUserAnswers(userId);

      if (!formattedAnswers) {
        res
          .status(404)
          .json({ error: "User not found or no answers available." });
        return;
      }

      console.log("[formatted-answers] Returning summary", {
        userId,
        length: formattedAnswers.length,
        preview: formattedAnswers.substring(0, 120),
      });

      res.json({ formattedAnswers });
    } catch (err) {
      console.error("Formatted answers and question error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.get(
  "/card-details/:userId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params["userId"];

      if (!userId) {
        res.status(400).json({ error: "User ID is required." });
        return;
      }
      const user = await getUserById(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const thread = await getThreadByEmail(user.email);
      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }

      const formattedAnswers = await getFormattedUserAnswers(userId);

      const instruction = `Generá 4 tarjetas personalizadas en formato JSON siguiendo estrictamente el esquema proporcionado.

Para cada tarjeta:

Tarjeta 1: Cross Roads
- Description: Generá un texto breve y motivador (máx. 20 palabras) que combine una disciplina académica (como física, historia, economía o matemática) con uno de los intereses personales del estudiante. Usá un tono provocador que despierte curiosidad. No expliques. No uses signos de pregunta.
- Prompt: A partir de esa description, generá un prompt que suene como si fuera escrito por el estudiante en primera persona, invitando a explorar, entender o aplicar la relación planteada. El prompt debe derivar explícitamente de la description.

Tarjeta 2: Think Different
- Description: Generá una pregunta provocadora que invite al estudiante a pensar críticamente sobre temas como moral, poder, verdad, dinero, libertad, tecnología, creatividad, ciencia, inteligencia artificial, diseño o conocimiento. Usá un tono que despierte curiosidad pero que sea claro para alguien de la edad indicada en el perfil. No repitas preguntas conocidas. No hables de política partidaria.
- Prompt: A partir de esa description, generá un prompt como si fuera escrito por el estudiante que reflexiona o formula otra pregunta desde un ángulo distinto, profundizando o cambiando la perspectiva.

Tarjeta 3: Builder Mode
- Description: Generá una propuesta corta y concreta (máx. 20 palabras) para que el estudiante desarrolle una habilidad útil o aprenda a usar una herramienta real, vinculada a sus intereses. La propuesta debe sentirse creativa, accionable y relevante para el mundo actual (digital, maker, freelance, artístico o técnico). Evitá lo genérico y el tono escolar. Mostrále algo que podría empezar a hacer hoy.
- Prompt: A partir de esa description, generá un prompt como si fuera escrito por el estudiante solicitando una guía, pasos o recursos para implementar la propuesta concreta.

Tarjeta 4: Surprise Me!
- Description: Generá una propuesta visual o conceptual inesperada que no esté entre los intereses del estudiante, pero que pueda despertar su curiosidad. Evitá cosas comunes o escolares. El tono debe ser misterioso o intrigante, en no más de 20 palabras.
- Prompt: A partir de esa description, generá un prompt como si fuera escrito por el estudiante intrigado por el nuevo tema, expresando su deseo de explorar o experimentar con la propuesta.

Reglas generales:
- El "prompt" siempre debe derivar de la ""description" (no genérico).
- "img_ref" es una sola palabra/categoría relevante para Unsplash.
- Generar contenido distinto cada vez.
- No agregar texto fuera del JSON.
- No usar triple backtick ni bloques de código.

`

      const prompt = `
      Genera las 4 tarjetas siguiendo las intrucciones y el schema definido
---
Perfil del estudiante (incluye edad e intereses personales extraídos de su onboarding):
${formattedAnswers}

---
Estructura de salida (NO copiar literal, usar como plantilla):
{
  "cards": [
    {
      "id": 1,
      "title": "Cross Roads",
      "description": "[Texto único generado para la tarjeta 1 según las instrucciones]",
      "prompt": "[Prompt específico generado para la tarjeta 1]",
      "img_ref": "[Una sola palabra/categoría relevante para Unsplash basada en intereses y tarjeta]"
    },
    {
      "id": 2,
      "title": "Think Different",
      "description": "[Pregunta provocadora única generada para la tarjeta 2]",
      "prompt": "[Prompt específico generado para la tarjeta 2]",
      "img_ref": "[Una sola palabra/categoría relevante para Unsplash basada en intereses y tarjeta]"
    },
    {
      "id": 3,
      "title": "Builder Mode",
      "description": "[Propuesta única generada para la tarjeta 3]",
      "prompt": "[Prompt específico generado para la tarjeta 3]",
      "img_ref": "[Una sola palabra/categoría relevante para Unsplash basada en intereses y tarjeta]"
    },
    {
      "id": 4,
      "title": "Surprise Me!",
      "description": "[Propuesta única generada para la tarjeta 4]",
      "prompt": "[Prompt específico generado para la tarjeta 4]",
      "img_ref": "[Una sola palabra/categoría relevante para Unsplash basada en intereses y tarjeta]"
    }
  ]
}

---

El campo "prompt" de cada tarjeta debe parecer escrito por el propio estudiante, en lenguaje natural y tono personal. No es una instrucción para el modelo, sino un intento de formular una idea, pregunta o búsqueda relacionada con la descripción. Usá las siguientes guías por tipo de tarjeta:

- Cross Roads: pregunta que relacione su interés personal con una disciplina académica, buscando entender la conexión.
- Think Different: reflexión complementaria o pregunta provocadora escrita por el usuario, desde otro ángulo o nivel.
- Builder Mode: búsqueda práctica escrita por el usuario para pedir ayuda técnica o guía concreta para crear lo que dice la descripción.
- Surprise Me!: intención personal de explorar el nuevo tema, escrita como un deseo o curiosidad genuina por probar o entender.

El prompt debe sonar como si el usuario escribiera en primera persona con su interés real en mente.
Los temas de las tarjetas deben ser simples y coherentes con la edad e intereses del estudiante, no incluyas temas complejos o avanzados. Algo que un joven pueda entender y aplicar en su vida cotidiana.

---
⚠️ IMPORTANTE:
- Generá contenido distinto cada vez.
- No uses el texto de ejemplo tal cual, reemplazalo por nuevo contenido coherente con edad e intereses.
- Devolvé SOLO un objeto JSON válido exactamente con la estructura indicada.
- No escribas texto antes o después.
- No uses bloques de código ni “triple backtick”
.`;

      // Llamar al endpoint de chat interno
      const chatResponse = await handleAssistantReplyCardsDetails({
        assistantId: thread.assistantId,
        threadId: thread.threadId,
        userMessage: prompt,
        instruction:instruction
      });

      console.log(chatResponse);
      let cards;

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(chatResponse);
      } catch (err) {
        console.error("Error parsing assistant reply:", chatResponse);
        throw new Error("La respuesta del assistant no es un JSON válido.");
      }
      cards = parsedResponse.cards;

      res.json({ cards });
    } catch (err) {
      console.error("Card details error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      res.status(500).json({ error: errorMessage });
    }
  }
);

export default router;

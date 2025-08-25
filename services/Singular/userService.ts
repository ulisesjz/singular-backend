import { Collection, ObjectId } from "mongodb";
import { ensureConnection } from "../mongoService";
import { User } from "../../types/singular/mongoModels.singular.types";

export async function getUserById(userId: string): Promise<User | null> {
    const db = await ensureConnection();
    const collection: Collection<User> = db.collection('users');
    return collection.findOne({ _id: new ObjectId(userId) });
}

export async function getFormattedUserAnswers(userId: string): Promise<string | null> {
    const db = await ensureConnection();
    const usersCollection: Collection<User> = db.collection('users');
    const questionsCollection = db.collection('question');

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user || !user.answers) {
        return null;
    }

    // Obtener todas las preguntas de una vez
    const questionIds = user.answers.map(answer => new ObjectId(answer.questionId));
    const questions = await questionsCollection.find({ _id: { $in: questionIds } }).toArray();

    // Formatear las respuestas igual que en tu código
    const formattedAnswers = questions
        .map((question) => {
            const answer = user.answers.find(a => a.questionId === question._id.toString());
            if (!answer) return null;
            return `• ${question['title']}\n${answer.response}\n`;
        })
        .filter(Boolean)
        .join('\n');

    return formattedAnswers;
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<void> {
  const db = await ensureConnection();
  const collection: Collection<User> = db.collection('users');
  await collection.updateOne(
    { _id: new ObjectId(userId) }, 
    { $set: updates }
  );
}
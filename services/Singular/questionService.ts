import { Collection, ObjectId } from "mongodb";

import { ensureConnection } from "../mongoService";
import { Question } from "../../types/singular/mongoModels.singular.types";
import { User } from "../../types/singular/mongoModels.singular.types";

export async function createQuestion(question: Question): Promise<ObjectId> {
    const db = await ensureConnection();
    const collection: Collection<Question> = db.collection('question');
    const result = await collection.insertOne({
        ...question,
        createdAt: new Date()
    });
    return result.insertedId;
}

export async function getQuestions(): Promise<Question[]> {
    const db = await ensureConnection();
    const collection: Collection<Question> = db.collection('question');
    return collection.find().sort({ orderNumber: 1 }).toArray();
}

export async function assignAnswersToUser(
    userId: string,
    answers: { questionId: string, response: string }[]
): Promise<void> {
    const db = await ensureConnection();
    const collection: Collection<User> = db.collection('users');

    await collection.updateOne({
        _id: new ObjectId(userId)
    }, {
        $push: {
            answers: {
                $each: answers
            }
        },
        $set: {
            hasCompletedOnboarding: true
        }
    });
    return;
}
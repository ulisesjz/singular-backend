import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { Agent, Thread, ThreadMessage } from '../types/mongoModels.types';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'singularServer';

// Variables globales tipadas
let client: MongoClient | null = null;
let db: Db | null = null;

export async function ensureConnection(): Promise<Db> {
    if (!db) {
        await connectToMongo();
    }
    if (!db) {
        throw new Error('Database connection not available');
    }
    return db;
}

export async function connectToMongo(): Promise<void> {
    try {
        if (db) return; // Already connected

        client = new MongoClient(uri);
        await client.connect();
        db = client.db(dbName);
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

export async function closeMongoConnection(): Promise<void> {
    if (client) {
        await client.close();
        db = null;
        client = null;
        console.log('MongoDB connection closed');
    }
}

// Agent operations
export async function createAgent(phone: string, assistantId: string, vectorStoreId: string): Promise<ObjectId> {
    const db = await ensureConnection();
    const collection: Collection<Agent> = db.collection('agents');
    const result = await collection.insertOne({
        phone,
        assistantId,
        vectorStoreId,
        createdAt: new Date(),
        files: []
    });
    return result.insertedId;
}

export async function getAgentByAssistantId(assistantId: string): Promise<Agent | null> {
    const db = await ensureConnection();
    const collection: Collection<Agent> = db.collection('agents');
    return collection.findOne({ assistantId });
}

export async function getAgentByPhone(phone: string): Promise<Agent | null> {
    const db = await ensureConnection();
    const collection: Collection<Agent> = db.collection('agents');
    return collection.findOne({ phone });
}

export async function addFilesToAgent(assistantId: string, fileIds: string[]): Promise<void> {
    const db = await ensureConnection();
    const collection: Collection<Agent> = db.collection('agents');
    await collection.updateOne(
        { assistantId },
        {
            $push: {
                files: {
                    $each: fileIds.map(fileId => ({ fileId, addedAt: new Date() }))
                }
            }
        }
    );
}

// Thread operations
export async function createThread(assistantId: string, threadId: string, userEmail: string): Promise<ObjectId> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    const result = await collection.insertOne({
        assistantId,
        threadId,
        userEmail,
        createdAt: new Date(),
        messages: [],
        isPendingThread: true,
        name: null
    });
    return result.insertedId;
}

export async function addMessageToThread(
    threadId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
): Promise<void> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    await collection.updateOne(
        { threadId },
        {
            $push: {
                messages: {
                    role,
                    content,
                    timestamp: new Date()
                }
            }
        }
    );
}

export async function getThreadMessages(threadId: string): Promise<ThreadMessage[]> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    const thread = await collection.findOne({ threadId });
    return thread?.messages || [];
}

export async function getThreadByEmail(email: string): Promise<Thread | null> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    return collection.findOne({ userEmail: email, isPendingThread: true });
}

export async function getThreadById(threadId: string): Promise<Thread | null> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    return collection.findOne({ threadId });
}
export async function getThreadByThreadId(threadId: string): Promise<Thread | null> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    return collection.findOne({ threadId });
}

export async function deleteThread(threadId: string): Promise<void> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    await collection.deleteOne({ threadId });
}

export async function updateThreadName(threadId: string, name: string): Promise<void> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    await collection.updateOne({ threadId }, { $set: { name } });
}

export async function updateThreadIsPending(threadId: string, isPendingThread: boolean): Promise<void> {
    const db = await ensureConnection();
    const collection: Collection<Thread> = db.collection('threads');
    await collection.updateOne({ threadId }, { $set: { isPendingThread } });
}

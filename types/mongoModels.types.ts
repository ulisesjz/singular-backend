import { ObjectId } from 'mongodb';

export interface Agent {
    _id?: ObjectId;
    phone: string;
    assistantId: string;
    threadId?: string;
    vectorStoreId: string;
    createdAt: Date;
    files: AgentFile[];
}

export interface AgentFile {
    fileId: string;
    addedAt: Date;
}

export interface Thread {
    _id?: ObjectId;
    assistantId: string;
    threadId: string;
    userEmail: string;
    createdAt: Date;
    messages: ThreadMessage[];
    isPendingThread:Boolean
    name: string | null
}

export interface ThreadMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
} 
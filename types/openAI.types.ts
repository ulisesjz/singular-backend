export interface AssistantResponse {
    assistantId: string;
    vectorStoreId?: string;
}

export interface VectorStore {
    id: string;
    name: string;
}

export interface Assistant {
    id: string;
    name: string | null;
    instructions: string | null;
    model: string;
    tools: Array<{ type: string }>;
    tool_resources?: {
        file_search: {
            vector_store_ids: string[];
        };
    };
}

export interface Thread {
    id: string;
}

export interface File {
    id: string;
    purpose: string;
}

// Tipos para actualización de assistant
export interface AssistantUpdateParams {
    file_ids?: string[];
    tools?: Array<{ type: string }>;
    tool_resources?: {
        file_search: {
            vector_store_ids: string[];
        };
    };
}

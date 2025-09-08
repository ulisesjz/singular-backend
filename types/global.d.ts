declare global {
    namespace NodeJS {
        interface ProcessEnv {
            OPENAI_API_KEY: string;
            PORT?: string;
            MONGODB_URI: string;
            MONGODB_DBNAME: string;
            CLIENT_ORIGIN?: string;
            NODE_ENV: 'development' | 'production' | 'test';
        }
    }
}

export { }; 
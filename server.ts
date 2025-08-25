import express, { Application } from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';

import { connectToMongo, closeMongoConnection } from './services/mongoService';
import agentRoutes from './routes/agent';
import singularRoutes from './routes/singular/singular';
import threadsRoutes from './routes/threads';

dotenv.config();
const app: Application = express();

// Initialize MongoDB connection
connectToMongo().catch(console.error);

const allowedOrigins = [
    process.env.CLIENT_ORIGIN
].filter(Boolean) as string[];

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
    origin: allowedOrigins,
}))

app.use('/agent', agentRoutes);
app.use('/singular', singularRoutes);
app.use('/thread', threadsRoutes);
app.get('/', (req, res) => {
    res.send('Agent service is running. Visit /api-docs for API documentation.');
});

const PORT = process.env.PORT || 3000;

// Graceful shutdown
process.on('SIGINT', async () => {
    await closeMongoConnection();
    process.exit(0);
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

/**
 * Webpack HMR Activation
 */

type ModuleId = string | number;

interface WebpackHotModule {
    hot?: {
        data: any;
        accept(
            dependencies: string[],
            callback?: (updatedDependencies: ModuleId[]) => void,
        ): void;
        accept(dependency: string, callback?: () => void): void;
        accept(errHandler?: (err: Error) => void): void;
        dispose(callback: (data: any) => void): void;
    };
}

declare const module: WebpackHotModule;

if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => server.close());
}
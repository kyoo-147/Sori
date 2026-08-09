import { buildApp } from './app.js';
import { createInMemoryRepositories } from '../storage/memory.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const app = buildApp(createInMemoryRepositories());

await app.listen({ port, host });

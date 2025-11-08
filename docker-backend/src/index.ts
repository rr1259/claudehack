import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { apiRouter } from './routes.js';
import { ensureDemoFilesystem } from './setupDemoFs.js';

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
app.use(cors({
	origin: FRONTEND_ORIGIN,
	methods: ['GET', 'POST', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	credentials: false
}));
app.options('*', cors({
	origin: FRONTEND_ORIGIN,
	methods: ['GET', 'POST', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	credentials: false
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.use('/api', apiRouter);

const port = Number(process.env.API_PORT || 3001);

async function start() {
	await ensureDemoFilesystem();
	app.listen(port, '0.0.0.0', () => {
		console.log(`API listening on http://0.0.0.0:${port}`);
	});
}

start().catch((err) => {
	console.error('Failed to start server', err);
	process.exit(1);
});


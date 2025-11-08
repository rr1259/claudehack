import { Router } from 'express';
import { applyPlan, createPlanFromInstructions, detectGarbage, getCurrentPlan, previewPlan, resetDemoFs, scanDirectory, setCurrentPlan } from './services.js';

export const apiRouter = Router();

apiRouter.get('/filesystem/*?', async (req, res) => {
	try {
		const param0 = (req.params as any)?.[0] as string | undefined;
		const dir = '/' + (param0 || 'demo');
		const tree = await scanDirectory(dir);
		res.json({ ok: true, tree });
	} catch (e: any) {
		res.status(500).json({ ok: false, error: e?.message || 'fs_browse_failed' });
	}
});

apiRouter.post('/scan', async (req, res) => {
	try {
		const dir = String(req.body?.dir || '/demo');
		const tree = await scanDirectory(dir);
		res.json({ ok: true, tree });
	} catch (e: any) {
		res.status(500).json({ ok: false, error: e?.message || 'scan_failed' });
	}
});

apiRouter.post('/organize', async (req, res) => {
	try {
		const instructions = String(req.body?.instructions || '');
		const plan = await createPlanFromInstructions(instructions);
		setCurrentPlan(plan);
		res.json({ ok: true, plan });
	} catch (e: any) {
		res.status(500).json({ ok: false, error: e?.message || 'organize_failed' });
	}
});

apiRouter.post('/preview', async (_req, res) => {
	try {
		const plan = getCurrentPlan();
		const views = await previewPlan(plan);
		res.json({ ok: true, plan, views });
	} catch (e: any) {
		res.status(500).json({ ok: false, error: e?.message || 'preview_failed' });
	}
});

apiRouter.post('/apply', async (_req, res) => {
	try {
		const plan = getCurrentPlan();
		const result = await applyPlan(plan);
		// Clear plan after apply
		setCurrentPlan({ moves: [], deletions: [] });
		res.json({ ok: true, result });
	} catch (e: any) {
		res.status(500).json({ ok: false, error: e?.message || 'apply_failed' });
	}
});

apiRouter.post('/detect-garbage', async (_req, res) => {
	try {
		const suggestions = await detectGarbage();
		res.json({ ok: true, suggestions });
	} catch (e: any) {
		res.status(500).json({ ok: false, error: e?.message || 'detect_failed' });
	}
});

apiRouter.post('/reset', async (_req, res) => {
	try {
		await resetDemoFs();
		setCurrentPlan({ moves: [], deletions: [] });
		res.json({ ok: true });
	} catch (e: any) {
		res.status(500).json({ ok: false, error: e?.message || 'reset_failed' });
	}
});


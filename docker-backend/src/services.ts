import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { tryLlmOrganize } from './agent.js';

export type FileNode = {
	name: string;
	path: string;
	type: 'file' | 'dir';
	size?: number;
	ext?: string;
	children?: FileNode[];
	atimeMs?: number;
	mtimeMs?: number;
};

export type MoveOp = { from: string; to: string; reason: string };
export type DeleteSuggestion = { file: string; reason: string; confidence: 'low' | 'medium' | 'high'; sizeBytes?: number; safeToDelete: boolean };
export type Plan = { moves: MoveOp[]; deletions: DeleteSuggestion[] };

const DEMO_FS_PATH = process.env.DEMO_FS_PATH || path.resolve(process.cwd(), 'data/demo_fs');

let currentPlan: Plan = { moves: [], deletions: [] };

export function getCurrentPlan(): Plan {
	return currentPlan;
}

export function setCurrentPlan(plan: Plan) {
	currentPlan = plan;
}

export async function ensureDir(dir: string) {
	await fse.ensureDir(dir);
}

export async function scanDirectory(relativeDir: string): Promise<FileNode> {
	const root = sanitizePath(relativeDir);
	return await buildTree(root);
}

function sanitizePath(rel: string): string {
	const safeRoot = path.resolve(DEMO_FS_PATH);
	const target = path.resolve(safeRoot, '.' + rel);
	if (!target.startsWith(safeRoot)) {
		throw new Error('Path escapes demo filesystem');
	}
	return target;
}

async function buildTree(absPath: string): Promise<FileNode> {
	const st = await fse.stat(absPath);
	const node: FileNode = {
		name: path.basename(absPath),
		path: toRel(absPath),
		type: st.isDirectory() ? 'dir' : 'file',
		size: st.isFile() ? st.size : undefined,
		atimeMs: st.atimeMs,
		mtimeMs: st.mtimeMs
	};
	if (st.isDirectory()) {
		const entries = await fse.readdir(absPath);
		node.children = [];
		for (const ent of entries) {
			const child = await buildTree(path.join(absPath, ent));
			node.children.push(child);
		}
	} else {
		node.ext = path.extname(absPath).slice(1).toLowerCase();
	}
	return node;
}

function toRel(absPath: string): string {
	const rel = path.relative(DEMO_FS_PATH, absPath);
	return '/' + rel.split(path.sep).join('/');
}

export async function resetDemoFs(): Promise<void> {
	const template = path.resolve(process.cwd(), 'src/filesystem_template');
	await fse.remove(DEMO_FS_PATH);
	await fse.ensureDir(DEMO_FS_PATH);
	await fse.copy(template, DEMO_FS_PATH, { overwrite: true, errorOnExist: false });
}

export async function applyPlan(plan: Plan): Promise<{ moved: number }> {
	let moved = 0;
	for (const m of plan.moves) {
		const fromAbs = sanitizePath(m.from);
		const toAbs = sanitizePath(m.to);
		await fse.ensureDir(path.dirname(toAbs));
		await fse.move(fromAbs, toAbs, { overwrite: false });
		moved++;
	}
	return { moved };
}

export async function previewPlan(plan: Plan): Promise<{ before: FileNode; after: FileNode }> {
	const before = await buildTree(DEMO_FS_PATH);
	// Create a shallow simulation based on path mapping
	const afterPaths = new Map<string, string>();
	for (const m of plan.moves) {
		afterPaths.set(m.from, m.to);
	}
	function mapPath(p: string): string {
		return afterPaths.get(p) || p;
	}
	function cloneNode(n: FileNode): FileNode {
		if (n.type === 'dir') {
			return {
				...n,
				children: (n.children || []).map(cloneNode)
			};
		}
		return { ...n, path: mapPath(n.path) };
	}
	// Note: This does not synthesize new intermediate directories; it's a lightweight view
	const after = cloneNode(before);
	return { before, after };
}

export async function detectGarbage(): Promise<DeleteSuggestion[]> {
	const suggestions: DeleteSuggestion[] = [];
	const now = Date.now();
	const tree = await buildTree(DEMO_FS_PATH);

	const allFiles = flattenFiles(tree);
	const hashToFile: Record<string, string[]> = {};

	for (const file of allFiles) {
		const abs = sanitizePath(file.path);
		const ext = (file.ext || '').toLowerCase();
		const ageDays = file.atimeMs ? Math.floor((now - file.atimeMs) / (1000 * 60 * 60 * 24)) : 0;

		if (['tmp', 'log', 'cache', 'bak', 'old'].includes(ext) || /(^~|\.DS_Store$)/.test(file.name)) {
			suggestions.push({
				file: file.path,
				reason: `Temporary or system artifact (${ext || file.name}), last accessed ${ageDays} days ago`,
				confidence: 'high',
				sizeBytes: file.size,
				safeToDelete: true
			});
			continue;
		}

		if (file.size && file.size > 50 * 1024 * 1024 && ageDays > 90) {
			suggestions.push({
				file: file.path,
				reason: `Large file (${(file.size / (1024 * 1024)).toFixed(1)} MB) rarely accessed (${ageDays} days)`,
				confidence: 'medium',
				sizeBytes: file.size,
				safeToDelete: false
			});
		}

		if (file.size && file.size < 20 * 1024 * 1024) {
			const hash = await hashFile(abs);
			hashToFile[hash] = hashToFile[hash] || [];
			hashToFile[hash].push(file.path);
		}
	}

	for (const files of Object.values(hashToFile)) {
		if (files.length > 1) {
			for (let i = 1; i < files.length; i++) {
				suggestions.push({
					file: files[i],
					reason: `Duplicate of ${files[0]} (same content hash)`,
					confidence: 'high',
					safeToDelete: true
				});
			}
		}
	}

	return suggestions;
}

function flattenFiles(node: FileNode): FileNode[] {
	if (node.type === 'file') return [node];
	return (node.children || []).flatMap(flattenFiles);
}

async function hashFile(absPath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hasher = crypto.createHash('sha1');
		const s = fs.createReadStream(absPath);
		s.on('error', reject);
		s.on('data', (d) => hasher.update(d));
		s.on('end', () => resolve(hasher.digest('hex')));
	});
}

export async function createPlanFromInstructions(instructions: string): Promise<Plan> {
	// Prefer LLM when API key is present; fall back to heuristics otherwise
	const tree = await buildTree(DEMO_FS_PATH);
	const files = flattenFiles(tree);

	const llmPlan = await tryLlmOrganize(files, instructions);
	if (llmPlan) return llmPlan;

	const moves: MoveOp[] = [];
	for (const f of files) {
		const category = decideCategory(f, instructions);
		const target = path.posix.join('/demo', category, f.name);
		if (f.path !== target) {
			moves.push({
				from: f.path,
				to: target,
				reason: `Place in ${category} based on extension and instructions`
			});
		}
	}
	return { moves, deletions: [] };
}

function decideCategory(f: FileNode, instructions: string): string {
	const ext = (f.ext || '').toLowerCase();
	const text = instructions.toLowerCase();

	if (text.includes('by type') || true) {
		if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'java', 'rb'].includes(ext)) return 'Code';
		if (['md', 'txt', 'pdf', 'doc', 'docx'].includes(ext)) return 'Documents';
		if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'Images';
		if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return 'Archives';
		if (['csv', 'json', 'xlsx'].includes(ext)) return 'Data';
	}
	return 'Misc';
}


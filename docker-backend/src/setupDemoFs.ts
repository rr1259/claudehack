import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';

const DEMO_FS_PATH = process.env.DEMO_FS_PATH || path.resolve(process.cwd(), 'data/demo_fs');

export async function ensureDemoFilesystem() {
	const exists = await fse.pathExists(DEMO_FS_PATH);
	if (!exists) {
		await fse.ensureDir(DEMO_FS_PATH);
	}
	const hasContent = (await fse.readdir(DEMO_FS_PATH)).length > 0;
	if (!hasContent) {
		const template = path.resolve(process.cwd(), 'src/filesystem_template');
		await fse.copy(template, DEMO_FS_PATH, { overwrite: true, errorOnExist: false });
	}
}


import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const startMarker = '<!-- umadance:start -->';
const endMarker = '<!-- umadance:end -->';
const checksumKey = 'vs/code/electron-browser/workbench/workbench.html';
const workbenchSegments = ['out', 'vs', 'code', 'electron-browser', 'workbench'];
const overlayFiles = ['uma-overlay.css', 'uma-overlay.js'];
const block = [
	startMarker,
	'<link rel="stylesheet" href="./uma-overlay.css">',
	'<script src="./uma-assets.js"></script>',
	'<script src="./uma-overlay.js"></script>',
	endMarker
].join('\n');

export type OverlayStatus = 'installed' | 'unchanged' | 'removed' | 'unavailable';

export interface OverlayResult {
	status: OverlayStatus;
	workbench: string;
	detail?: string;
}

export function workbenchDirectory(appRoot: string): string {
	return path.join(appRoot, ...workbenchSegments);
}

function checksum(filePath: string): string {
	return createHash('sha256').update(fs.readFileSync(filePath)).digest('base64').replace(/=+$/, '');
}

function copyIfChanged(source: string, target: string): boolean {
	if (fs.existsSync(target) && fs.readFileSync(target).equals(fs.readFileSync(source))) {
		return false;
	}
	fs.copyFileSync(source, target);
	return true;
}

function syncUma(sourceDirectory: string, targetDirectory: string): { changed: boolean; names: string[] } {
	fs.mkdirSync(targetDirectory, { recursive: true });
	const names = fs.readdirSync(sourceDirectory)
		.filter((entry) => entry.toLowerCase().endsWith('.gif'))
		.sort();
	let changed = false;
	for (const entry of fs.readdirSync(targetDirectory)) {
		if (entry.toLowerCase().endsWith('.gif') && !names.includes(entry)) {
			fs.rmSync(path.join(targetDirectory, entry));
			changed = true;
		}
	}
	for (const name of names) {
		if (copyIfChanged(path.join(sourceDirectory, name), path.join(targetDirectory, name))) {
			changed = true;
		}
	}
	return { changed, names };
}

function writeManifest(workbench: string, names: string[]): boolean {
	const manifestPath = path.join(workbench, 'uma-assets.js');
	const manifest = 'window.__umadanceAssets = ' + JSON.stringify(names) + ';\n';
	if (fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, 'utf-8') === manifest) {
		return false;
	}
	fs.writeFileSync(manifestPath, manifest);
	return true;
}

function inject(html: string): string {
	const cleaned = strip(html);
	if (cleaned.includes('</body>')) {
		return cleaned.replace('</body>', block + '\n</body>');
	}
	return cleaned.replace('</html>', block + '\n</html>');
}

function strip(html: string): string {
	return html.replace(new RegExp(startMarker + '[\\s\\S]*?' + endMarker, 'g'), '');
}

function writeChecksum(appRoot: string, htmlPath: string): void {
	const productPath = path.join(appRoot, 'product.json');
	const product = JSON.parse(fs.readFileSync(productPath, 'utf-8'));
	product.checksums = product.checksums ?? {};
	product.checksums[checksumKey] = checksum(htmlPath);
	fs.writeFileSync(productPath, JSON.stringify(product, null, '\t'));
}

export function applyOverlay(appRoot: string, assetRoot: string): OverlayResult {
	const workbench = workbenchDirectory(appRoot);
	const htmlPath = path.join(workbench, 'workbench.html');
	if (!fs.existsSync(htmlPath)) {
		return { status: 'unavailable', workbench, detail: 'workbench.html was not found in ' + workbench };
	}
	try {
		const uma = syncUma(path.join(assetRoot, 'uma'), path.join(workbench, 'uma'));
		let changed = uma.changed;
		if (writeManifest(workbench, uma.names)) {
			changed = true;
		}
		for (const name of overlayFiles) {
			if (copyIfChanged(path.join(assetRoot, 'overlay', name), path.join(workbench, name))) {
				changed = true;
			}
		}
		const html = fs.readFileSync(htmlPath, 'utf-8');
		if (!html.includes(startMarker)) {
			fs.writeFileSync(htmlPath, inject(html));
			changed = true;
		}
		if (changed) {
			writeChecksum(appRoot, htmlPath);
		}
		return { status: changed ? 'installed' : 'unchanged', workbench };
	} catch (error) {
		return { status: 'unavailable', workbench, detail: error instanceof Error ? error.message : String(error) };
	}
}

export function removeOverlay(appRoot: string): OverlayResult {
	const workbench = workbenchDirectory(appRoot);
	const htmlPath = path.join(workbench, 'workbench.html');
	if (!fs.existsSync(htmlPath)) {
		return { status: 'unavailable', workbench, detail: 'workbench.html was not found in ' + workbench };
	}
	try {
		const html = fs.readFileSync(htmlPath, 'utf-8');
		const cleaned = strip(html);
		if (cleaned === html) {
			return { status: 'unchanged', workbench };
		}
		fs.writeFileSync(htmlPath, cleaned);
		writeChecksum(appRoot, htmlPath);
		fs.rmSync(path.join(workbench, 'uma'), { recursive: true, force: true });
		for (const name of [...overlayFiles, 'uma-assets.js']) {
			fs.rmSync(path.join(workbench, name), { force: true });
		}
		return { status: 'removed', workbench };
	} catch (error) {
		return { status: 'unavailable', workbench, detail: error instanceof Error ? error.message : String(error) };
	}
}

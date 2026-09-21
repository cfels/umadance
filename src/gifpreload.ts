import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

export const umaStateKey = 'umadance.floor.state';

export interface UmaAsset {
	name: string;
	label: string;
	filePath: string;
	width: number;
	height: number;
}

export interface UmaPlacement {
	x: number;
	y: number;
	locked: boolean;
}

export interface UmaState {
	placements: Record<string, UmaPlacement>;
	scale: number;
}

export interface UmaDefaults {
	count: number;
	scale: number;
	locked: boolean;
}

export function clamp(value: number, min: number, max: number): number {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
}

export function resolveUmaDirectory(extensionPath: string): string | undefined {
	const candidates = [
		path.join(extensionPath, 'dist', 'uma'),
		path.join(extensionPath, 'src', 'uma')
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

export function readGifSize(filePath: string): { width: number; height: number } {
	const fallback = { width: 240, height: 240 };
	let handle: number | undefined;
	try {
		handle = fs.openSync(filePath, 'r');
		const header = Buffer.alloc(10);
		const bytes = fs.readSync(handle, header, 0, header.length, 0);
		if (bytes < header.length || header.toString('latin1', 0, 3) !== 'GIF') {
			return fallback;
		}
		const width = header.readUInt16LE(6);
		const height = header.readUInt16LE(8);
		if (width < 1 || height < 1) {
			return fallback;
		}
		return { width, height };
	} catch {
		return fallback;
	} finally {
		if (handle !== undefined) {
			fs.closeSync(handle);
		}
	}
}

const umaNames: Record<string, string> = {
	'bakushin-clap.gif': 'Bakushin Clap',
	'dance-machan.gif': 'Machan Dance',
	'dance2-machan.gif': 'Machan Dance 2',
	'gentildona-dance.gif': 'Gentildona Dance',
	'gentildona-dance2.gif': 'Gentildona Dance 2',
	'mambo-brick.gif': 'Mambo Brick',
	'oguri-dance.gif': 'Oguri Dance',
	'operao.gif': 'Operao',
	'satono.gif': 'Satono',
	'stillinlove.gif': 'Still In Love',
	'tachyon-dance.gif': 'Tachyon Dance',
	'tomamo.gif': 'Tomamo'
};

export function umaLabel(fileName: string): string {
	const known = umaNames[fileName.toLowerCase()];
	if (known) {
		return known;
	}
	const words = fileName
		.replace(/\.gif$/i, '')
		.replace(/([a-z])([0-9])/gi, '$1 $2')
		.replace(/([0-9])([a-z])/gi, '$1 $2')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/[-_]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0);
	const label = words
		.map((word) => {
			const lower = /^[A-Z0-9]+$/.test(word) ? word.toLowerCase() : word;
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.join(' ');
	return label.length > 0 ? label : fileName;
}

export function scanUmaAssets(extensionPath: string): UmaAsset[] {
	const directory = resolveUmaDirectory(extensionPath);
	if (!directory) {
		return [];
	}
	const assets: UmaAsset[] = [];
	for (const entry of fs.readdirSync(directory)) {
		if (!entry.toLowerCase().endsWith('.gif')) {
			continue;
		}
		const filePath = path.join(directory, entry);
		const size = readGifSize(filePath);
		assets.push({
			name: entry,
			label: umaLabel(entry),
			filePath,
			width: size.width,
			height: size.height
		});
	}
	assets.sort((left, right) => left.name.localeCompare(right.name));
	return assets;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function normalizeState(raw: unknown, assets: UmaAsset[]): UmaState | undefined {
	if (!isRecord(raw) || !isRecord(raw.placements)) {
		return undefined;
	}
	const known = new Set(assets.map((asset) => asset.name));
	const placements: Record<string, UmaPlacement> = {};
	for (const [name, value] of Object.entries(raw.placements)) {
		if (!known.has(name) || !isRecord(value)) {
			continue;
		}
		const { x, y } = value;
		if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
			continue;
		}
		placements[name] = {
			x: clamp(x, 0, 1),
			y: clamp(y, 0, 1),
			locked: value.locked === true
		};
	}
	return {
		placements,
		scale: typeof raw.scale === 'number' && Number.isFinite(raw.scale) ? clamp(raw.scale, 0.4, 1.6) : 1
	};
}

export function randomSpot(): UmaPlacement {
	return {
		x: 0.04 + Math.random() * 0.92,
		y: 0.04 + Math.random() * 0.92,
		locked: false
	};
}

export function createPlacements(assets: UmaAsset[], defaults: UmaDefaults): Record<string, UmaPlacement> {
	const pool = [...assets];
	for (let index = pool.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(Math.random() * (index + 1));
		const held = pool[index];
		pool[index] = pool[swap];
		pool[swap] = held;
	}
	const wanted = clamp(Math.round(defaults.count), 1, Math.max(assets.length, 1));
	const chosen = pool.slice(0, wanted);
	const columns = Math.max(1, Math.ceil(Math.sqrt(chosen.length)));
	const rows = Math.max(1, Math.ceil(chosen.length / columns));
	const placements: Record<string, UmaPlacement> = {};
	chosen.forEach((asset, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns);
		placements[asset.name] = {
			x: (column + 0.5) / columns,
			y: (row + 0.5) / rows,
			locked: defaults.locked
		};
	});
	return placements;
}

export function createState(assets: UmaAsset[], defaults: UmaDefaults): UmaState {
	return {
		placements: createPlacements(assets, defaults),
		scale: clamp(defaults.scale, 0.4, 1.6)
	};
}

export function loadState(memento: vscode.Memento, assets: UmaAsset[], defaults: UmaDefaults): UmaState {
	const stored = normalizeState(memento.get(umaStateKey), assets);
	if (stored && Object.keys(stored.placements).length > 0) {
		return stored;
	}
	return createState(assets, defaults);
}

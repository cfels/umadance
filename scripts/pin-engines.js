#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'package.json');
const typesPath = path.join(root, 'node_modules', '@types', 'vscode', 'package.json');

function engineFromTypes() {
	if (!fs.existsSync(typesPath)) {
		return undefined;
	}
	const { version } = JSON.parse(fs.readFileSync(typesPath, 'utf-8'));
	const parts = /^(\d+)\.(\d+)\./.exec(version);
	return parts ? parts[1] + '.' + parts[2] + '.0' : undefined;
}

const engine = engineFromTypes() ?? process.env.UMADANCE_VSCODE_ENGINE;
if (!engine) {
	console.log('[umadance] @types/vscode is not installed, leaving engines.vscode untouched');
	process.exit(0);
}

const range = '^' + engine;
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
if (manifest.engines && manifest.engines.vscode === range) {
	console.log('[umadance] engines.vscode already ' + range);
	process.exit(0);
}

manifest.engines = { ...manifest.engines, vscode: range };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('[umadance] engines.vscode -> ' + range);

#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const START_MARKER = '<!-- umadance:start -->';
const END_MARKER = '<!-- umadance:end -->';
const EXTERNAL_FILES = ['uma-overlay.css', 'uma-overlay.js'];
const FONT_FILES = ['momotrust.ttf'];
const WORKBENCH_DIR = ['out', 'vs', 'code', 'electron-browser', 'workbench'];
const CHECKSUM_KEY = 'vs/code/electron-browser/workbench/workbench.html';
const BLOCK = [
	START_MARKER,
	'<link rel="stylesheet" href="./uma-overlay.css">',
	'<script src="./uma-assets.js"></script>',
	'<script src="./uma-overlay.js"></script>',
	END_MARKER
].join('\n');

function arg(name) {
	const index = process.argv.indexOf('--' + name);
	if (index === -1 || index + 1 >= process.argv.length) {
		throw new Error('missing --' + name);
	}
	return process.argv[index + 1];
}

function checksum(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('base64').replace(/=+$/, '');
}

function syncUma(source, target) {
	fs.mkdirSync(target, { recursive: true });
	const names = fs.readdirSync(source).filter((entry) => entry.toLowerCase().endsWith('.gif')).sort();
	for (const entry of fs.readdirSync(target)) {
		if (entry.toLowerCase().endsWith('.gif') && !names.includes(entry)) {
			fs.rmSync(path.join(target, entry));
		}
	}
	for (const name of names) {
		fs.copyFileSync(path.join(source, name), path.join(target, name));
	}
	return names;
}

function inject(html) {
	const cleaned = html.replace(new RegExp(START_MARKER + '[\\s\\S]*?' + END_MARKER, 'g'), '');
	if (cleaned.includes('</body>')) {
		return cleaned.replace('</body>', BLOCK + '\n</body>');
	}
	return cleaned.replace('</html>', BLOCK + '\n</html>');
}

function main() {
	const appDir = arg('app-dir');
	const overlayDir = arg('overlay-dir');
	const umaDir = arg('uma-dir');
	const workbench = path.join(appDir, ...WORKBENCH_DIR);
	const htmlPath = path.join(workbench, 'workbench.html');
	const productPath = path.join(appDir, 'product.json');
	if (!fs.existsSync(htmlPath)) {
		throw new Error('workbench.html not found at ' + htmlPath);
	}
	if (!fs.existsSync(productPath)) {
		throw new Error('product.json not found at ' + productPath);
	}

	const names = syncUma(umaDir, path.join(workbench, 'uma'));
	for (const name of EXTERNAL_FILES) {
		fs.copyFileSync(path.join(overlayDir, name), path.join(workbench, name));
	}
	fs.mkdirSync(path.join(workbench, 'fonts'), { recursive: true });
	for (const name of FONT_FILES) {
		fs.copyFileSync(path.join(overlayDir, 'fonts', name), path.join(workbench, 'fonts', name));
	}
	fs.writeFileSync(path.join(workbench, 'uma-assets.js'), 'window.__umadanceAssets = ' + JSON.stringify(names) + ';\n');
	fs.writeFileSync(htmlPath, inject(fs.readFileSync(htmlPath, 'utf-8')));

	const product = JSON.parse(fs.readFileSync(productPath, 'utf-8'));
	product.checksums = product.checksums || {};
	product.checksums[CHECKSUM_KEY] = checksum(htmlPath);
	fs.writeFileSync(productPath, JSON.stringify(product, null, '\t'));

	console.log('umadance: ' + names.length + ' uma wired into ' + workbench);
}

main();

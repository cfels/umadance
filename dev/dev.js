#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectDir = path.resolve(__dirname, '..');
const devRoot = process.env.UMADANCE_DEV_ROOT || '/tmp/umadance-dev';
const storeRoot = path.dirname(path.dirname(fs.realpathSync('/run/current-system/sw/bin/code')));
const installDir = path.join(devRoot, 'install');
const appDir = path.join(installDir, 'lib', 'vscode', 'resources', 'app');
const launcher = path.join(devRoot, 'code');

function run(command, args) {
	execFileSync(command, args, { stdio: 'inherit' });
}

function removeTree(root) {
	if (!fs.existsSync(root)) {
		return;
	}
	const pending = [root];
	while (pending.length > 0) {
		const dir = pending.pop();
		let entries = [];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch (error) {
			continue;
		}
		try {
			fs.chmodSync(dir, 0o755);
		} catch (error) {
			continue;
		}
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.isSymbolicLink()) {
				pending.push(path.join(dir, entry.name));
			}
		}
	}
	fs.rmSync(root, { recursive: true, force: true });
}

function makeWritable(root) {
	const pending = [root];
	while (pending.length > 0) {
		const dir = pending.pop();
		fs.chmodSync(dir, 0o755);
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory() && !entry.isSymbolicLink()) {
				pending.push(path.join(dir, entry.name));
			}
		}
	}
}

function rewriteLaunchers() {
	for (const rel of ['bin/code', 'bin/.code-wrapped', 'lib/vscode/bin/code']) {
		const file = path.join(installDir, rel);
		if (!fs.existsSync(file)) {
			continue;
		}
		fs.chmodSync(file, 0o755);
		fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').split(storeRoot).join(installDir));
	}
}

function copyInstall() {
	if (fs.existsSync(path.join(installDir, 'lib', 'vscode', 'code'))) {
		return;
	}
	fs.mkdirSync(devRoot, { recursive: true });
	removeTree(installDir);
	run('cp', ['-a', storeRoot, installDir]);
	makeWritable(installDir);
	rewriteLaunchers();
	fs.chmodSync(path.join(appDir, 'out/vs/code/electron-browser/workbench/workbench.html'), 0o644);
	fs.chmodSync(path.join(appDir, 'product.json'), 0o644);
	for (const rel of ['lib/vscode/code', 'lib/vscode/chrome-sandbox', 'lib/vscode/chrome_crashpad_handler']) {
		const file = path.join(installDir, rel);
		if (fs.existsSync(file)) {
			fs.chmodSync(file, 0o755);
		}
	}
}

function apply() {
	run(process.execPath, [
		path.join(projectDir, 'overlay', 'apply.js'),
		'--app-dir', appDir,
		'--overlay-dir', path.join(projectDir, 'overlay'),
		'--uma-dir', path.join(projectDir, 'src', 'uma')
	]);
	fs.writeFileSync(launcher, '#!/usr/bin/env bash\nexec "' + path.join(installDir, 'bin', 'code') + '" "$@"\n', { mode: 0o755 });
}

function watch() {
	let timer = null;
	const trigger = () => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			try {
				apply();
				console.log('[umadance] synced - press Ctrl+R in the dev window');
			} catch (error) {
				console.error('[umadance] sync failed: ' + error.message);
			}
		}, 150);
	};
	for (const dir of [path.join(projectDir, 'overlay'), path.join(projectDir, 'src', 'uma')]) {
		fs.watch(dir, trigger);
	}
	console.log('[umadance] watching overlay/ and src/uma/');
}

const mode = process.argv[2] ?? 'setup';
if (mode === 'setup' || mode === 'sync' || mode === 'watch') {
	copyInstall();
	apply();
}
if (mode === 'setup') {
	console.log('[umadance] dev install ready: ' + installDir);
	console.log('[umadance] launch: ' + launcher + ' --user-data-dir=' + path.join(devRoot, 'profile'));
}
if (mode === 'sync') {
	console.log('[umadance] synced - press Ctrl+R in the dev window');
}
if (mode === 'watch') {
	watch();
}

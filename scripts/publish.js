#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const extensionId = manifest.publisher + '.' + manifest.name;
const vsix = path.join(root, manifest.name + '-' + manifest.version + '.vsix');
const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';
const envFile = path.join(root, '.env');

function loadEnvFile() {
	if (!fs.existsSync(envFile)) {
		return;
	}
	for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match) {
			continue;
		}
		let value = match[2];
		if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
			value = value.slice(1, -1);
		}
		if (value.length > 0 && process.env[match[1]] === undefined) {
			process.env[match[1]] = value;
		}
	}
}

const stores = {
	'--marketplace': {
		label: 'VS Code Marketplace',
		token: 'VSCE_PAT',
		url: 'https://marketplace.visualstudio.com/items?itemName=' + extensionId,
		publish: () => run(['x', '@vscode/vsce', 'publish', '--packagePath', vsix])
	},
	'--ovsx': {
		label: 'Open VSX',
		token: 'OVSX_PAT',
		url: 'https://open-vsx.org/extension/' + manifest.publisher + '/' + manifest.name,
		publish: () => run(['x', 'ovsx', 'publish', vsix])
	}
};

const args = process.argv.slice(2);
const otherFlags = ['--dry-run', '--create-namespace'];
const dryRun = args.includes('--dry-run');
const createNamespace = args.includes('--create-namespace');
const requested = args.filter((arg) => arg in stores);
const targets = requested.length > 0 ? requested : Object.keys(stores);

function run(bunArgs) {
	execFileSync(bun, bunArgs, { cwd: root, stdio: 'inherit' });
}

function runCaptured(bunArgs) {
	try {
		const stdout = execFileSync(bun, bunArgs, { cwd: root, encoding: 'utf-8', stdio: ['inherit', 'pipe', 'pipe'] });
		if (stdout.trim().length > 0) {
			console.log(stdout.trim());
		}
		return { ok: true, output: stdout };
	} catch (error) {
		const stdout = String(error.stdout ?? '');
		const stderr = String(error.stderr ?? '');
		if (stdout.trim().length > 0) {
			console.log(stdout.trim());
		}
		if (stderr.trim().length > 0) {
			console.error(stderr.trim());
		}
		return { ok: false, output: stdout + stderr };
	}
}

function unknownTargets() {
	return args.filter((arg) => arg.startsWith('--') && !(arg in stores) && !otherFlags.includes(arg));
}

function missingTokens() {
	return [...new Set(targets.map((target) => stores[target]?.token).filter((token) => token && !process.env[token]))];
}

function createOvsxNamespace() {
	if (!process.env.OVSX_PAT) {
		throw new Error('missing token OVSX_PAT - put it in ' + envFile);
	}
	console.log('[umadance] creating Open VSX namespace ' + manifest.publisher);
	const result = runCaptured(['x', 'ovsx', 'create-namespace', manifest.publisher]);
	if (result.ok) {
		console.log('[umadance] namespace ' + manifest.publisher + ' is ready');
		return;
	}
	if (/already exists/i.test(result.output)) {
		console.log('[umadance] namespace ' + manifest.publisher + ' already exists');
		return;
	}
	throw new Error('could not create the Open VSX namespace ' + manifest.publisher);
}

function build() {
	run(['run', 'pin-engines']);
	run(['run', 'package']);
	run(['x', '@vscode/vsce', 'package', '--no-dependencies']);
	if (!fs.existsSync(vsix)) {
		throw new Error('packaging did not produce ' + path.basename(vsix));
	}
}

function main() {
	if (createNamespace) {
		createOvsxNamespace();
		return;
	}
	const unknown = unknownTargets();
	if (unknown.length > 0) {
		throw new Error('unknown target ' + unknown.join(' ') + ' - use --marketplace and/or --ovsx');
	}
	const missing = missingTokens();
	if (!dryRun && missing.length > 0) {
		throw new Error('missing token ' + missing.join(', ') + ' - put it in ' + envFile + ' or export it, or publish one store at a time');
	}

	build();
	console.log('[umadance] built ' + path.basename(vsix) + ' (engines.vscode ' + manifest.engines.vscode + ')');
	if (dryRun) {
		for (const target of targets) {
			console.log('[umadance] dry run: would publish to ' + stores[target].label);
		}
		return;
	}

	const failed = [];
	for (const target of targets) {
		const store = stores[target];
		console.log('[umadance] publishing ' + extensionId + ' ' + manifest.version + ' to ' + store.label);
		try {
			store.publish();
			console.log('[umadance] live: ' + store.url);
		} catch (error) {
			failed.push(store.label);
			console.error('[umadance] ' + store.label + ' failed: ' + (error instanceof Error ? error.message : String(error)));
			if (target === '--ovsx') {
				console.error('[umadance] hint: if that says "Unknown publisher", run `bun run namespace:ovsx` once and retry');
			}
		}
	}
	if (failed.length > 0) {
		throw new Error('failed to publish to ' + failed.join(', '));
	}
	console.log('[umadance] ' + extensionId + ' ' + manifest.version + ' is on every requested store');
}

try {
	loadEnvFile();
	main();
} catch (error) {
	console.error('[umadance] ' + (error instanceof Error ? error.message : String(error)));
	process.exit(1);
}

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function copyUmaAssets() {
	const from = path.join(__dirname, 'src', 'uma');
	if (!fs.existsSync(from)) {
		return;
	}
	const to = path.join(__dirname, 'dist', 'uma');
	fs.mkdirSync(to, { recursive: true });
	let copied = 0;
	for (const entry of fs.readdirSync(from)) {
		if (!entry.toLowerCase().endsWith('.gif')) {
			continue;
		}
		const source = path.join(from, entry);
		const target = path.join(to, entry);
		const sourceStat = fs.statSync(source);
		if (fs.existsSync(target)) {
			const targetStat = fs.statSync(target);
			if (targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
				continue;
			}
		}
		fs.copyFileSync(source, target);
		copied += 1;
	}
	if (copied > 0) {
		console.log(`[uma] copied ${copied} gif(s) to dist/uma`);
	}
}

function copyOverlayAssets() {
	const from = path.join(__dirname, 'overlay');
	if (!fs.existsSync(from)) {
		return;
	}
	const to = path.join(__dirname, 'dist', 'overlay');
	fs.mkdirSync(to, { recursive: true });
	for (const entry of fs.readdirSync(from)) {
		if (!entry.endsWith('.js') && !entry.endsWith('.css')) {
			continue;
		}
		if (entry === 'apply.js') {
			continue;
		}
		fs.copyFileSync(path.join(from, entry), path.join(to, entry));
	}
	const fontFrom = path.join(from, 'fonts');
	if (fs.existsSync(fontFrom)) {
		const fontTo = path.join(to, 'fonts');
		fs.mkdirSync(fontTo, { recursive: true });
		for (const entry of fs.readdirSync(fontFrom)) {
			const lower = entry.toLowerCase();
			if (lower.endsWith('.woff2') || lower.endsWith('.ttf')) {
				fs.copyFileSync(path.join(fontFrom, entry), path.join(fontTo, entry));
			}
		}
	}
}

const umaAssetsPlugin = {
	name: 'uma-assets',
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length === 0) {
				copyUmaAssets();
				copyOverlayAssets();
			}
		});
	},
};

const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			umaAssetsPlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});

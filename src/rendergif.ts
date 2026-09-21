import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import {
	clamp,
	createState,
	loadState,
	normalizeState,
	randomSpot,
	resolveUmaDirectory,
	scanUmaAssets,
	type UmaAsset,
	type UmaDefaults,
	type UmaPlacement,
	type UmaState,
	umaStateKey
} from './gifpreload';

export const danceFloorViewType = 'umadance.floor';
const panelTitle = 'Uma Dance';
const saveDelayMs = 400;
const missingUmasMessage = 'it seems like some gifs might be missing.';

export interface DanceFloorOptions {
	defaults: () => UmaDefaults;
	onStateChanged?: (state: UmaState) => void;
}

export class DanceFloor {
	private readonly context: vscode.ExtensionContext;
	private readonly options: DanceFloorOptions;
	private assets: UmaAsset[];
	private state: UmaState;
	private panel: vscode.WebviewPanel | undefined;
	private saveTimer: NodeJS.Timeout | undefined;

	constructor(context: vscode.ExtensionContext, options: DanceFloorOptions) {
		this.context = context;
		this.options = options;
		this.assets = scanUmaAssets(context.extensionPath);
		this.state = loadState(context.globalState, this.assets, options.defaults());
	}

	get currentState(): UmaState {
		return this.state;
	}

	show(): void {
		const open = this.panel;
		if (open) {
			open.reveal(open.viewColumn);
			return;
		}
		this.assets = scanUmaAssets(this.context.extensionPath);
		if (this.assets.length === 0) {
			void vscode.window.showWarningMessage(missingUmasMessage);
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			danceFloorViewType,
			panelTitle,
			vscode.ViewColumn.Beside,
			this.viewOptions()
		);
		this.bind(panel);
	}

	adopt(panel: vscode.WebviewPanel): void {
		this.assets = scanUmaAssets(this.context.extensionPath);
		if (this.assets.length === 0) {
			panel.dispose();
			return;
		}
		panel.title = panelTitle;
		panel.webview.options = this.viewOptions();
		this.bind(panel);
	}

	private viewOptions(): vscode.WebviewPanelOptions & vscode.WebviewOptions {
		const directory = resolveUmaDirectory(this.context.extensionPath);
		return {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: directory ? [vscode.Uri.file(directory)] : []
		};
	}

	private bind(panel: vscode.WebviewPanel): void {
		panel.webview.html = renderHtml(panel.webview, this.assets, this.state);
		panel.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message));
		panel.onDidDispose(() => {
			this.panel = undefined;
			this.flush(true);
		});
		this.panel = panel;
	}

	hide(): void {
		this.flush(true);
		this.panel?.dispose();
	}

	lockAll(locked: boolean): void {
		const placements: Record<string, UmaPlacement> = {};
		for (const [name, placement] of Object.entries(this.state.placements)) {
			placements[name] = { x: placement.x, y: placement.y, locked };
		}
		this.state = { placements, scale: this.state.scale };
		this.flush();
		this.postState();
	}

	toggleLockAll(): void {
		const placements = Object.values(this.state.placements);
		const allLocked = placements.length > 0 && placements.every((placement) => placement.locked);
		this.lockAll(!allLocked);
	}

	scatter(): void {
		const placements: Record<string, UmaPlacement> = {};
		for (const [name, placement] of Object.entries(this.state.placements)) {
			if (placement.locked) {
				placements[name] = placement;
				continue;
			}
			const spot = randomSpot();
			placements[name] = { x: spot.x, y: spot.y, locked: false };
		}
		this.state = { placements, scale: this.state.scale };
		this.flush();
		this.postState();
	}

	async reset(): Promise<void> {
		this.assets = scanUmaAssets(this.context.extensionPath);
		if (this.assets.length === 0) {
			void vscode.window.showWarningMessage(missingUmasMessage);
			return;
		}
		this.state = createState(this.assets, this.options.defaults());
		await this.persist();
		this.render();
		this.options.onStateChanged?.(this.state);
	}

	dispose(): void {
		this.flush(true);
		this.panel?.dispose();
		this.panel = undefined;
	}

	private handleMessage(message: unknown): void {
		if (typeof message !== 'object' || message === null) {
			return;
		}
		const data = message as Record<string, unknown>;
		if (data.type === 'persist') {
			const incoming = normalizeState(data.state, this.assets);
			if (!incoming) {
				return;
			}
			this.state = {
				placements: { ...this.state.placements, ...incoming.placements },
				scale: incoming.scale
			};
			this.flush();
			return;
		}
		if (data.type !== 'command') {
			return;
		}
		switch (data.action) {
			case 'scatter':
				this.scatter();
				break;
			case 'lockAll':
				this.lockAll(true);
				break;
			case 'unlockAll':
				this.lockAll(false);
				break;
			case 'reset':
				void this.reset();
				break;
			default:
				break;
		}
	}

	private render(): void {
		const panel = this.panel;
		if (panel) {
			panel.webview.html = renderHtml(panel.webview, this.assets, this.state);
		}
	}

	private postState(): void {
		void this.panel?.webview.postMessage({ type: 'state', state: this.state });
	}

	private flush(immediate = false): void {
		this.options.onStateChanged?.(this.state);
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = undefined;
		}
		if (immediate) {
			void this.persist();
			return;
		}
		this.saveTimer = setTimeout(() => {
			this.saveTimer = undefined;
			void this.persist();
		}, saveDelayMs);
	}

	private async persist(): Promise<void> {
		await this.context.globalState.update(umaStateKey, this.state);
	}
}

export function renderHtml(webview: vscode.Webview, assets: UmaAsset[], state: UmaState): string {
	const nonce = randomBytes(16).toString('hex');
	const payload = JSON.stringify({
		assets: assets.map((asset) => ({
			name: asset.name,
			label: asset.label,
			uri: webview.asWebviewUri(vscode.Uri.file(asset.filePath)).toString(),
			width: asset.width,
			height: asset.height
		})),
		state: {
			placements: state.placements,
			scale: clamp(state.scale, 0.4, 1.6)
		}
	}).replace(/</g, '\\u003c');
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} data:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`
	].join('; ');
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Uma Dance</title>
<style>
html, body {
	height: 100%;
	margin: 0;
	padding: 0;
	overflow: hidden;
	background: var(--vscode-editor-background);
	color: var(--vscode-editor-foreground);
	font-family: var(--vscode-font-family);
	font-size: 11px;
}
#floor {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	left: 0;
	overflow: hidden;
}
.uma {
	position: absolute;
	left: 0;
	top: 0;
	width: 140px;
	height: 140px;
	transform: translate(-50%, -50%);
	cursor: grab;
	touch-action: none;
}
.uma.dragging {
	cursor: grabbing;
	z-index: 5;
}
.uma.locked {
	cursor: default;
}
.uma:focus-visible {
	outline: 1px solid var(--vscode-focusBorder);
	border-radius: 6px;
}
.uma img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
	pointer-events: none;
	user-select: none;
	-webkit-user-drag: none;
}
.uma .tag {
	position: absolute;
	left: 50%;
	bottom: -16px;
	transform: translateX(-50%);
	padding: 1px 6px;
	border-radius: 999px;
	background: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
	opacity: 0;
	pointer-events: none;
	white-space: nowrap;
	transition: opacity 120ms ease-in-out;
}
.uma:hover .tag, .uma:focus-visible .tag {
	opacity: 1;
}
</style>
</head>
<body>
<main id="floor"></main>
<script nonce="${nonce}" type="application/json" id="umaData">${payload}</script>
<script nonce="${nonce}">
(function () {
	var api = acquireVsCodeApi();
	var data = JSON.parse(document.getElementById('umaData').textContent);
	var assets = data.assets;
	var state = data.state;
	var floor = document.getElementById('floor');
	var items = [];

	function clamp(value, min, max) {
		if (value < min) { return min; }
		if (value > max) { return max; }
		return value;
	}

	function randomSpot() {
		return {
			x: 0.04 + Math.random() * 0.92,
			y: 0.04 + Math.random() * 0.92
		};
	}

	function metrics(asset) {
		var box = floor.getBoundingClientRect();
		var ratio = asset.width / asset.height;
		if (!isFinite(ratio) || ratio <= 0) { ratio = 1; }
		var heightBudget = Math.min(box.height * 0.42, 200) * state.scale;
		var widthBudget = Math.max(90, box.width * 0.3) * (0.65 + state.scale * 0.35);
		var height = Math.max(56, heightBudget);
		var width = height * ratio;
		if (width > widthBudget) {
			width = widthBudget;
			height = width / ratio;
		}
		return { width: Math.max(56, width), height: Math.max(56, height) };
	}

	function place(item) {
		var box = floor.getBoundingClientRect();
		var halfWidth = item.size.width / 2 + 6;
		var halfHeight = item.size.height / 2 + 6;
		var left = clamp(item.x * box.width, halfWidth, Math.max(halfWidth, box.width - halfWidth));
		var top = clamp(item.y * box.height, halfHeight, Math.max(halfHeight, box.height - halfHeight));
		item.el.style.left = left + 'px';
		item.el.style.top = top + 'px';
		item.img.style.transform = 'scaleX(' + (item.x >= item.facing ? 1 : -1) + ')';
		item.facing = item.x;
	}

	function relayout() {
		items.forEach(function (item) {
			item.size = metrics(item.asset);
			item.el.style.width = item.size.width + 'px';
			item.el.style.height = item.size.height + 'px';
			place(item);
		});
	}

	function setLocked(item, locked) {
		item.locked = locked;
		item.el.classList.toggle('locked', locked);
		item.el.setAttribute('aria-label', item.asset.label + (locked ? ', locked in place' : ', free to move'));
	}

	function persist() {
		var placements = {};
		items.forEach(function (item) {
			placements[item.asset.name] = { x: item.x, y: item.y, locked: item.locked };
		});
		api.postMessage({
			type: 'persist',
			state: { placements: placements, scale: state.scale }
		});
	}

	function bindPointer(item) {
		var offsetX = 0;
		var offsetY = 0;

		item.el.addEventListener('pointerdown', function (event) {
			if (item.locked || event.button !== 0) { return; }
			var rect = item.el.getBoundingClientRect();
			offsetX = event.clientX - (rect.left + rect.width / 2);
			offsetY = event.clientY - (rect.top + rect.height / 2);
			item.dragging = true;
			item.el.classList.add('dragging');
			item.el.setPointerCapture(event.pointerId);
			event.preventDefault();
		});

		item.el.addEventListener('pointermove', function (event) {
			if (!item.dragging) { return; }
			var box = floor.getBoundingClientRect();
			item.x = clamp((event.clientX - offsetX - box.left) / box.width, 0, 1);
			item.y = clamp((event.clientY - offsetY - box.top) / box.height, 0, 1);
			place(item);
		});

		function endDrag(event) {
			if (!item.dragging) { return; }
			item.dragging = false;
			item.el.classList.remove('dragging');
			if (item.el.hasPointerCapture(event.pointerId)) {
				item.el.releasePointerCapture(event.pointerId);
			}
			persist();
		}

		item.el.addEventListener('pointerup', endDrag);
		item.el.addEventListener('pointercancel', endDrag);

		item.el.addEventListener('contextmenu', function (event) {
			event.preventDefault();
			event.stopPropagation();
			setLocked(item, !item.locked);
			persist();
		});

		item.el.addEventListener('dblclick', function () {
			setLocked(item, !item.locked);
			persist();
		});
	}

	function bindKeyboard(item) {
		item.el.addEventListener('keydown', function (event) {
			var step = event.shiftKey ? 0.06 : 0.02;
			var arrow = event.key.indexOf('Arrow') === 0;
			if (arrow && item.locked) { return; }
			if (arrow) {
				if (event.key === 'ArrowLeft') { item.x = clamp(item.x - step, 0, 1); }
				if (event.key === 'ArrowRight') { item.x = clamp(item.x + step, 0, 1); }
				if (event.key === 'ArrowUp') { item.y = clamp(item.y - step, 0, 1); }
				if (event.key === 'ArrowDown') { item.y = clamp(item.y + step, 0, 1); }
				place(item);
				persist();
				event.preventDefault();
				return;
			}
			if (event.key === 'l' || event.key === 'L') {
				setLocked(item, !item.locked);
				persist();
				event.preventDefault();
			}
		});
	}

	function createItem(asset) {
		var placement = state.placements[asset.name] || randomSpot();
		var el = document.createElement('div');
		el.className = 'uma';
		el.tabIndex = 0;
		el.setAttribute('role', 'button');
		el.title = asset.label + ' - drag to move, right-click to lock in place or set free';
		var img = document.createElement('img');
		img.src = asset.uri;
		img.alt = asset.label;
		img.draggable = false;
		var tag = document.createElement('span');
		tag.className = 'tag';
		tag.textContent = asset.label;
		el.appendChild(img);
		el.appendChild(tag);
		var item = {
			asset: asset,
			el: el,
			img: img,
			size: { width: 0, height: 0 },
			x: placement.x,
			y: placement.y,
			facing: placement.x,
			locked: placement.locked === true,
			dragging: false
		};
		setLocked(item, item.locked);
		bindPointer(item);
		bindKeyboard(item);
		floor.appendChild(el);
		items.push(item);
		return item;
	}

	function applyState(next) {
		if (next.placements) { state.placements = next.placements; }
		if (typeof next.scale === 'number') { state.scale = next.scale; }
		items.forEach(function (item) {
			var placement = state.placements[item.asset.name];
			if (!placement) { return; }
			item.x = placement.x;
			item.y = placement.y;
			setLocked(item, placement.locked === true);
		});
		relayout();
	}

	window.addEventListener('message', function (event) {
		var message = event.data;
		if (message && message.type === 'state' && message.state) {
			applyState(message.state);
		}
	});
	window.addEventListener('resize', function () {
		relayout();
	});
	floor.addEventListener('contextmenu', function (event) {
		event.preventDefault();
	});

	assets.forEach(function (asset) {
		if (state.placements[asset.name]) {
			createItem(asset);
		}
	});
	relayout();
})();
</script>
</body>
</html>`;
}

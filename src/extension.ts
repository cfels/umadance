import * as path from 'path';
import * as vscode from 'vscode';
import type { UmaDefaults, UmaState } from './gifpreload';
import { DanceFloor, danceFloorViewType } from './rendergif';
import { applyOverlay, removeOverlay, type OverlayResult } from './overlaypatch';

let statusBar: vscode.StatusBarItem | undefined;

async function runOverlayAction(result: OverlayResult): Promise<void> {
	const workbench = result.workbench;
	if (result.status === 'unavailable') {
		const answer = await vscode.window.showWarningMessage(
			'Uma Dance: this VS Code install is not writable, so the uma cannot float over the window (' + (result.detail ?? 'unknown error') + '). A per-user VS Code install works; system packages and read-only installs do not.',
			'Copy path'
		);
		if (answer === 'Copy path') {
			await vscode.env.clipboard.writeText(workbench);
		}
		return;
	}
	if (result.status === 'removed') {
		void vscode.window.showInformationMessage('Uma Dance: the uma overlay was removed. Reload the window to finish.');
		return;
	}
	if (result.status !== 'installed') {
		return;
	}
	const choice = await vscode.window.showInformationMessage(
		'Uma Dance: the uma are now over this window. Reload to let them out.',
		'Reload Window'
	);
	if (choice === 'Reload Window') {
		await vscode.commands.executeCommand('workbench.action.reloadWindow');
	}
}

function readDefaults(): UmaDefaults {
	const configuration = vscode.workspace.getConfiguration('umadance');
	return {
		count: configuration.get<number>('umaCount', 6),
		scale: configuration.get<number>('scale', 1),
		locked: configuration.get<boolean>('startLocked', false)
	};
}

function updateStatusBar(state: UmaState): void {
	const item = statusBar;
	if (!item) {
		return;
	}
	const placements = Object.values(state.placements);
	const locked = placements.filter((placement) => placement.locked).length;
	if (placements.length === 0) {
		item.text = '$(heart) uma dance';
		item.tooltip = 'Uma Dance: nobody is out yet. Click to bring out the uma.';
		item.command = 'umadance.open';
		return;
	}
	item.command = 'umadance.toggleLock';
	if (locked === placements.length) {
		item.text = '$(lock) ' + placements.length + ' uma locked in place';
		item.tooltip = 'Uma Dance: every uma is locked in place. Click to unlock them.';
		return;
	}
	if (locked === 0) {
		item.text = '$(unlock) ' + placements.length + ' uma free to move';
		item.tooltip = 'Uma Dance: ' + placements.length + ' uma are free to move. Click to lock them all in place.';
		return;
	}
	item.text = '$(lock) ' + locked + ' of ' + placements.length + ' uma locked';
	item.tooltip = 'Uma Dance: ' + locked + ' of ' + placements.length + ' uma are locked in place. Click to lock them all.';
}

export function activate(context: vscode.ExtensionContext): void {
	const assetRoot = path.join(context.extensionPath, 'dist');
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

	void runOverlayAction(applyOverlay(vscode.env.appRoot, assetRoot));

	statusBar = status;
	status.command = 'umadance.toggleLock';
	status.show();

	const floor = new DanceFloor(context, {
		defaults: readDefaults,
		onStateChanged: updateStatusBar
	});

	updateStatusBar(floor.currentState);

	context.subscriptions.push(
		status,
		vscode.window.registerWebviewPanelSerializer(danceFloorViewType, {
			async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
				floor.adopt(panel);
			}
		}),
		vscode.commands.registerCommand('umadance.open', () => {
			floor.show();
		}),
		vscode.commands.registerCommand('umadance.close', () => {
			floor.hide();
		}),
		vscode.commands.registerCommand('umadance.scatter', () => {
			floor.scatter();
		}),
		vscode.commands.registerCommand('umadance.toggleLock', () => {
			floor.toggleLockAll();
		}),
		vscode.commands.registerCommand('umadance.reset', async () => {
			await floor.reset();
			floor.show();
		}),
		vscode.commands.registerCommand('umadance.installOverlay', async () => {
			await runOverlayAction(applyOverlay(vscode.env.appRoot, assetRoot));
		}),
		vscode.commands.registerCommand('umadance.removeOverlay', async () => {
			await runOverlayAction(removeOverlay(vscode.env.appRoot));
		}),
		{ dispose: () => floor.dispose() }
	);
}

export function deactivate(): void {}

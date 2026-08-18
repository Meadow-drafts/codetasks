import * as vscode from 'vscode';
import { scanWorkspace } from './scanner/taskScanner';

export async function activate(context: vscode.ExtensionContext) {
	console.log('CodeTasks is now active!');

	const tasks = await scanWorkspace();

	console.log(`CodeTasks found ${tasks.length} tasks.`);

	vscode.window.showInformationMessage(
		`CodeTasks found ${tasks.length} task(s) in this workspace.`
	);
}

export function deactivate() {}
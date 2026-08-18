import * as vscode from 'vscode';
import { scanWorkspace } from './scanner/taskScanner';
import { TaskStore } from './store/taskStore';
import { TaskTreeProvider } from './providers/taskTreeProvider';

export async function activate(context: vscode.ExtensionContext) {
	console.log('CodeTasks is now active!');

	const taskStore = new TaskStore();

	const tasks = await scanWorkspace();

	taskStore.setTasks(tasks);

	console.log(
		`CodeTasks found ${taskStore.getTaskCount()} task(s).`
	);

	const taskTreeProvider = new TaskTreeProvider(taskStore);

	vscode.window.registerTreeDataProvider(
		'codetasks.taskView',
		taskTreeProvider
	);

	const openTaskCommand = vscode.commands.registerCommand(
		'codetasks.openTask',
		async (task) => {
			if (!task) {
				return;
			}

			const document = await vscode.workspace.openTextDocument(
				task.filePath
			);

			const editor = await vscode.window.showTextDocument(document);

			const position = new vscode.Position(task.line, 0);

			editor.selection = new vscode.Selection(
				position,
				position
			);

			editor.revealRange(
				new vscode.Range(position, position),
				vscode.TextEditorRevealType.InCenter
			);
		}
	);

	context.subscriptions.push(openTaskCommand);
}

export function deactivate() {}
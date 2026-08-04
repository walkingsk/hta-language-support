const vscode = require('vscode');

function activate(context) {
	const disposable = vscode.commands.registerCommand('hta.toggleComment', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'hta') {
			return;
		}

		const document = editor.document;
		const offset = document.offsetAt(editor.selection.active);
		const region = findRegion(document, offset);

		if (region === 'vbscript') {
			await toggleLineComment(editor, affectedLines(editor), "'");
			return;
		}

		if (region === 'css') {
			if (editor.selection.isEmpty) {
				const line = document.lineAt(editor.selection.active.line);
				const leading = /^\s*/.exec(line.text)[0];
				const range = new vscode.Range(line.lineNumber, leading.length, line.lineNumber, line.text.length);
				await toggleBlockComment(editor, range, '/*', '*/');
			} else {
				await toggleBlockComment(editor, new vscode.Range(editor.selection.start, editor.selection.end), '/*', '*/');
			}
			return;
		}

		if (region === 'javascript') {
			if (editor.selection.isEmpty) {
				await toggleLineComment(editor, [document.lineAt(editor.selection.active.line)], '//');
			} else {
				await toggleBlockComment(editor, new vscode.Range(editor.selection.start, editor.selection.end), '/*', '*/');
			}
			return;
		}

		if (editor.selection.isEmpty) {
			const line = document.lineAt(editor.selection.active.line);
			const leading = /^\s*/.exec(line.text)[0];
			const range = new vscode.Range(line.lineNumber, leading.length, line.lineNumber, line.text.length);
			await toggleBlockComment(editor, range, '<!--', '-->');
		} else {
			await toggleBlockComment(editor, new vscode.Range(editor.selection.start, editor.selection.end), '<!--', '-->');
		}
	});

	context.subscriptions.push(disposable);
}

function deactivate() {}

function findRegion(document, offset) {
	const text = document.getText();

	const scriptPattern = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
	let match;
	while ((match = scriptPattern.exec(text)) !== null) {
		if (match.index <= offset && offset < scriptPattern.lastIndex) {
			if (/language\s*=\s*["']?\s*vbscript["']?/i.test(match[0]) || /type\s*=\s*["']?\s*text\/vbscript["']?/i.test(match[0])) {
				return 'vbscript';
			}
			return 'javascript';
		}
	}

	const stylePattern = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
	while ((match = stylePattern.exec(text)) !== null) {
		if (match.index <= offset && offset < stylePattern.lastIndex) {
			return 'css';
		}
	}

	return 'html';
}

function affectedLines(editor) {
	const document = editor.document;
	const lines = [];
	for (let i = editor.selection.start.line; i <= editor.selection.end.line; i++) {
		lines.push(document.lineAt(i));
	}
	return lines;
}

async function toggleLineComment(editor, lines, token) {
	const document = editor.document;
	const spaced = token + ' ';
	const edits = [];

	for (const line of lines) {
		const text = line.text;
		const leading = /^\s*/.exec(text)[0];
		const rest = text.slice(leading.length);

		let newRest;
		if (rest.startsWith(spaced)) {
			newRest = rest.slice(spaced.length);
		} else if (rest.startsWith(token)) {
			newRest = rest.slice(token.length);
		} else {
			newRest = spaced + rest;
		}

		edits.push(vscode.TextEdit.replace(line.range, leading + newRest));
	}

	const edit = new vscode.WorkspaceEdit();
	edit.set(document.uri, edits);
	await vscode.workspace.applyEdit(edit);
}

async function toggleBlockComment(editor, range, openToken, closeToken) {
	const document = editor.document;
	const text = document.getText(range);

	const spacedOpen = openToken + ' ';
	const spacedClose = ' ' + closeToken;

	let newText;
	let prefixLength = 0;

	if (text.startsWith(spacedOpen) && text.endsWith(spacedClose)) {
		newText = text.slice(spacedOpen.length, text.length - spacedClose.length);
		prefixLength = spacedOpen.length;
	} else if (text.startsWith(openToken) && text.endsWith(closeToken)) {
		newText = text.slice(openToken.length, text.length - closeToken.length);
		prefixLength = openToken.length;
	} else {
		newText = spacedOpen + text + spacedClose;
	}

	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, range, newText);
	await vscode.workspace.applyEdit(edit);

	const startOffset = document.offsetAt(range.start);
	const newStart = document.positionAt(startOffset + prefixLength);
	const newEnd = document.positionAt(startOffset + prefixLength + newText.length);
	editor.selection = new vscode.Selection(newStart, newEnd);
}

module.exports = { activate, deactivate };

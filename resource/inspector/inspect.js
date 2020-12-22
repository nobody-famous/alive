const vscode = acquireVsCodeApi()

function inspect_action(index) {
    vscode.postMessage({ command: 'action', index })
}

function inspect_value(index) {
    vscode.postMessage({ command: 'value', index })
}

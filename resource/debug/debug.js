const vscode = acquireVsCodeApi()

function restart(ndx) {
    vscode.postMessage({ command: 'restart', number: ndx })
}

function jump_to(file, line, char) {
    vscode.postMessage({ command: 'jump_to', file, line, char })
}

function inspect_cond() {
    vscode.postMessage({ command: 'inspect_cond' })
}

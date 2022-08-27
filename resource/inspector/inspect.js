const vscode = acquireVsCodeApi()

document.getElementById('eval-form').onsubmit = (event) => {
    event.preventDefault()

    const textInput = document.getElementById('eval-text')

    vscode.postMessage({ command: 'eval', text: textInput.value })
    textInput.value = ''
}

function inspect_action(index) {
    vscode.postMessage({ command: 'action', index })
}

function inspect_value(index) {
    vscode.postMessage({ command: 'value', index })
}

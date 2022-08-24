const vscode = acquireVsCodeApi()

document.getElementById('eval-form').onsubmit = (event) => {
    event.preventDefault()

    const textInput = document.getElementById('eval-text')

    console.log('onsubmit', textInput)
}

function inspect_action(index) {
    vscode.postMessage({ command: 'action', index })
}

function inspect_value(index) {
    vscode.postMessage({ command: 'value', index })
}

function eval_submit() {
    console.log('***** eval_submit called')
}

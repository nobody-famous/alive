const vscode = acquireVsCodeApi()
const evalForm = document.getElementById('eval-form')
const refreshBtn = document.getElementById('refresh-btn')
const expIncBtn = document.getElementById('expand-inc-btn')

if (evalForm !== null) {
    evalForm.onsubmit = (event) => {
        event.preventDefault()

        const textInput = document.getElementById('eval-text')

        vscode.postMessage({ command: 'eval', text: textInput.value })
        textInput.value = ''
    }
}

if (refreshBtn !== null) {
    refreshBtn.onclick = (event) => {
        event.preventDefault()

        vscode.postMessage({ command: 'refresh' })
    }
}

if (expIncBtn !== null) {
    expIncBtn.onclick = (event) => {
        event.preventDefault()

        vscode.postMessage({ command: 'expInc' })
    }
}

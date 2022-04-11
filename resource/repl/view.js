const vscode = acquireVsCodeApi()

document.getElementById('repl-input-form').onsubmit = (event) => {
    event.preventDefault()

    const pkgSelect = document.getElementById('repl-input-pkg')
    const textInput = document.getElementById('repl-input-text')

    vscode.postMessage({ command: 'eval', text: textInput.value, pkg: pkgSelect.value })
}

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'addText':
            addText(data.text)
            break
    }
})

function addText(text) {
    const textArea = document.getElementById('repl-text')

    textArea.value += text
    textArea.scrollTop = textArea.scrollHeight
}

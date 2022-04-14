const vscode = acquireVsCodeApi()

document.getElementById('repl-input-form').onsubmit = (event) => {
    event.preventDefault()

    const textInput = document.getElementById('repl-input-text')

    vscode.postMessage({ command: 'eval', text: textInput.value })
}

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'addText':
            addText(data.text)
            break
        case 'setPackage':
            setPackage(data.name)
            break
    }
})

function addText(text) {
    const textArea = document.getElementById('repl-text')

    textArea.value += text
    textArea.scrollTop = textArea.scrollHeight
}

function requestPackage() {
    vscode.postMessage({ command: 'requestPackage' })
}

function setPackage(name) {
    const pkg = document.getElementById('repl-package')

    pkg.innerHTML = name
}

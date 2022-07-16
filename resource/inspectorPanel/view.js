const vscode = acquireVsCodeApi()

document.getElementById('inspector-panel-input-form').onsubmit = (event) => {
    event.preventDefault()

    const textInput = document.getElementById('inspector-panel-input-text')

    vscode.postMessage({ command: 'eval', text: textInput.value })
    textInput.value = ''
}

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'setPackage':
            setPackage(data.name)
            break
    }
})

function requestPackage() {
    vscode.postMessage({ command: 'requestPackage' })
}

function setPackage(name) {
    const pkg = document.getElementById('inspector-panel-package')
    const textInput = document.getElementById('inspector-panel-input-text')

    pkg.innerHTML = name
    textInput.focus()
}

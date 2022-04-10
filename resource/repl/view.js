const vscode = acquireVsCodeApi()

// document.getElementById('repl-input-text').onchange = function (event) {
//     const pkgSelect = document.getElementById('repl-input-pkg')

//     vscode.postMessage({ command: 'eval', text: event.target.value, pkg: pkgSelect.value })
// }

document.getElementById('repl-input-form').onsubmit = (event) => {
    event.preventDefault()

    const pkgSelect = document.getElementById('repl-input-pkg')
    const textInput = document.getElementById('repl-input-text')

    console.log('onTextSubmit', pkgSelect.value, textInput.value)
    vscode.postMessage({ command: 'eval', text: textInput.value, pkg: pkgSelect.value })
}

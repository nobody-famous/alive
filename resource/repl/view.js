const vscode = acquireVsCodeApi()

document.getElementById('repl-input-form').onsubmit = (event) => {
    event.preventDefault()

    const textInput = document.getElementById('repl-input-text')

    vscode.postMessage({ command: 'eval', text: textInput.value })
    textInput.value = ''
}

document.getElementById('repl-user-input-form').onsubmit = (event) => {
    event.preventDefault()

    const textInput = document.getElementById('repl-user-input')

    vscode.postMessage({ command: 'userInput', text: textInput.value })

    textInput.value = ''
    hideUserInput()
}

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'setInput':
            setInput(data.text)
            break
        case 'setPackage':
            setPackage(data.name)
            break
        case 'scrollReplView':
            scrollReplView()
            break
        case 'clearInput':
            clearInput()
            break
        case 'getUserInput':
            showUserInput()
            break
    }
})

document.getElementById('repl-input-text').onkeyup = (event) => {
    if (event.key === 'ArrowUp') {
        event.preventDefault()
        vscode.postMessage({ command: 'historyUp' })
    } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        vscode.postMessage({ command: 'historyDown' })
    }
}

document.getElementById('repl-input-text').onkeydown = (event) => {
    if (event.key === 'ArrowUp') {
        event.preventDefault()
    } else if (event.key === 'ArrowDown') {
        event.preventDefault()
    }
}

function clearInput() {
    const input = document.getElementById('repl-input-text')

    input.value = ''
}

function setInput(text) {
    const input = document.getElementById('repl-input-text')

    input.value = text
}

function requestPackage() {
    vscode.postMessage({ command: 'requestPackage' })
}

function setPackage(name) {
    const pkg = document.getElementById('repl-package')
    const textInput = document.getElementById('repl-input-text')

    pkg.innerHTML = name
    textInput.focus()
}

function showUserInput() {
    const inputElem = document.getElementById('repl-user-input')
    const boxElem = document.getElementById('repl-user-input-box')
    const replOutput = document.getElementById('repl-output')

    if (inputElem !== undefined && boxElem !== undefined && replOutput !== undefined) {
        boxElem.style.display = 'flex'

        inputElem.disabled = false
        inputElem.focus()

        replOutput.scrollTop = replOutput.scrollHeight
    }
}

function hideUserInput() {
    const inputElem = document.getElementById('repl-user-input')
    const boxElem = document.getElementById('repl-user-input-box')

    if (inputElem !== undefined && boxElem !== undefined) {
        inputElem.disabled = true
        boxElem.style.display = 'none'
    }
}

function scrollReplView() {
    const replOutput = document.getElementById('repl-output')
    
    if (replOutput) {
        replOutput.scrollTop = replOutput.scrollHeight
    }
}

function setFocus() {
    const input = document.getElementById('repl-input-text')
    input?.focus()
}

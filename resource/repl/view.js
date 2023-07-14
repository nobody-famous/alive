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
        case 'setText':
            setText(data.text)
            break
        case 'setInput':
            setInput(data.text)
            break
        case 'setPackage':
            setPackage(data.name)
            break
        case 'saveState':
            saveState()
            break
        case 'restoreState':
            restoreState()
            break
        case 'clear':
            clear()
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

function clear() {
    const textArea = document.getElementById('repl-text')

    textArea.value = ''

    saveState()
}

function clearInput() {
    const input = document.getElementById('repl-input-text')

    input.value = ''
}

function setInput(text) {
    const input = document.getElementById('repl-input-text')

    input.value = text
}

function setText(text) {
    const textArea = document.getElementById('repl-text')

    textArea.value = text
    textArea.scrollTop = textArea.scrollHeight

    saveState()
}

function requestPackage() {
    vscode.postMessage({ command: 'requestPackage' })
}

function setPackage(name) {
    const pkg = document.getElementById('repl-package')
    const textInput = document.getElementById('repl-input-text')

    pkg.innerHTML = name
    textInput.focus()
    saveState()
}

function showUserInput() {
    const inputElem = document.getElementById('repl-user-input')
    const boxElem = document.getElementById('repl-user-input-box')
    const textElem = document.getElementById('repl-text')

    if (inputElem !== undefined && boxElem !== undefined && textElem !== undefined) {
        boxElem.style.display = 'flex'

        inputElem.disabled = false
        inputElem.focus()

        textElem.scrollTop = textElem.scrollHeight
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

function saveState() {
    const textArea = document.getElementById('repl-text')
    const pkg = document.getElementById('repl-package')
    const state = {
        replText: textArea.value,
        pkg: pkg.innerHTML,
    }

    vscode.setState(state)
}

function restoreState() {
    const textArea = document.getElementById('repl-text')
    const pkg = document.getElementById('repl-package')
    const state = vscode.getState()

    if (textArea !== undefined && state?.replText !== undefined) {
        textArea.value = state.replText
        textArea.scrollTop = textArea.scrollHeight
    }

    if (pkg !== undefined && state?.pkg !== undefined) {
        pkg.innerHTML = state.pkg
    }
}

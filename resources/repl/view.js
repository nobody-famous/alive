const vscode = acquireVsCodeApi()

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'appendOutput':
            appendOutput(data.output.pkgName, data.output.text)
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

// document.getElementById('repl-input-form').onsubmit = (event) => {
//     event.preventDefault()

//     const textInput = document.getElementById('repl-input-text')

//     vscode.postMessage({ command: 'eval', text: textInput.value })
//     textInput.value = ''
// }

// document.getElementById('repl-user-input-form').onsubmit = (event) => {
//     event.preventDefault()

//     const textInput = document.getElementById('repl-user-input')

//     vscode.postMessage({ command: 'userInput', text: textInput.value })

//     textInput.value = ''
//     hideUserInput()
// }

// document.getElementById('repl-input-text').onkeyup = (event) => {
//     if (event.key === 'ArrowUp') {
//         event.preventDefault()
//         vscode.postMessage({ command: 'historyUp' })
//     } else if (event.key === 'ArrowDown') {
//         event.preventDefault()
//         vscode.postMessage({ command: 'historyDown' })
//     }
// }

// document.getElementById('repl-input-text').onkeydown = (event) => {
//     if (event.key === 'ArrowUp') {
//         event.preventDefault()
//     } else if (event.key === 'ArrowDown') {
//         event.preventDefault()
//     }
// }

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

function appendOutput(pkg, text) {
    const output = document.getElementById('repl-output')
    const elem = document.createElement('div')

    elem.innerText = typeof pkg === 'string' ? `${pkg}> ${text}` : text
    output.appendChild(elem)
    elem.scrollIntoView()
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

function setFocus() {
    const input = document.getElementById('repl-input-text')
    input?.focus()
}

const style = new CSSStyleSheet()

style.replaceSync(`
    .repl-output {
        overflow: auto;
        flex-grow: 1;
        border-bottom: 1px solid var(--vscode-editorWidget-border);
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
        padding: 0.5em 0;
    }

    .repl-input-text-box {
        display: flex;
        flex-direction: row;
        align-items: center;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
    }
`)

customElements.define(
    'repl-output',
    class extends HTMLElement {
        constructor() {
            super()

            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-output">
                    REPL output goes here
                </div>
            `
        }
    }
)

customElements.define(
    'repl-input',
    class extends HTMLElement {
        constructor() {
            super()

            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-input">
                    REPL input goes here
                </div>
            `
        }
    }
)

customElements.define(
    'repl-view',
    class extends HTMLElement {
        constructor() {
            super()

            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-view">
                    <repl-output></repl-output>
                    <repl-input></repl-input>
                </div>
            `
        }
    }
)

// customElements.define(
//     'repl-container',
//     class extends HTMLElement {
//         static observedAttributes = ['init-package', 'extension-version']

//         constructor() {
//             super()

//             this.shadow = this.attachShadow({ mode: 'open' })

//             this.shadow.adoptedStyleSheets = [style]
//             this.shadow.innerHTML = `
//                 <div class="repl-container">
//                     <div class="repl-output">REPL Output Goes Here</div>
//                     <div class="repl-input-text-box">REPL Input Box Goes Here</div>
//                 </div>
//             `
//         }

//         attributeChangedCallback(name, oldValue, newValue) {
//             const elem = this.getElementForAttr(name)

//             if (elem === undefined) {
//                 return
//             }

//             elem.innerText = newValue
//         }

//         getElementForAttr(name) {
//             if (name === 'init-package') {
//                 return this.shadow.getElementById('package')
//             } else if (name === 'extension-version') {
//                 return this.shadow.getElementById('version')
//             } else {
//                 return undefined
//             }
//         }
//     }
// )

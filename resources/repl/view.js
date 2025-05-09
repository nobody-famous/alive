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

// document.getElementById('repl-user-input-form').onsubmit = (event) => {
//     event.preventDefault()

//     const textInput = document.getElementById('repl-user-input')

//     vscode.postMessage({ command: 'userInput', text: textInput.value })

//     textInput.value = ''
//     hideUserInput()
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
    const view = document.getElementById('repl-view')
    view.setInput(text)
}

function appendOutput(pkg, text) {
    const view = document.getElementById('repl-view')
    view.appendOutput(pkg, text)
}

function requestPackage() {
    vscode.postMessage({ command: 'requestPackage' })
}

function setPackage(name) {
    const view = document.getElementById('repl-view')

    view?.setPackage(name)
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
    // const textArea = document.getElementById('repl-text')
    // const pkg = document.getElementById('repl-package')
    // const state = {
    //     replText: textArea.value,
    //     pkg: pkg.innerHTML,
    // }
    // vscode.setState(state)
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
    input:focus,
    select:focus {
        outline: none;
    }

.repl-view {
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    repl-output {
        flex: 1;
        overflow: auto;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
        border-bottom: 1px solid var(--vscode-editorWidget-border);
    }

    .repl-output {
        height: 100%;
    }

    .repl-input-box {
        display: flex;
        flex-direction: column;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
    }

    .repl-input-text-box {
        flex-grow: 1;
        display: flex;
        flex-direction: row;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
    }

    .repl-input-label {
        text-align: right;
        display: inline-block;
        height: 1.5rem;
        line-height: 1.5rem;
        cursor: pointer;
    }

    .repl-input-text {
        color: var(--vscode-editor-foreground);
        caret-color: var(--vscode-editor-foreground);
        background-color: var(--vscode-editor-background);
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
        border: none;
        height: 1.5rem;
        line-height: 1.5rem;
        width: 95%;
    }

    .repl-input-form {
        flex-grow: 1;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
    }

    #repl-user-input-box {
        display: none;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
    }

    #repl-user-input-form {
        flex-grow: 1;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        font-weight: var(--vscode-editor-font-weight);
    }
`)

customElements.define(
    'repl-output-package',
    class extends HTMLElement {
        connectedCallback() {
            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-output-package-box">
                    <span id="package"></span>
                    <span>&gt;</span>
                </div>
            `
        }

        setPackage(pkg) {
            const pkgElem = this.shadow.getElementById('package')

            if (pkgElem) {
                pkgElem.innerText = pkg
            }
        }
    }
)

customElements.define(
    'repl-output-item',
    class extends HTMLElement {
        connectedCallback() {
            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-output-item" id="item-box">
                    <span class="repl-output-package"></span>
                </div>
            `
        }

        setText(text, pkg) {
            const box = this.shadow.getElementById('item-box')
            const pkgItem = typeof pkg === 'string' ? document.createElement('repl-output-package') : undefined
            const textItem = document.createElement('span')

            if (pkgItem) {
                pkgItem.setPackage(pkg)
            }
        }
    }
)

customElements.define(
    'repl-output',
    class extends HTMLElement {
        append(pkgName, text) {
            const output = this.shadow.getElementById('output')
            const elem = document.createElement('div')

            elem.innerText = typeof pkgName === 'string' ? `${pkgName}> ${text}` : text
            output.appendChild(elem)
            elem.scrollIntoView()
        }

        connectedCallback() {
            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-output" id="output"></div>
            `

            vscode.postMessage({ command: 'outputConnected' })
        }
    }
)

customElements.define(
    'repl-input',
    class extends HTMLElement {
        setPackage(pkgName) {
            const pkg = this.shadow.getElementById('repl-package')
            const textInput = this.shadow.getElementById('repl-input-text')

            pkg.innerText = pkgName
            textInput.focus()
        }

        getPackage() {
            const pkg = this.shadow.getElementById('repl-package')
            return pkg?.innerText
        }

        setText(text) {
            const elem = this.shadow.getElementById('repl-input-text')

            if (elem != null) {
                elem.value = text
            }
        }

        connectedCallback() {
            this.package = this.getAttribute('package')
            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-input-box">
                    <div class="repl-input-text-box" id="repl-user-input-box">
                        <div class="repl-input-label">
                            Input >
                        </div>
                        <form id="repl-user-input-form" class="repl-input-form" action="">
                            <input class="repl-input-text" id="repl-user-input" type="text">
                        </form>
                    </div>
                    <div class="repl-input-text-box">
                        <div class="repl-input-label" onclick="requestPackage()">
                            <span id="repl-package">${this.package ?? ''}</span>
                            >
                        </div>
                            <form id="repl-input-form" class="repl-input-form" action="">
                                <input class="repl-input-text" id="repl-input-text" type="text">
                            </form>
                    </div>
                </div>
            `

            this.shadow.getElementById('repl-input-form').onsubmit = (event) => {
                event.preventDefault()

                const textInput = this.shadow.getElementById('repl-input-text')

                vscode.postMessage({ command: 'eval', text: textInput.value })
                textInput.value = ''
            }

            this.shadow.getElementById('repl-input-text').onkeyup = (event) => {
                if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    vscode.postMessage({ command: 'historyUp' })
                } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    vscode.postMessage({ command: 'historyDown' })
                }
            }

            this.shadow.getElementById('repl-input-text').onkeydown = (event) => {
                if (event.key === 'ArrowUp') {
                    event.preventDefault()
                } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                }
            }
        }
    }
)

customElements.define(
    'repl-view',
    class extends HTMLElement {
        connectedCallback() {
            const pkg = this.getAttribute('package')
            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-view" id="repl-view">
                    <repl-output id="output"></repl-output>
                    <repl-input id="input" package="${pkg}"></repl-input>
                </div>
            `
        }

        setPackage(pkgName) {
            const input = this.shadow.getElementById('input')
            input?.setPackage(pkgName)
        }

        getPackage() {
            const input = this.shadow.getElementById('input')
            input?.getPackage()
        }

        appendOutput(pkgName, text) {
            const output = this.shadow.getElementById('output')
            output?.append(pkgName, text)
        }

        setInput(text) {
            const input = this.shadow.getElementById('input')
            input?.setText(text)
        }
    }
)

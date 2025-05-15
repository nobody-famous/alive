const vscode = acquireVsCodeApi()

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'appendOutput':
            appendOutput(data.output.pkgName, data.output.text)
            break
        case 'setReplOutput':
            setReplOutput(data.output)
            break
        case 'setInput':
            setInput(data.text)
            break
        case 'setPackage':
            setPackage(data.name)
            break
        case 'clear':
            clear()
            break
        case 'clearInput':
            clearInput()
            break
    }
})

function clear() {
    const view = document.getElementById('repl-view')
    view.clearOutput()
}

function clearInput() {
    setInput('')
}

function setInput(text) {
    const view = document.getElementById('repl-view')
    view.setInput(text)
}

function appendOutput(pkg, text) {
    const view = document.getElementById('repl-view')
    view.appendOutput(pkg, text)
}

function setReplOutput(output) {
    const view = document.getElementById('repl-view')
    view.setOutput(output)
}

function requestPackage() {
    vscode.postMessage({ command: 'requestPackage' })
}

function setPackage(name) {
    const view = document.getElementById('repl-view')
    view?.setPackage(name)
}

function setFocus() {
    const view = document.getElementById('repl-view')
    view?.setFocus()
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

    .repl-output-package {
        display: inline;
        margin-right: 0.3rem;
        color: var(--vscode-editorLink-activeForeground);
    }

    .repl-output-text {
        display: inline;
        white-space: pre-wrap;
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
            const pkg = this.getAttribute('package')
            const text = this.getAttribute('text')
            const pkgElem = typeof pkg === 'string' && pkg !== '' ? document.createElement('div') : undefined
            const textElem = document.createElement('div')
            const box = document.createElement('div')

            box.classList.add('repl-output-item')

            if (pkgElem !== undefined) {
                pkgElem.classList.add('repl-output-package')
                pkgElem.innerText = `${pkg}>`

                box.style.marginTop = '1rem'
                box.appendChild(pkgElem)
            }

            textElem.classList.add('repl-output-text')
            textElem.innerText = text
            box.appendChild(textElem)

            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.appendChild(box)
        }
    }
)

customElements.define(
    'repl-output',
    class extends HTMLElement {
        createOutputItem(pkgName, text) {
            const elem = document.createElement('repl-output-item')
            elem.setAttribute('package', pkgName ?? '')
            elem.setAttribute('text', text)
            return elem
        }

        append(pkgName, text) {
            const output = this.shadow.getElementById('output')
            const elem = this.createOutputItem(pkgName, text)

            output.appendChild(elem)
            elem.scrollIntoView()
        }

        setOutput(items) {
            if (!Array.isArray(items)) {
                return
            }

            const output = this.shadow.getElementById('output')
            const elems = items.map(({ pkgName, text }) => this.createOutputItem(pkgName, text))

            output.replaceChildren(...elems)

            elems[elems.length - 1]?.scrollIntoView()
        }

        clear() {
            const output = this.shadow.getElementById('output')
            output?.replaceChildren()
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

        setFocus() {
            const elem = this.shadow.getElementById('repl-input-text')
            elem?.focus()
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

        setFocus() {
            const input = this.shadow.getElementById('input')
            input?.setFocus()
        }

        appendOutput(pkgName, text) {
            const output = this.shadow.getElementById('output')
            output?.append(pkgName, text)
        }

        setOutput(items) {
            const output = this.shadow.getElementById('output')
            output?.setOutput(items)
        }

        setInput(text) {
            const input = this.shadow.getElementById('input')
            input?.setText(text)
        }

        clearOutput() {
            const output = this.shadow.getElementById('output')
            output?.clear()
        }
    }
)

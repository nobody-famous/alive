const vscode = acquireVsCodeApi()

function restart(ndx) {
    vscode.postMessage({ command: 'restart', number: ndx })
}

function jump_to(file, line, char) {
    vscode.postMessage({ command: 'jump_to', file, line, char })
}

function inspect_cond() {
    vscode.postMessage({ command: 'inspect_cond' })
}

function setRestarts(restarts) {
    const div = document.getElementById('restarts')

    for (const [index, restart] of restarts.entries()) {
        div.addItem(index, restart)
    }
}

function setBacktrace(backtrace) {
    const div = document.getElementById('backtrace')

    for (const [index, item] of backtrace.entries()) {
        div.addItem(index, item)
    }
}

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'restarts':
            setRestarts(data.restarts)
            break
        case 'backtrace':
            setBacktrace(data.backtrace)
            break
    }
})

const style = new CSSStyleSheet()

style.replaceSync(`
    .title {
        font-size: 1.25rem;
        font-weight: bold;
    }
    .list-box {
        margin-left: 0.5rem;
        padding: 0.5rem;
        background: var(--list-background);
        border-radius: 5px;
    }
    .list-item {
        display: flex;
        overflow: auto;
        flex-direction: row;
        margin-top: 0.25rem;
        margin-bottom: 0.25rem;
    }
    .list-item-ndx {
        flex-shrink: 1;
        margin-right: 0.5rem;
    }
    .list-item-vars {
        margin-left: 1rem;
        display: grid;
        grid-template-columns: min-content auto;
        column-gap: 0.5rem;
        row-gap: 0.25rem;
    }
    .list-item-var-name {
    }
    .list-item-var-value {
    }
    .clickable {
        cursor: pointer;
    }
    .clickable:hover {
        background: green;
        color: yellow;
    }
`)

customElements.define(
    'debug-condition',
    class extends HTMLElement {
        constructor() {
            super()

            const shadow = this.attachShadow({ mode: 'open' })

            shadow.adoptedStyleSheets = [style]
            shadow.innerHTML = `
                <div>
                    <div class="title">Condition</div>
                    <div class="list-box">
                        <div class="list-item"><slot></slot></div>
                    </div>
                </div>
            `
        }
    }
)

customElements.define(
    'debug-restarts',
    class extends HTMLElement {
        constructor() {
            super()

            this.shadow = this.attachShadow({ mode: 'open' })
            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <style>
                    #restarts {
                        margin-bottom: 1.5rem;
                    }
                </style>

                <div id="restarts-div">
                    <div class="title">Restarts</div>
                    <div id="box" class="list-box"></div>
                </div>
            `
        }

        connectedCallback() {
            vscode.postMessage({ command: 'send_restarts' })
        }

        addItem(index, item) {
            const box = this.shadow.getElementById('box')
            const elem = document.createElement('debug-restart-item')
            const text = `${index}: [${item.name}] ${item.description}`

            elem.setText(text)
            elem.setIndex(index)

            box.appendChild(elem)
        }
    }
)

customElements.define(
    'debug-restart-item',
    class extends HTMLElement {
        constructor() {
            super()

            this.shadow = this.attachShadow({ mode: 'open' })
            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div id="box" class="list-item restart-item clickable"></div>
            `

            this.addEventListener('click', () => {
                if (Number.isInteger(this.index)) {
                    restart(this.index)
                }
            })
        }

        setIndex(value) {
            this.index = value
        }

        setText(value) {
            const box = this.shadow.getElementById('box')
            box.textContent = value
        }
    }
)

customElements.define(
    'debug-backtrace',
    class extends HTMLElement {
        constructor() {
            super()

            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div id="backtrace">
                    <div class="title">Backtrace</div>
                    <div id="box" class="list-box"></div>
                </div>
            `
        }

        connectedCallback() {
            vscode.postMessage({ command: 'send_backtrace' })
        }

        addItem(index, item) {
            const box = this.shadow.getElementById('box')
            const elem = document.createElement('debug-backtrace-item')

            elem.setIndex(index)
            elem.setItem(item)

            box.appendChild(elem)
        }
    }
)

customElements.define(
    'debug-backtrace-item',
    class extends HTMLElement {
        constructor() {
            super()

            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="list-item stacktrace-item">
                    <div id="index-field" class="list-item-ndx"></div>
                    <div id="loc-field" class="list-item-loc">
                        <div id="fn-field" class="list-item-fn"></div>
                        <div id="file-field" class="list-item-file"></div>
                        <div id="vars-box" class="list-item-vars"></div>
                    </div>
                </div>
            `
            this.addEventListener('click', () => {
                if (this.item?.file != null && this.item?.position != null) {
                    jump_to(this.item.file, this.item.position.line, this.item.position.character)
                }
            })
        }

        setIndex(value) {
            const elem = this.shadow.getElementById('index-field')
            elem.textContent = value
        }

        posStr(file, pos) {
            if (file == null) {
                return ''
            }

            const str = pos != null ? `:${pos.line + 1}:${pos.character + 1}` : ''

            return `${file}${str}`
        }

        setItem(item) {
            const locElem = this.shadow.getElementById('loc-field')
            const fnElem = this.shadow.getElementById('fn-field')
            const fileElem = this.shadow.getElementById('file-field')
            const varsElem = this.shadow.getElementById('vars-box')

            this.item = item

            if (this.item.file != null && this.item.position != null) {
                locElem.classList.add('clickable')
            }

            fnElem.textContent = this.item.function
            fileElem.textContent = this.posStr(this.item.file, this.item.position)

            for (const [name, value] of Object.entries(item.vars ?? {})) {
                const nameElem = document.createElement('div')
                const valueElem = document.createElement('div')

                nameElem.classList.add('list-item-var-name')
                valueElem.classList.add('list-item-var-value')

                nameElem.textContent = name
                valueElem.textContent = value

                varsElem.appendChild(nameElem)
                varsElem.appendChild(valueElem)
            }
        }
    }
)

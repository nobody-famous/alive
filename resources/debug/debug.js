const vscode = acquireVsCodeApi()

function restart(ndx) {
    vscode.postMessage({ command: 'restart', number: ndx })
}

function restartFrame(ndx, argsList) {
    vscode.postMessage({ command: 'restart_frame', number: ndx, argsList })
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

customElements.define(
    'debug-condition',
    class extends HTMLElement {
        connectedCallback() {
            const msg = this.getAttribute('message') ?? ''

            this.innerHTML = `
                <div>
                    <div class="title">Condition</div>
                    <div class="list-box">
                        <div class="list-item">${msg}</div>
                    </div>
                </div>
            `
        }
    },
)

customElements.define(
    'debug-restarts',
    class extends HTMLElement {
        connectedCallback() {
            this.innerHTML = `
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

            vscode.postMessage({ command: 'send_restarts' })
        }

        addItem(index, item) {
            const box = this.querySelector('#box')
            const elem = document.createElement('debug-restart-item')
            const text = `${index}: [${item.name}] ${item.description}`

            elem.setText(text)
            elem.setIndex(index)

            box.appendChild(elem)
        }
    },
)

customElements.define(
    'debug-restart-item',
    class extends HTMLElement {
        constructor() {
            super()

            this.addEventListener('click', () => {
                if (Number.isInteger(this.index)) {
                    restart(this.index)
                }
            })
        }

        connectedCallback() {
            this.innerHTML = `
                <div id="box" class="list-item restart-item clickable">${this.value}</div>
            `
        }

        setIndex(value) {
            this.index = value
        }

        setText(value) {
            this.value = value
        }
    },
)

customElements.define(
    'debug-backtrace',
    class extends HTMLElement {
        connectedCallback() {
            this.innerHTML = `
                <div id="backtrace">
                    <div class="title">Backtrace</div>
                    <div id="box" class="list-box"></div>
                </div>
            `
            vscode.postMessage({ command: 'send_backtrace' })
        }

        addItem(index, item) {
            const box = this.querySelector('#box')
            const elem = document.createElement('debug-backtrace-item')

            elem.setIndex(index)
            elem.setItem(item)

            box.appendChild(elem)
        }
    },
)

customElements.define(
    'debug-backtrace-item',
    class extends HTMLElement {
        constructor() {
            super()
        }

        connectedCallback() {
            this.innerHTML = `
                <div id="index-field" class="list-item-ndx">
                    <div>${this.indexValue}</div>
                    ${this.item.restartable ? '<button id="restart" title="Restart Frame"><span class="codicon codicon-debug-restart-frame"></span></button>' : ''}
                </div>
                <div id="loc-field" class="list-item-loc">
                    <div id="fn-field" class="list-item-fn"></div>
                    <div id="file-field" class="list-item-file"></div>
                    <div id="vars-box" class="list-item-vars"></div>
                </div>
            `

            this.querySelector('#restart')?.addEventListener('click', () => {
                const args = this.item.argsList.trim().replace(/^\((.*)\)$/, '$1')
                restartFrame(this.indexValue, args)
            })

            this.querySelector('#file-field')?.addEventListener('click', () => {
                if (this.item?.file != null && this.item?.position != null) {
                    jump_to(this.item.file, this.item.position.line, this.item.position.character)
                }
            })

            this.displayItem()
        }

        displayItem() {
            const fnElem = this.querySelector('#fn-field')
            const fileElem = this.querySelector('#file-field')
            const varsElem = this.querySelector('#vars-box')

            if (this.item.file != null && this.item.position != null) {
                fileElem.classList.add('clickable')
            }

            fnElem.textContent = this.item.function
            fileElem.textContent = this.posStr(this.item.file, this.item.position)

            for (const v of this.item.vars ?? []) {
                const nameElem = document.createElement('div')
                nameElem.classList.add('list-item-var-name')
                nameElem.textContent = v.name
                varsElem.appendChild(nameElem)

                const valueElem = document.createElement('div')
                valueElem.classList.add('list-item-var-value')
                valueElem.textContent = v.value
                varsElem.appendChild(valueElem)
            }
        }

        setIndex(value) {
            this.indexValue = value
        }

        posStr(file, pos) {
            if (file == null) {
                return ''
            }

            const str = pos != null ? `:${pos.line + 1}:${pos.character + 1}` : ''

            return `${file}${str}`
        }

        setItem(item) {
            this.item = item
        }
    },
)

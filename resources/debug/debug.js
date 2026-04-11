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
                <div class="condition-box">
                    <div class="title">Condition</div>
                    <div class="list-box">
                        <div id="message" class="list-item">${msg}</div>
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
                <div class="restarts-box">
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
                <div id="item" class="restart-item clickable">
                </div>
            `

            this.querySelector('#item').textContent = this.value
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
                    <div id="box" class="list-box backtrace-box"></div>
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
    'debug-backtrace-vars',
    class extends HTMLElement {
        constructor() {
            super()

            this.chevronClass = 'codicon-chevron-right'
            this.varsCount = 0
        }

        connectedCallback() {
            this.innerHTML = `
                <div class="backtrace-vars-box">
                    <div class="backtrace-vars-count"></div>
                    <div class="backtrace-vars-label is-hidden">
                        <span id="chevron" class="codicon ${this.chevronClass}"></span>
                        <span id="label"></span>
                    </div>
                    <div id="backtrace-vars" class="backtrace-vars is-hidden"></div>
                </div>
            `
        }

        getLabel() {
            return `${this.varsCount} Local variable${this.varsCount !== 1 ? 's' : ''}`
        }

        toggleCollapsed() {
            const elem = this.querySelector('#chevron')
            const varsElem = this.querySelector('#backtrace-vars')
            const collapsed = elem.classList.contains('codicon-chevron-right')

            if (collapsed) {
                elem.classList.remove('codicon-chevron-right')
                elem.classList.add('codicon-chevron-down')
                varsElem.classList.remove('is-hidden')
            } else {
                elem.classList.remove('codicon-chevron-down')
                elem.classList.add('codicon-chevron-right')
                varsElem.classList.add('is-hidden')
            }
        }

        setVars(vars) {
            const varsElem = this.querySelector('#backtrace-vars')
            const labelBoxElem = this.querySelector('.backtrace-vars-label')
            const labelElem = this.querySelector('#label')

            this.varsCount = vars ? vars.length : 0

            labelElem.textContent = this.getLabel()

            if (this.varsCount < 1) {
                return
            }

            labelBoxElem.classList.remove('is-hidden')
            labelBoxElem.addEventListener('click', () => this.toggleCollapsed())

            for (const v of vars ?? []) {
                const nameElem = document.createElement('div')
                nameElem.classList.add('backtrace-var-name')
                nameElem.textContent = v.name
                varsElem.appendChild(nameElem)

                const valueElem = document.createElement('div')
                valueElem.classList.add('backtrace-var-value')
                valueElem.textContent = v.value
                varsElem.appendChild(valueElem)
            }
        }
    },
)

customElements.define(
    'debug-backtrace-item',
    class extends HTMLElement {
        connectedCallback() {
            this.innerHTML = `
                <div id="index-field" class="backtrace-index">
                    <div>${this.indexValue}</div>
                    ${this.item.restartable ? '<button id="restart" title="Restart Frame"><span class="codicon codicon-debug-restart-frame"></span></button>' : ''}
                </div>
                <div id="loc-field" class="backtrace-location">
                    <div id="fn-field" class="backtrace-fn"></div>
                    <div id="file-field" class="backtrace-file"></div>
                    <debug-backtrace-vars id="vars"></debug-backtrace-vars>
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
            const varsElem = this.querySelector('#vars')

            if (this.item.file != null && this.item.position != null) {
                fileElem.classList.add('clickable')
            }

            fnElem.textContent = this.item.function
            fileElem.textContent = this.posStr(this.item.file, this.item.position)

            varsElem.setVars(this.item.vars)
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

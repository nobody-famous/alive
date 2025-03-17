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

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'hydrate':
            setRestarts(data.restarts)
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
    class ConditionElement extends HTMLElement {
        constructor() {
            super()

            const template = document.getElementById('condition-template')
            const shadow = this.attachShadow({ mode: 'open' })

            shadow.adoptedStyleSheets = [style]
            shadow.appendChild(template.content.cloneNode(true))
        }
    }
)

customElements.define(
    'debug-restarts',
    class ConditionElement extends HTMLElement {
        constructor() {
            super()

            const template = document.getElementById('restarts-template')

            this.shadow = this.attachShadow({ mode: 'open' })
            this.shadow.adoptedStyleSheets = [style]
            this.shadow.appendChild(template.content.cloneNode(true))
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
    class ConditionElement extends HTMLElement {
        constructor() {
            super()

            const template = document.getElementById('restart-item-template')
            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.appendChild(template.content.cloneNode(true))

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

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

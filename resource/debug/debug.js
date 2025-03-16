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

            const template = document.getElementById('condition')
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

            const template = document.getElementById('restarts')
            const shadow = this.attachShadow({ mode: 'open' })

            shadow.adoptedStyleSheets = [style]
            shadow.appendChild(template.content.cloneNode(true))
        }
    }
)

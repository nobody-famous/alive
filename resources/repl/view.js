const vscode = acquireVsCodeApi()

window.addEventListener('message', (event) => {
    const data = event.data

    switch (data.type) {
        case 'restarts':
            // setRestarts(data.restarts)
            break
        case 'backtrace':
            // setBacktrace(data.backtrace)
            break
    }
})

const style = new CSSStyleSheet()

style.replaceSync(`
`)

customElements.define(
    'repl-container',
    class extends HTMLElement {
        static observedAttributes = ['init-package', 'extension-version']

        constructor() {
            super()

            this.shadow = this.attachShadow({ mode: 'open' })

            this.shadow.adoptedStyleSheets = [style]
            this.shadow.innerHTML = `
                <div class="repl-container">
                    <div class="repl-output">REPL Output Goes Here</div>
                    <div class="repl-input-texxt-box">REPL Input Box Goes Here</div>
                </div>
            `
        }

        attributeChangedCallback(name, oldValue, newValue) {
            const elem = this.getElementForAttr(name)

            if (elem === undefined) {
                return
            }

            elem.innerText = newValue
        }

        getElementForAttr(name) {
            if (name === 'init-package') {
                return this.shadow.getElementById('package')
            } else if (name === 'extension-version') {
                return this.shadow.getElementById('version')
            } else {
                return undefined
            }
        }
    }
)

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

            this.package = ''
            this.version = ''

            const shadow = this.attachShadow({ mode: 'open' })

            shadow.adoptedStyleSheets = [style]
            shadow.innerHTML = `
                <div class="repl-container">REPL Stuff Goes Here</div>
            `
        }

        attributeChangedCallback(name, oldValue, newValue) {
            console.log('***** ATTRIBUTE CHANGED', name, newValue)
            if (name === 'init-package') {
                this.package = newValue
            } else if (name === 'extension-version') {
                this.version = newValue
            }
        }
    }
)

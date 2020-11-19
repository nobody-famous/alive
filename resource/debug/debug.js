const app = document.getElementById('app')

function content() {
    return `
        <div id="content">
            Some Content
        </div>
    `
}

app.innerHTML = content()

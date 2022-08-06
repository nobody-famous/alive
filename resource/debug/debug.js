const vscode = acquireVsCodeApi()

function restart(ndx) {
    vscode.postMessage({ command: 'restart', number: ndx })
}

function jump_to(file, line, char) {
    vscode.postMessage({ command: 'jump_to', file, line, char })
}

function bt_locals(ndx) {
    vscode.postMessage({ command: 'bt_locals', number: ndx })
}

function frame_eval(ndx) {
    const input = window.document.getElementById(`eval-input-${ndx}`)
    const value = input.value.trim()

    if (value !== '') {
        vscode.postMessage({ command: 'frame_eval', number: ndx, text: value })
    }
}

function frame_restart(ndx) {
    vscode.postMessage({ command: 'frame_restart', number: ndx })
}

function input_changed(ndx) {
    const input = window.document.getElementById(`eval-input-${ndx}`)
    const value = input.value.trim()

    if (value !== '') {
        vscode.postMessage({ command: 'input_changed', number: ndx, text: value })
    }
}

function inspect_cond() {
    vscode.postMessage({ command: 'inspect_cond' })
}

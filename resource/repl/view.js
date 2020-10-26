document.getElementById('replInput').onblur = function () {
    this.focus()
}

document.getElementById('replInput').onkeyup = function (event) {
    console.log('keyup', event)
}
import * as vscode from 'vscode'
import * as path from 'path'
import { TextEncoder } from 'util'

export async function create(folder: vscode.WorkspaceFolder) {
    const empty = await isFolderEmpty(folder.uri)
    if (!empty) {
        throw new Error('Folder not empty')
    }

    const base = folder.uri
    const part = lastDirPart(base.fsPath)

    const src = vscode.Uri.joinPath(base, 'src')
    const app = vscode.Uri.joinPath(src, 'app.lisp')
    const test = vscode.Uri.joinPath(base, 'test')
    const all = vscode.Uri.joinPath(test, 'all.lisp')
    const asdf = vscode.Uri.joinPath(base, `${part}.asd`)

    const asdfStr = asdfContent(part)
    const asdfUint8 = new TextEncoder().encode(asdfStr)

    const appStr = appContent()
    const appUint8 = new TextEncoder().encode(appStr)

    const testStr = testContent()
    const testUint8 = new TextEncoder().encode(testStr)

    await vscode.workspace.fs.createDirectory(src)
    await vscode.workspace.fs.createDirectory(test)
    await vscode.workspace.fs.writeFile(asdf, asdfUint8)
    await vscode.workspace.fs.writeFile(app, appUint8)
    await vscode.workspace.fs.writeFile(all, testUint8)

    const asdfDoc = await vscode.workspace.openTextDocument(asdf.fsPath)
    vscode.window.showTextDocument(asdfDoc)

    const appDoc = await vscode.workspace.openTextDocument(app.fsPath)
    vscode.window.showTextDocument(appDoc)

    const allDoc = await vscode.workspace.openTextDocument(all.fsPath)
    vscode.window.showTextDocument(allDoc)
}

function lastDirPart(dir: string): string {
    const parts = dir.split(path.sep)
    return parts[parts.length - 1]
}

async function isFolderEmpty(folder: vscode.Uri): Promise<boolean> {
    const entries = await vscode.workspace.fs.readDirectory(folder)
    const names = entries.filter(([name, type]) => name !== '.vscode')

    return names.length === 0
}

function appContent(): string {
    return `(defpackage :app
    (:use :cl))

(in-package :app)
`
}

function testContent(): string {
    return `(defpackage :test/all
    (:use :cl :app)
    (:export :test-suite))

(in-package :test/all)

(defun test-suite ()
    (format T "Test Suite~%"))
`
}

function asdfContent(dir: string): string {
    return `(in-package :asdf-user)

(defsystem "${dir}"
    :class :package-inferred-system
    :depends-on ("${dir}/src/app")
    :description ""
    :in-order-to ((test-op (load-op "${dir}/test/all")))
    :perform (test-op (o c) (symbol-call :test/all :test-suite))
)

(defsystem "${dir}/test"
    :depends-on ("${dir}/test/all")
)

(register-system-packages "${dir}/src/app" '(:app))
(register-system-packages "${dir}/test/all" '(:test/all))
`
}

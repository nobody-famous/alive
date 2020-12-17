import * as path from 'path'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { createFolder, openFile } from './Utils'

export async function create(folder: vscode.WorkspaceFolder) {
    const empty = await isFolderEmpty(folder.uri)
    if (!empty) {
        throw new Error('Folder not empty')
    }

    const base = folder.uri
    const part = lastDirPart(base.fsPath)

    const src = vscode.Uri.joinPath(base, 'src')
    const test = vscode.Uri.joinPath(base, 'test')

    await createFolder(src)
    await createFolder(test)

    const app = vscode.Uri.joinPath(src, 'app.lisp')
    const all = vscode.Uri.joinPath(test, 'all.lisp')
    const asdf = vscode.Uri.joinPath(base, `${part}.asd`)

    const asdfUint8 = new TextEncoder().encode(asdfContent(part))
    const appUint8 = new TextEncoder().encode(appContent())
    const testUint8 = new TextEncoder().encode(testContent())

    const asdfDoc = await openFile(asdf)
    const appDoc = await openFile(app)
    const allDoc = await openFile(all)

    await vscode.workspace.fs.writeFile(asdf, asdfUint8)
    await vscode.workspace.fs.writeFile(app, appUint8)
    await vscode.workspace.fs.writeFile(all, testUint8)

    await vscode.window.showTextDocument(appDoc)
    await vscode.window.showTextDocument(allDoc)
    await vscode.window.showTextDocument(asdfDoc)
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

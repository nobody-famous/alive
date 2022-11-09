# Alive: The Average Lisp VSCode Environment

An attempt to create a Common Lisp extension for VSCode. It's still a work in progress, though getting better.

The name is partly a self-deprecating take on SLIME's name, but also reflects the goal of the project which is to reach Minimum Viable Product status. For VSCode language extensions, there is a lot that is expected for the bare minimum, including formatting, code completion, syntax highlighting, etc.

The LSP server that the extension relies on currently only supports [Steel Bank Common Lisp (SBCL)](https://www.sbcl.org/). The extension isn't intended to be compiler-specific, but it is at the moment. The server can be found here, https://github.com/nobody-famous/alive-lsp

## Extension Requirements

The following must be installed prior to useing the Alive extension. It is okay for these to be installed after the extension is installed, although you may need to reload your VS Code window after doing so.

* [ASDF](https://asdf.common-lisp.dev/) (*not* [asdf](https://asdf-vm.com/)): version 3.3.3 or later.

  - Note: SBCL comes with ASDF already installed.

* The LSP server uses the following Common Lisp libraries, which need to be installed for it to work.
  - Libraries: 

    - bordeaux-threads
    - usocket
    - cl-json
    - flexi-streams

  - If you are new to Common Lisp, then the [Quicklisp](https://www.quicklisp.org/beta/) library manager is recommended. Follow the installation instructions to install Quicklisp. Then the above libraries can be installed by executing the following expressions in an `sbcl` shell:

    - `(ql:quickload "bordeaux-threads")`
    - `(ql:quickload "usocket")`
    - `(ql:quickload "cl-json")`
    - `(ql:quickload "flexi-streams")`

    <details>
    <summary>An example SBCL and Quicklisp session (where `...` stands for a bunch of stuff printed to the console)</summary>

    ```lisp
    > sbcl
    ...
    * (ql:quickload "bordeaux-threads")
    ...
    * (ql:quickload "usocket")
    ...
    * (ql:quickload "cl-json")
    ...
    * (ql:quickload "flexi-streams")
    ...
    ```
    </details>

## Features

-   Syntax highlighting
-   Code completion
-   Code formatter
-   Snippets
-   REPL integration
-   REPL history
-   Inline evaluation
-   Macro expansion
-   Jump To Definition
-   Expand Selection

## Extension Settings

This extension contributes the following settings:

-   `alive.lsp.install.path`: Directory where the LSP source code is installed
-   `alive.lsp.startCommand`: Command used to start the LSP server
-   `alive.format.indentWidth`: Default indentation width

Syntax highlighting is done using semantic tokens. This is mainly to avoid regex hell. The following symantic tokens are added:

-   `parenthesis`: Color to use for parenthesis
-   `symbol`: Color to use for symbols

## REPL Integration

The current idea is to use VSCode as the REPL, leveraging VSCode features to give a visual insight into the running image.

-   There is a REPL console that mimics the debug console.
-   A Lisp tree view is added that shows the REPL history, threads, packages, and defined ASDF systems.
-   User input requested by the REPL is prompted with a text box.
-   History items can be re-run by using the up/down arrow keys in the REPL console, using the re-run action in the history tree view, or using "REPL History" from the command palette.

## Inspector

An inspector can be opened by evaluating an expression in the inspector view or by clicking `Inspect` at the bottom of the hover text for a symbol.

There is also an inspector for macros, using the Inspect Macro command. An inspector opens that shows one level of expansion for the macro at the current cursor position. It has a button to refresh the inspector or increment the level of expansion by one. When an expression is sent for evaluation, such as redefining the macro, the expansion is refreshed back to one level.

### Eval Text

At the bottom of each inspector view is a text field that can be used to evaluate expressions.

The value in the inspector can be referenced with `*`. For example, `(format T "~A" *)` will print the current value in the REPL window.

If the result of the expression is not `nil`, a new inspector view will be opened with the value.

## Threads

Forms sent for evaluation by the user are run in their own thread. The threads have names like "N - $/alive/eval" where N is a number. The number is used to try to keep the names unique since getting the underlying system id of the threads isn't as easy as it sounds. If one of them gets stuck in an infinite loop or something, it should be safe to terminate the thread using the "X" action in the threads tree view.

## Commands

### Select S-Expression (Alt+Shift+Up)

Selects the surrounding top level expression for the current cursor position.

### Send To REPL (Alt+Shift+Enter)

Sends selected text to the REPL. If nothing is selected, sends the top level form at the cursor position.

### Load File (Alt+Shift+L)

Load the current file into the REPL.

### Inline Evaluation (Alt+Shift+E)

Evaluate the enclosing form, showing the result inline. If there is a selection, evaluates the selected code.

### Clear Inline Results (Alt+Shift+C)

Clear the inline results.

### REPL History (Alt+Shift+R)

Expressions that are evaluated from the REPL window are added to the history. This command opens a quick pick selector with the history. The most recently used item is at the top, i.e. similar behavior to the Run Tasks command.

### Load ASDF System

Tell the REPL to load an ASDF system. A list of known systems will be given to choose from.

### Open Scratch Pad

Opens a temporary file, `{workspace}/.vscode/alive/scratch.lisp`, that can be used to evaluate expressions, making use of the normal editing features like code completion.

### Macro Expand All

Selected text is passed to macroexpand and expanded in place. If nothing is selected, the form surrounding the cursor is sent.

### Macro Expand 1

Selected text is passed to macroexpand-1 and expanded in place. If nothing is selected, the form surrounding the cursor is sent.

### Inspect Macro

An inspector is opened for the currently selected text. If nothing is selected, the form surrounding the cursor is sent.

## License

Unless otherwise noted, all files are in the Public Domain.

## Release Notes

No actual releases, yet.

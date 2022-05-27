# Alive: The Average Lisp VSCode Environment

An attempt to create a Common Lisp extension for VSCode. It's still a work in progress, though getting better.

The name is partly a self-deprecating take on SLIME's name, but also reflects the goal of the project which is to reach Minimum Viable Product status. For VSCode language extensions, there is a lot that is expected for the bare minimum, including formatting, code completion, syntax highlighting, etc.

The LSP server that the extension relies on currently only supports SBCL. The extension isn't intended to be compiler-specific, but it is at the moment. The server can be found here, https://github.com/nobody-famous/alive-lsp

## Features

-   Syntax highlighting
-   Code completion
-   Code formatter
-   Snippets
-   REPL integration
-   REPL history
-   Inline evaluation

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

## Threads

Forms sent for evaluation by the user are run in their own thread. The threads have names like "N - $/alive/eval" where N is a number. The number is used to try to keep the names unique since getting the underlying system id of the threads isn't as easy as it sounds. If one of them gets stuck in an infinite loop or something, it should be safe to terminate the thread using the "-" action in the threads tree view.

## Commands

### Select S-Expression (Alt+Shift+Up)

Selects the surrounding top level expression for the current cursor position.

### Send To REPL (Alt+Shift+Enter)

Sends selected text to the REPL. If nothing is selected, sends the top level form at the cursor position.

### Load File (Alt+Shift+L)

Load the current file into the REPL.

If alive.remoteWorkspace is set, the path to the file is translated to be relative to the remote directory. This may or may not work well.

### Inline Evaluation (Alt+Shift+E)

Evaluate the enclosing form, showing the result inline. If there is a selection, evaluates the selected code.

### Clear Inline Results (Alt+Shift+C)

Clear the inline results.

### REPL History (Alt+Shift+R)

Expressions that are evaluated from the REPL window are added to the history. This command opens a quick pick selector with the history. The most recently used item is at the top, i.e. similar behavior to the Run Tasks command.

### Load ASDF System

Tell the REPL to load an ASDF system. A list of known systems will be given to choose from.

## License

Unless otherwise noted, all files are in the Public Domain.

## Release Notes

No actual releases, yet.

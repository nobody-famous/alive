# Alive: The Average Lisp VSCode Environment

An attempt to create a Common Lisp extension for VSCode. It's still a work in progress, though some basic things are working. I wouldn't currently recommend it for doing serious work.

The name is partly a self-deprecating take on SLIME's name, but also reflects the goal of the project which is to reach Minimum Viable Product status. For VSCode language extensions, there is a lot that is expected for the bare minimum, including formatting, code completion, syntax highlighting, etc. Being a Lisp environment, having REPL integration is required. Without that, it's not viable.

## Features

* Syntax highlighting
* Code completion
* Code formatter
* Snippets
* REPL integration

## Extension Settings

This extension contributes the following settings:

* `alive.format.indentWidth`: Default indentation width
* `alive.format.closeParenOwnLine`: ['always', 'never', 'multiline'] Specify if close parens can be on their own line.

Syntax highlighting is done using semantic tokens. This is mainly to avoid regex hell. The following symantic tokens are added:
* `error`: Mark code that is after a mismatched paren or quote
* `parenthesis`: Color to use for parenthesis
* `symbol`: Color to use for symbols

![Settings](https://github.com/nobody-famous/alive/raw/master/resource/gifs/settings.gif)

## Snippets

![Snippets](https://github.com/nobody-famous/alive/raw/master/resource/gifs/snippets.gif)

## REPL Integration
Currently, a swank server must be running on the local machine using port 4005.

![Debug](https://github.com/nobody-famous/alive/raw/master/resource/gifs/debug.gif)

## Commands

### Select S-Expression (alt+shift+up)
Selects the surrounding top level expression for the current cursor position.

### Attach To REPL
Connect to the swank server running on localhost:4005.

### Detach From REPL
Disconnect from the swank server.

### Send To REPL (alt+shift+enter)
Sends selected text to the REPL. If nothing is selected, sends the top level form at the cursor position.

### Debug Abort (alt+ctrl+a)
Tells the currently visible debugger to send the abort restart.

### Nth Restart (alt+ctrl+{n})
Tells the currently visible debugger to send the nth restart. For example, alt+ctrl+0 sends restart 0, alt+ctrl+2 sends restart 2, etc.

### Evaluate File (alt+shift+e)
Has the REPL evaluate each expression in the file in order.

## License

Unless otherwise noted, all files are in the Public Domain.

## Release Notes

No actual releases, yet.

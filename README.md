# Alive: The Average Lisp VSCode Environment

An attempt to create a Common Lisp extension for VSCode. It's still a work in progress, though some basic things are working. I wouldn't currently recommend it for doing serious work.

## Features

* Syntax highlighting
* Code completion
* Code formatter
* Snippets
* REPL integration

## Extension Settings

This extension contributes the following settings:

* `common_lisp.format.indentWidth`: Default indentation width
* `common_lisp.format.indentCloseParenStack`: If false, align close stack with furthest parent instead of closest
* `common_lisp.format.closeParenStacked`: ['always', 'never'] Specify whether to stack close parens.
* `common_lisp.format.closeParenOwnLine`: ['always', 'never', 'multiline'] Specify if close parens can be on their own line.
* `common_lisp.format.fixWhitespace`: If true, try to fix white space issues.

workbench.colorCustomizations:
* `common_lisp.default`: Default text
* `common_lisp.keyword`: Keywords
* `common_lisp.control`: Control words, such as 'if', 'and', etc
* `common_lisp.function`: Function names
* `common_lisp.macro`: Macro names
* `common_lisp.special`: Special operators
* `common_lisp.string`: String constants
* `common_lisp.quoted`: Quoted elements
* `common_lisp.package`: Package names
* `common_lisp.symbol`: Symbols
* `common_lisp.id`: Identifiers
* `common_lisp.parameter`: Function parameters
* `common_lisp.comment`: Comments
* `common_lisp.error`: Errors

## Commands

### Select S-Expression (alt+shift+up)
Selects the surrounding top level expression for the current cursor position.

### Attach To REPL
Connect to the swank server running on localhost:4005

### Send To REPL (alt+shift+enter)
Sends selected text to the REPL. If nothing is selected, sends the top level form at the cursor position.

### Debug Abort (alt+ctrl+a)
Tells the currently visible debugger to send the abort restart.

## REPL Integration
Currently, a swank server must be running on the local machine using port 4005.

### Evaluate File (alt+shift+e)
Has the REPL evaluate each expression in the file in order.

## Release Notes

No actual releases, yet.

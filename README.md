# Common Lisp Extension

Language extension to add support for editing Common Lisp files. Very much a work in progress. I wouldn't even call it alpha quality at this point, it's more "works for me, YMMV" quality.

## Features

* Basic syntax highlighting
* Minimal code completion
* Code formatter
* Snippets
* Basic REPL integration

## Extension Settings

This extension contributes the following settings:

* `common_lisp.format.indentWidth`: Default indentation width
* `common_lisp.format.indentCloseParenStack`: If false, align close stack with furthest parent instead of closest
* `common_lisp.format.closeParenStacked`: ['always', 'never'] Specify whether to stack close parens.
* `common_lisp.format.closeParenOwnLine`: ['always', 'never', 'multiline'] Specify if close parens can be on their own line.

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

### Select S-Expression
Selects the surrounding top level expression for the current cursor position. Bound to Alt+Shift+Up.

### Send To REPL
Sends selected text to the REPL. If nothing is selected, sends the top level form at the cursor position.

## REPL Integration
I use SBCL, so that's what is currently supported for the REPL. I decided to write it as a debugger extension, so it behaves like a debugger.

After a launch.json is configured, pressing F5 will start the REPL.

The send to REPL command is bound to Alt+Shift+Enter.

## Known Issues

Code completion only shows built-in words and top level variables. It doesn't show variables defined in let blocks, for example.

Back quoted expressions are entirely colorized as quoted. The plan is to have the unquoted elements be colorized normally.

I'm not a Lisp guru, so there may be plenty of cases that don't work as expected.

## Release Notes

No actual releases, yet.

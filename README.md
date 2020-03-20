# Common Lisp Extension

Language extension to add support for editing Common Lisp files. Very much a work in progress. I wouldn't even call it alpha quality at this point, it's more "works for me, YMMV" quality.

## Features

* Basic syntax highlighting
* Minimal code completion
* Code formatter
* Snippets

## Extension Settings

This extension contributes the following settings:

* `common_lisp.format.indentWidth`: Default indentation width
* `common_lisp.format.indentCloseParenStack`: If false, align close stack with furthest parent instead of closest
* `common_lisp.format.closeParenStacked`: ['always', 'never'] Specify whether to stack close parens.

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
Selects the surrounding top level expression for the current cursor position.

## Known Issues

Code completion only shows built-in words, it doesn't add variables and whatnot from the code, yet.

Back quoted expressions are entirely colorized as quoted. The plan is to have the unquoted elements be colorized normally.

No REPL integration, yet. I want something that works fine without it, so am focusing on that first. REPL support should be an enhancement, not a requirement.

I'm not a Lisp guru, so there may be plenty of cases that don't work as expected.

## Release Notes

No actual releases, yet.

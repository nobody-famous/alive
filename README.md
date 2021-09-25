# Alive: The Average Lisp VSCode Environment

An attempt to create a Common Lisp extension for VSCode. It's still a work in progress, though getting better.

The name is partly a self-deprecating take on SLIME's name, but also reflects the goal of the project which is to reach Minimum Viable Product status. For VSCode language extensions, there is a lot that is expected for the bare minimum, including formatting, code completion, syntax highlighting, etc. Being a Lisp environment, having REPL integration is required. Without that, it's not viable.

## Features

-   Syntax highlighting
-   Code completion
-   Code formatter
-   Jump to definition
-   Snippets
-   REPL integration
-   REPL history
-   Inline evaluation
-   Macro expand
-   Disassemble
-   Inspector
-   Hover Text
-   Rename function args and let bindings
-   Code folding

## Extension Settings

This extension contributes the following settings:

-   `alive.format.indentWidth`: Default indentation width
-   `alive.format.closeParenOwnLine`: ['always', 'never', 'multiline'] Specify if close parens can be on their own line.
-   `alive.format.maxBlankLines`: The maximum number of blank lines to put between top level expressions.
-   `alive.autoLoadOnSave`: If true, load files into the REPL when saved.
-   `alive.autoCompileOnType`: Defaults to true. Have the REPL compile the file as you type, which causes errors/warnings to be indicated.
-   `alive.remoteWorkspace`: Path to the workspace files on the REPL. Used when loading files.
-   `alive.indentMacros`: Defaults to true. When connected to the REPL, indent any form with a &body parameter instead of aligning like a normal list.
-   `alive.swank.startupCommand`: Allows configuration of the command used to start up SBCL with the REPL.  It defaults to an SBCL configuration that works with the Swank downloader.
-   `alive.swank.checkForLatest`: This setting specifies whether VSCode should check for the latest version of Swank every time the REPL is started.  Defaults to false.
-   `alive.swank.downloadUrl`: Specifies the url from which to download a Slime/Swank release.  Defaults to https://api.github.com/repos/slime/slime/releases.

The indentMacros setting was added because, while correct to indent macros, it makes fomatting very slow on large files. Setting it to false turns that behavior off.

Syntax highlighting is done using semantic tokens. This is mainly to avoid regex hell. The following symantic tokens are added:

-   `error`: Mark code that is after a mismatched paren or quote
-   `parenthesis`: Color to use for parenthesis
-   `symbol`: Color to use for symbols

![Settings](https://github.com/nobody-famous/alive/raw/master/resource/gifs/settings.gif)

## Snippets

![Snippets](https://github.com/nobody-famous/alive/raw/master/resource/gifs/snippets.gif)

## REPL Integration

Currently, a swank server must be running on the local machine using port 4005.

![Debug](https://github.com/nobody-famous/alive/raw/master/resource/gifs/debug.gif)

## System Skeleton

![Skeleton](https://github.com/nobody-famous/alive/raw/master/resource/gifs/skeleton.gif)

## Disassemble

![Disassemble](https://github.com/nobody-famous/alive/raw/master/resource/gifs/disassemble.gif)

## Jump To Definition

In order for jump to definition to work, the files need to be loaded into the REPL using the Load File (Alt+Shift+L) command, ASDF, or whatever else works.

## Inspector

The inspector will ask for a form to inspect, defaulting to the current token or current selection.

![Inspector](https://github.com/nobody-famous/alive/raw/master/resource/gifs/inspect.gif)

### Inspector Commands

-   Ctrl+P - Previous Item
-   Ctrl+N - Next Item
-   Ctrl+R - Refresh Item
-   Ctrl+Q - Quit

## Hover Text

Will provide documentation from the REPL for the symbol under the cursor.

Note that the inline result feature uses a hover to display results, so those results will display if they have not been cleared by editing the document or using the Clear Inline Results command (Alt+Shift+C).

## Commands

### Select S-Expression (Alt+Shift+Up)

Selects the surrounding top level expression for the current cursor position.

### Start REPL And Attach

Downloads and installs a swank server, runs it in your image, and connects to it.

### Attach To REPL

Connect to a swank server. Will prompt for the a host:port string to connect to.

### Detach From REPL

Disconnect from the swank server.

### Send To REPL (Alt+Shift+Enter)

Sends selected text to the REPL. If nothing is selected, sends the top level form at the cursor position.

### Debug Abort (Alt+Ctrl+A)

Tells the currently visible debugger to send the abort restart.

### Nth Restart (Alt+Ctrl+{N})

Tells the currently visible debugger to send the nth restart. For example, alt+ctrl+0 sends restart 0, alt+ctrl+2 sends restart 2, etc.

### Load File (Alt+Shift+L)

Load the current file into the REPL.

If alive.remoteWorkspace is set, the path to the file is translated to be relative to the remote directory. This may or may not work well.

### Inline Evaluation (Alt+Shift+E)

Evaluate the enclosing form, showing the result inline. If there is a selection, evaluates the selected code.

### Clear Inline Results (Alt+Shift+C)

Clear the inline results.

### REPL History (Alt+Shift+R)

Expressions that are evaluated from the REPL window are added to the history. This command opens a quick pick selector with the history. The most recently used item is at the top, i.e. similar behavior to the Run Tasks command.

### Compile File

Tell the REPL to compile the current file. A fasl file is generated and any errors or warnings are marked in the editor.

### Compile ASDF System

Tell the REPL to compile an ASDF system. A list of known systems will be given to choose from. Files that have errors as a result of the compile will be marked.

### Load ASDF System

Tell the REPL to load an ASDF system. A list of known systems will be given to choose from. Files that have errors as a result of the load will be marked.

### System Skeleton

If the current directory is empty, creates an ASDF system skeleton.

### Macro Expand

Expand the macro at the current cursor position. Uses macroexpand-1.

### Macro Expand All

Expand the macro at the current cursor position. Uses macroexpand.

### Disassemble

Disassemble the current top level form. Assumes the form is defining a function, or something similar, and uses the second element as the name.

## License

Unless otherwise noted, all files are in the Public Domain.

## Release Notes

No actual releases, yet.

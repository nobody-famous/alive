# Alive Development

Notes on making changes to the Alive codebase.

## Basic Knowledge

Alive is primarily constructed using Lisp and TypeScript.
Basic knowledge of both languages is necessary.

The Alive codebase is hosted on
[github](https://github.com/nobody-famous/alive).
Basic understanding of `git` and `github` usage
including branches and forking is necessary.

### VSCode Extension Development

Developing extensions for VSCode is quite involved.
Start learning with the
[Extension API](https://code.visualstudio.com/api) page.

## Startup

### Install Tools

Install the following tools:
* Steel Bank Common Lisp (SBCL)
* JavaScript
* TypeScript

You should be able to execute the following programs:
* `git` (or whatever tool you prefer)
* `sbcl` SBCL REPL
* `npm` JavaScript package manager
* `tsc` TypeScript compiler

### Acquiring the Code

Alive development is done on a fork of the repository.
Pull Requests (PRs) are made from a branch in the fork
into the Alive repository.

* [Create a fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
  of the Alive code into your own `github` account.
* [Clone your fork](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)
  onto your development machine.

### Inital Steps

After changing directory into the cloned development directory there are a few first steps.

#### Install JavaScript Modules

Run the command
```
npm install
```
in order to acquire necessary JavaScript modules
specified in the `package.json` file.

Failing to do this will result in hundreds of errors
as the Alive code will not be able to link to
the VSCode Extension API.

A side effect of this step is the incrementing of a version number
in the `package-lock.json` file.
This is an unnecessary change and should not be propagated into the code.

Execute
```
git diff package-lock.json
```
(or whatever command or tool you prefer) to make sure that the version number is the _only_ thing incremented.
The `diff` should look something like
```
{
     "name": "alive",
-    "version": "0.3.19",
+    "version": "0.3.20",
     "lockfileVersion": 2,
     "requires": true,
     "packages": {
         "": {
             "name": "alive",
-            "version": "0.3.19",
+            "version": "0.3.20",
             "dependencies": {
                 "axios": "^0.21.4",
                 "node-stream-zip": "^1.15.0",
```
though the version numbers may be different.

If these are the _only_ changes run
```
git checkout package-lock.json
```
(or whatever command or tool you prefer) to revert the changes.

_If there are other changes_ then something bad happened.
It's probably better to not revert the change to `package-lock.json`.
Beyond that you'll probably have to dig some.

#### Verify Build

At this point it should be possible to execute
```
tsc -p ./tsconfig.build.json
```
without any errors.

_If there are errors_ something bad happened.
Beyond that you'll probably have to dig some.

## Development and Debugging

### Development Branch

Always work on a branch via:
```
git checkout -b <branch-name>
```
(or whatever command or tool you prefer).

### Development

Make whatever changes seem appropriate on your development branch.

Use VSCode for development in order to get the debugger support
for VSCode extension work.

### Debugging

The simplest way to launch the debugger is with the `F5` key.
This should bring up another VSCode window with the modified Alive extension.
Test the extension within this window.

Standard VSCode debugging features (e.g. breakpoints, stepping through code) are available.

You can also start the debugger from the `Run and Debug` panel.
When this is showing there will be a small green triangle outline at the top of the panel which will do the same thing as the `F5` key.

## Submitting Pull Requests

After your changes are working properly it is time to submit a PR from your development branch.
[Submit the PR from your fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork)
to the [Alive repository](https://github.com/nobody-famous/alive) on `github`.

# Protocol Description

It's a basic text based protocol that sends Lisp expressions back and forth.

## Messages

Each message is a string consisting of 6 hex digits followed by Lisp text.

The digits give the total length of the Lisp text.

```
000005(cmd)
```

## Request

## Response

Each response is a list consisting of a response type followed by the data for the response.

### Response Types

#### :return

```
(:return <plist> <msg id?>)
```
If the message ID is present, it specifies which request the response is for.

Server notifications are return responses without a message id or the id is nil.

#### :debug

```
(:debug <thread id> <frame id> <reason> <restarts> <frames> <command id list>)
```

- reason
    - List of strings, where each string is a line of output
    - Final entry is nil

#### :debug-activate

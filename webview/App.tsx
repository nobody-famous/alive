import React, { useEffect, useRef, useState, useCallback } from 'react'
import { throttle } from './utils'

declare const acquireVsCodeApi: () => {
    postMessage: (message: any) => void
}

interface ReplOutputItem {
    type: string
    text: string
    pkgName?: string
}

interface VSCodeMessage {
    command: string
    text?: string
}

export default function AliveREPL() {
    const [vscodeApi, setVscodeApi] = useState<ReturnType<typeof acquireVsCodeApi> | null>(null)

    const [packageName, setPackageName] = useState('')
    const [inputText, setInputText] = useState('')
    const [outputItems, setOutputItems] = useState<ReplOutputItem[]>([])
    
    // Track if REPL has been cleared since initialization
    const [hasBeenCleared, setHasBeenCleared] = useState(false)
    // Store version info for output restoration
    const versionInfoRef = useRef<ReplOutputItem | null>(null)
    
    const scrollReplRef = useRef<Function | null>(null)
    const replInputRef = useRef<HTMLInputElement>(null)
    const replOutputRef = useRef<HTMLDivElement>(null)
    const calledOnce = useRef(false)

    const scrollReplView = useCallback(() => {
        if (replOutputRef.current) {
            replOutputRef.current.scrollTop = replOutputRef.current.scrollHeight
        }
    }, [])

    // Initialize the REPL with VSCode API and initial data
    const initializeRepl = useCallback(() => {
        if (calledOnce.current) return
        calledOnce.current = true

        // VSCode instance can be acquired only once
        const api = acquireVsCodeApi()
        setVscodeApi(api)

        // Scroll the output view with a delay
        scrollReplRef.current = throttle(() => scrollReplView(), 80)

        // Get initial package name and extension version from root element
        const rootElement = document.getElementById('root')
        if (rootElement) {
            const initPackage = rootElement.getAttribute('data-init-package')
            if (initPackage) {
                setPackageName(initPackage)
            }

            const extensionVersion = rootElement.getAttribute('data-extension-version')
            if (extensionVersion) {
                const versionInfo: ReplOutputItem = { 
                    type: 'output', 
                    text: `; Alive REPL (v${extensionVersion})` 
                }
                versionInfoRef.current = versionInfo
                setOutputItems([versionInfo])
            }
        }
        
        // Tells LispRepl that the webview is ready to receive old state to be restored
        setTimeout(() => {
            api.postMessage({ command: 'webviewReady' })
        })
    }, [scrollReplView])

    // Handle messages from LispRepl
    const messageHandler = useCallback((event: MessageEvent) => {
        const data = event.data;

        switch (data.type) {
            case 'setInput':
                setInputText(data.text);
                break;
            case 'clearInput':
                setInputText('');
                break;
            case 'restoreState':
                if (!data.hasBeenCleared && versionInfoRef.current) {
                    setOutputItems([versionInfoRef.current, ...data.items]);
                } else {
                    setOutputItems(data.items);
                }

                scrollReplRef.current?.();
                break;
            case 'appendOutput':
                setOutputItems(prevOutputItems => [...prevOutputItems, data.obj]);
                scrollReplRef.current?.();
                break;
            case 'clear':
                setOutputItems([]);
                setHasBeenCleared(true);
                break;
            case 'setPackage':
                setPackageName(data.name);
                replInputRef.current?.focus();
                break;
            default:
                break;
        }
    }, [hasBeenCleared]);

    useEffect(() => {
        initializeRepl()
    }, [initializeRepl])

    useEffect(() => {
        window.addEventListener('message', messageHandler)
        return () => window.removeEventListener('message', messageHandler)
    }, [messageHandler])

    const sendMessage = useCallback((message: VSCodeMessage) => {
        vscodeApi?.postMessage(message)
    }, [vscodeApi])

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault()
        sendMessage({ command: 'eval', text: inputText })
        setInputText('')
    }

    const handleKeyUp = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            sendMessage({ command: 'historyUp' })
        } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            sendMessage({ command: 'historyDown' })
        }
    }

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
        }
    }

    const onPackageClick = () => {
        sendMessage({ command: 'requestPackage' })
    }

    return (
        <div className="repl-container">
            <div className="repl-output" ref={replOutputRef}>
                {outputItems.map(({ text, type, pkgName }, idx) => (
                    <div key={`repl-output-container-${idx}`} className={`repl-${type}-container`}>
                        <div className="repl-output-item">
                            {(type === 'input' && pkgName) &&
                                <span className="repl-output-package">{pkgName}&gt; </span>}
                            {text}
                        </div>
                    </div>
                ))}
            </div>
            <div className="repl-input-text-box">
                <div className="repl-input-label" onClick={onPackageClick}>
                    {packageName}&gt;
                </div>
                <form className="repl-input-form" onSubmit={handleSubmit}>
                    <input
                        className="repl-input-text"
                        ref={replInputRef}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyUp={handleKeyUp}
                        onKeyDown={handleKeyDown}
                    />
                </form>
            </div>
        </div>
    )
}

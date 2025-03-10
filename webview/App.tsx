import React, { useEffect, useRef, useState, useCallback } from 'react'
import { throttle } from './utils'

declare const acquireVsCodeApi: any

interface ReplOutputItem {
    type: string
    text: string
    pkgName?: string
}

export default function AliveREPL() {
    const [vscodeApi, setVscodeApi] = useState<any>(null)

    const [packageName, setPackageName] = useState('')
    const [inputText, setInputText] = useState('')
    const [outputItems, setOutputItems] = useState<ReplOutputItem[]>([])

    const scrollReplRef = useRef<Function>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const replOutputRef = useRef<HTMLDivElement>(null)
    const calledOnce = useRef(false)

    const messageHandler = useCallback((event: MessageEvent) => {
        const data = event.data;

        switch (data.type) {
            case 'setInput':
                setInputText(data.text);
                break;
            case 'clearInput':
                setInputText('');
                break;
            case 'setOutput':
                setOutputItems(data.items);
                scrollReplRef.current?.();
                break;
            case 'appendOutput':
                setOutputItems(prevOutputItems => [...prevOutputItems, data.obj]);
                scrollReplRef.current?.();
                break;
            case 'clear':
                setOutputItems([]);
                break;
            case 'setPackage':
                setPackageName(data.name);
                inputRef.current?.focus();
                break;
            default:
                break;
        }
    }, []); // Empty array makes the handler stable

    useEffect(() => {
        if (calledOnce.current) return
        calledOnce.current = true

        // VSCode instance can be acquired only once
        setVscodeApi(acquireVsCodeApi())

        // Scroll the output view with a delay
        scrollReplRef.current = throttle(() => scrollReplView(), 80)

        // Get initial package name and extension version from root element
        const rootElement = document.getElementById('root');
        if (rootElement) {
            const initPackage = rootElement.getAttribute('data-init-package')
            if (initPackage) {
                setPackageName(initPackage)
            }

            const extensionVersion = rootElement.getAttribute('data-extension-version')
            if (extensionVersion) {
                console.log("inside")
                setOutputItems((prevOutputItems) => {
                    const versionInfo = `; Alive REPL (v${extensionVersion})`
                    return [...prevOutputItems, { type: 'output', text: versionInfo }]
                })
            }
        }
    }, [])

    useEffect(() => {
        window.addEventListener('message', messageHandler)
        return () => window.removeEventListener('message', messageHandler)
    }, [messageHandler])

    const handleSubmit = (event) => {
        event.preventDefault()
        vscodeApi.postMessage({ command: 'eval', text: inputText })
        setInputText('')
    }

    const handleKeyUp = (event) => {
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            vscodeApi.postMessage({ command: 'historyUp' })
        } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            vscodeApi.postMessage({ command: 'historyDown' })
        }
    }

    const handleKeyDown = (event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
        }
    }

    const scrollReplView = () => {
        if (replOutputRef.current) {
            replOutputRef.current.scrollTop = replOutputRef.current.scrollHeight
        }
    }

    const onPackageClick = () => {
        vscodeApi.postMessage({ command: 'requestPackage' })
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
                        ref={inputRef}
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

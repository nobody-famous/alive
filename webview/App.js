import { useEffect, useRef, useState } from 'react'
import { throttle } from './utils'

export default function AliveREPL() {
    const [vscodeApi, setVscodeApi] = useState(null)
    const executeOnce = useRef(null)

    const [packageName, setPackageName] = useState('')
    const [inputText, setInputText] = useState('')
    const [newOutputItem, setNewOutputItem] = useState(null)
    const [outputItems, setOutputItems] = useState([])

    const inputRef = useRef(null)
    const replOutputRef = useRef(null)

    useEffect(() => {
        setVscodeApi(acquireVsCodeApi())

        // When new output is added, scroll with a delay of 100ms
        executeOnce.current = throttle(() => scrollReplView(), 100)
    }, [])

    useEffect(() => {
        const messageHandler = (event) => {
            const data = event.data

            switch (data.type) {
                case 'setInput':
                    setInputText(data.text)
                    break
                case 'appendOutput':
                    setNewOutputItem(data.obj)
                    break
                case 'setPackage':
                    setPackageName(data.name)
                    inputRef.current?.focus()
                    break
                case 'scrollReplView':
                    scrollReplView()
                    break
                case 'clear':
                    setOutputItems([])
                    break;
                case 'clearInput':
                    setInputText('')
                    break
                default:
                    break
            }
        }

        window.addEventListener('message', messageHandler)
        return () => window.removeEventListener('message', messageHandler)
    }, [])

    useEffect(() => {
        if (newOutputItem) {
            setOutputItems([...outputItems, newOutputItem])
            setNewOutputItem(null)
            executeOnce.current()
        }
    }, [newOutputItem])

    const handleSubmit = (event) => {
        event.preventDefault()
        vscodeApi.postMessage({ command: 'eval', text: inputText })
        setInputText('')
    }

    const strToHtml = (str) => {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
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
                                <span className="repl-output-package">{strToHtml(pkgName)}&gt; </span>}
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

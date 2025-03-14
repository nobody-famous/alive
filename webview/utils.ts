export function throttle(callback: Function, delay: number): Function {
    let executed = false

    return function (...args: any) {
        if (!executed) {
            executed = true

            setTimeout(() => {
                callback(...args)
                executed = false
            }, delay)
        }
    }
}
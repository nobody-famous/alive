export function throttle(callback, delay) {
    let executed = false

    return function (...args) {
        if (!executed) {
            executed = true

            setTimeout(() => {
                callback(...args)
                executed = false
            }, delay)
        }
    }
}
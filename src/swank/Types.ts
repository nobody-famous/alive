export type StringMap = { [index: string]: unknown }

export interface Encoding {
    coding_systems: StringMap
}

export interface ConnInfo {
    pid?: number
    encoding?: Encoding
    impl?: StringMap
    machine?: StringMap
    package?: StringMap
    style?: string
    features?: any[]
    modules?: any[]
    version?: string
    lisp_implementation?: StringMap
}

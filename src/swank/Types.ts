export type StringMap = { [index: string]: unknown }

export interface Encoding {
    coding_systems: StringMap
}

export interface PkgInfo {
    name: string
    prompt: string
}

export interface ConnInfo {
    pid?: number
    encoding?: Encoding
    impl?: StringMap
    machine?: StringMap
    package?: PkgInfo
    style?: string
    features?: any[]
    modules?: any[]
    version?: string
    lisp_implementation?: StringMap
}

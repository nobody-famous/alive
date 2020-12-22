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

export interface Restart {
    name: string
    desc: string
}

export interface Frame {
    num: number
    desc: string
    opts?: FrameOption[]
}

export interface FrameOption {
    name: string
    value: string | boolean
}

export interface FrameVariable {
    name: string
    id: number
    value: string
}

export interface InspectContentAction {
    action: string
    display: string
    index: number
}

export interface InspectContent {
    display: Array<InspectContentAction | string>
}

export interface InspectInfo {
    title: string
    id: number
    content: InspectContent
}

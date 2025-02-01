import * as vscode from 'vscode'
import { isArray, isBoolean, isFiniteNumber, isObject, isString } from './vscode/Guards'

export interface PackageTreeConfig {
    separator: string | Array<string> | null
}

export interface FormatConfig {
    indentWidth: number
}

export interface InstallConfig {
    path: string | undefined
}

export interface RemoteConfig {
    host: string | null
    port: number | null
}

export interface LSPConfig {
    install: InstallConfig
    downloadUrl: string | undefined
    remote: RemoteConfig
    startCommand: Array<string>
}

export interface AliveConfig {
    enableDiagnostics: boolean
    packageTree: PackageTreeConfig
    format: FormatConfig
    lsp: LSPConfig
}

export const readAliveConfig = (): AliveConfig => {
    const cfg: AliveConfig = {
        enableDiagnostics: true,
        packageTree: {
            separator: null,
        },
        format: {
            indentWidth: 2,
        },
        lsp: {
            install: {
                path: undefined,
            },
            downloadUrl: undefined,
            remote: {
                host: null,
                port: null,
            },
            startCommand: [],
        },
    }

    const aliveConfig = vscode.workspace.getConfiguration('alive')

    readConfigValues(aliveConfig, cfg)

    return cfg
}

const readConfigValues = (userCfg: vscode.WorkspaceConfiguration, cfg: AliveConfig) => {
    if (isBoolean(userCfg.enableDiagnostics)) {
        cfg.enableDiagnostics = userCfg.enableDiagnostics
    }

    if (isObject(userCfg.lsp)) {
        readLspValues(userCfg.lsp, cfg)
    }

    if (isObject(userCfg.packageTree)) {
        readPackageTreeValues(userCfg.packageTree, cfg)
    }
}

const readPackageTreeValues = (packageTree: Record<string, unknown>, cfg: AliveConfig) => {
    if (isString(packageTree.separator) || isArray(packageTree.separator, isString)) {
        cfg.packageTree.separator = packageTree.separator
    }
}

const readLspValues = (lsp: Record<string, unknown>, cfg: AliveConfig) => {
    if (isObject(lsp.install)) {
        readLspInstallValues(lsp.install, cfg)
    }

    if (isString(lsp.downloadUrl)) {
        cfg.lsp.downloadUrl = lsp.downloadUrl
    }

    if (isObject(lsp.remote)) {
        readLspRemoteValues(lsp.remote, cfg)
    }

    if (isArray(lsp.startCommand, isString)) {
        cfg.lsp.startCommand = lsp.startCommand
    }
}

const readLspInstallValues = (install: Record<string, unknown>, cfg: AliveConfig) => {
    if (isString(install.path)) {
        cfg.lsp.install.path = install.path
    }
}

const readLspRemoteValues = (remote: Record<string, unknown>, cfg: AliveConfig) => {
    if (isString(remote.host)) {
        cfg.lsp.remote.host = remote.host
    }

    if (isFiniteNumber(remote.port)) {
        cfg.lsp.remote.port = remote.port
    }
}

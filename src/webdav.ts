import * as vscode from 'vscode'
import { createClient } from 'webdav'
import { normalizeState, readState, writeState } from './state'
import type { StateShape } from './types'

const WEBDAV_KEY = 'apiTester.webdavConfig'

export async function handleBackup(state: StateShape, payload: any) {
  const { url, username, password, path } = payload
  const dir = (path || '/apis-tester-backup').replace(/\/$/, '')
  const filename = 'api-tester-backup.json'
  const fullPath = `${dir || ''}/${filename}`
  const snapshot = normalizeState(state)
  try {
    const client = createClient(url, { username, password })
    if (dir && dir !== '/') {
      await client.createDirectory(dir, { recursive: true }).catch(() => {})
    }
    await client.putFileContents(fullPath, JSON.stringify(snapshot, null, 2), { overwrite: true })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) }
  }
}

export async function handleRestore(context: vscode.ExtensionContext, payload: any) {
  const { url, username, password, path } = payload
  const dir = (path || '/apis-tester-backup').replace(/\/$/, '')
  const filename = 'api-tester-backup.json'
  const fullPath = `${dir || ''}/${filename}`
  try {
    const client = createClient(url, { username, password })
    let data
    try {
      data = await client.getFileContents(fullPath, { format: 'text' })
    } catch (e) {
      const oldDir = '/api-tester-backup'.replace(/\/$/, '')
      const oldFullPath = `${oldDir || ''}/${filename}`
      try {
        data = await client.getFileContents(oldFullPath, { format: 'text' })
      } catch {
        throw e
      }
    }
    const parsed: StateShape = normalizeState(JSON.parse(String(data)))
    writeState(context, parsed)
    return { success: true, state: parsed }
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) }
  }
}

export async function backupFromCommand(context: vscode.ExtensionContext) {
  const cfg = await ensureWebdavConfig(context)
  if (!cfg) return
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'WebDAV 备份中...' }, async () => {
    const res = await handleBackup(readState(context), cfg)
    if (res.success) vscode.window.showInformationMessage('备份成功')
    else vscode.window.showErrorMessage(`备份失败: ${res.error}`)
  })
}

export async function restoreFromCommand(context: vscode.ExtensionContext, onRestored?: (state: StateShape) => void) {
  const cfg = await ensureWebdavConfig(context)
  if (!cfg) return
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'WebDAV 恢复中...' }, async () => {
    const res = await handleRestore(context, cfg)
    if (res.success) {
      vscode.window.showInformationMessage('恢复成功')
      if (res.state) {
        onRestored?.(res.state)
      }
    } else {
      vscode.window.showErrorMessage(`恢复失败: ${res.error}`)
    }
  })
}

function getWebdavConfigFromSettings(): any | undefined {
  const config = vscode.workspace.getConfiguration('apiTester').get<any>('webdav') as any
  const url = config?.url?.trim()
  const username = config?.username?.trim()
  const password = config?.password ?? ''
  const path = config?.path?.trim() || '/apis-tester-backup'
  if (!url || !username) return undefined
  return { url, username, password, path }
}

function resolveWebdavConfig(context: vscode.ExtensionContext): any | undefined {
  const fromSettings = getWebdavConfigFromSettings()
  if (fromSettings) return fromSettings

  const stored = context.globalState.get<any>(WEBDAV_KEY)
  const url = stored?.url?.trim()
  const username = stored?.username?.trim()
  const password = stored?.password ?? ''
  const path = stored?.path?.trim() || '/api-tester-backup'
  if (!url || !username) return undefined
  return { url, username, password, path }
}

async function ensureWebdavConfig(context: vscode.ExtensionContext): Promise<any | undefined> {
  const cfg = resolveWebdavConfig(context)
  if (cfg) return cfg
  const action = 'Open Settings'
  const pick = await vscode.window.showWarningMessage('WebDAV config is missing, open settings to configure?', action)
  if (pick === action) {
    await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bmqy.apis-tester')
  }
  return undefined
}

export function triggerAutoBackup(context: vscode.ExtensionContext, state: StateShape) {
  const cfg = getWebdavConfigFromSettings()
  const auto = vscode.workspace.getConfiguration('apiTester').get<boolean>('webdav.autoBackup', false)
  if (!auto || !cfg) return
  handleBackup(state, cfg).then((res) => {
    if (res.success) {
      vscode.window.showInformationMessage('已自动同步到 WebDAV')
    } else {
      vscode.window.showErrorMessage(`自动同步失败: ${res.error}`)
    }
  })
}

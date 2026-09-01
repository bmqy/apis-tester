import * as vscode from 'vscode'
import { generateId } from './ids'
import { exportData, importData } from './importExport'
import { activeRequests, handleRequest, handleRequestWithFiles, wsConnections } from './request'
import { getSidebarViewHtml } from './sidebarHtml'
import { readState, writeState } from './state'
import type { ApiGroup, ApiRequest, StateShape } from './types'
import { backupFromCommand, handleBackup, handleRestore, restoreFromCommand, triggerAutoBackup } from './webdav'
import { getWebviewHtml } from './webviewHtml'

let sidebarViewProviderRef: SidebarViewProvider | null = null
const panelRefs = new Set<vscode.WebviewPanel>()
// 记录每个 API 已打开的面板，避免重复标签
const panelByApiId = new Map<string, vscode.WebviewPanel>()

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarViewProvider(context)
  sidebarViewProviderRef = sidebarProvider

  context.subscriptions.push(
    vscode.commands.registerCommand('apiTester.openPanel', (apiId?: string | { apiId?: string | null; groupId?: string | null } | null) => openPanel(context, apiId ?? null)),
    vscode.commands.registerCommand('apiTester.newApi', () => openPanel(context, null)),
    vscode.commands.registerCommand('apiTester.backupWebdavCommand', () => backupFromCommand(context)),
    vscode.commands.registerCommand('apiTester.restoreWebdavCommand', () => restoreFromCommand(context, broadcastState)),
    vscode.commands.registerCommand('apiTester.openSettings', () => openExtensionSettings()),
    vscode.commands.registerCommand('apiTester.exportData', () => exportData(context)),
    vscode.commands.registerCommand('apiTester.importData', () => importData(context, (state) => {
      broadcastState(state)
      triggerAutoBackup(context, state)
    })),
    vscode.window.registerWebviewViewProvider('apiTesterView', sidebarProvider),
  )
}

export function deactivate() {
  // no-op
}

function openPanel(context: vscode.ExtensionContext, selected?: string | { apiId?: string | null; groupId?: string | null } | null) {
  const selectedApiId = typeof selected === 'string' || selected === null || selected === undefined ? (selected ?? null) : (selected.apiId ?? null)
  const selectedGroupId = typeof selected === 'object' && selected !== null && 'groupId' in selected ? (selected.groupId ?? null) : null

  if (typeof selectedApiId === 'string' && selectedApiId) {
    const existing = panelByApiId.get(selectedApiId)
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active)
      existing.webview.postMessage({
        type: 'state',
        payload: readState(context),
        selectedApiId,
        selectedGroupId,
      })
      return
    }
  }

  const panel = vscode.window.createWebviewPanel('apiTester.panel', 'APIs Tester', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true })

  let panelApiId: string | null = selectedApiId ?? null

  // Set initial title if opening an existing API
  if (panelApiId) {
    const state = readState(context)
    const api = state.apis.find((a) => a.id === panelApiId)
    if (api && api.name) {
      panel.title = `APIS-TESTER: ${api.name}`
    }
  }

  panelRefs.add(panel)
  if (panelApiId) panelByApiId.set(panelApiId, panel)
  panel.onDidDispose(() => {
    panelRefs.delete(panel)
    if (panelApiId) panelByApiId.delete(panelApiId)
  })

  panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri)

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'init': {
        panel.webview.postMessage({
          type: 'state',
          payload: readState(context),
          selectedApiId,
          selectedGroupId,
        })
        break
      }
      case 'saveApi': {
        const state = readState(context)
        const idx = state.apis.findIndex((a) => a.id === message.payload.id)
        if (idx >= 0) state.apis[idx] = message.payload
        else state.apis.push(message.payload)
        writeState(context, state)
        broadcastState(state)
        triggerAutoBackup(context, state)
        if (panelApiId && panelApiId !== message.payload.id) {
          panelByApiId.delete(panelApiId)
        }
        panelApiId = message.payload.id
        panel.title = `APIS-TESTER: ${message.payload.name || 'Untitled API'}`
        if (panelApiId) panelByApiId.set(panelApiId, panel)
        break
      }
      case 'deleteApi': {
        const state = readState(context)
        const target = state.apis.find((a) => a.id === message.payload.id)
        const nextApis = state.apis.filter((a) => a.id !== message.payload.id)
        let nextGroups = state.groups
        if (target?.groupId) {
          const remain = nextApis.some((a) => a.groupId === target.groupId)
          if (!remain) {
            nextGroups = nextGroups.filter((g) => g.id !== target.groupId)
          }
        }
        const nextState: StateShape = { apis: nextApis, groups: nextGroups }
        writeState(context, nextState)
        broadcastState(nextState)
        triggerAutoBackup(context, nextState)
        if (panelApiId === message.payload.id) {
          if (panelApiId) panelByApiId.delete(panelApiId)
          panelApiId = null
        }
        break
      }
      case 'saveGroup': {
        const state = readState(context)
        const group = message.payload as ApiGroup
        const idx = state.groups.findIndex((g) => g.id === group.id)
        if (idx >= 0) state.groups[idx] = group
        else state.groups.push(group)
        writeState(context, state)
        broadcastState(state)
        triggerAutoBackup(context, state)
        break
      }
      case 'deleteGroup': {
        const state = readState(context)
        const targetId = (message.payload as ApiGroup).id
        state.groups = state.groups.filter((g) => g.id !== targetId)
        state.apis = state.apis.map((api) => (api.groupId === targetId ? { ...api, groupId: null } : api))
        writeState(context, state)
        broadcastState(state)
        triggerAutoBackup(context, state)
        break
      }
      case 'sendRequest': {
        const result = await handleRequest(message.payload as ApiRequest, panel)
        panel.webview.postMessage({ type: 'response', payload: result })
        break
      }
      case 'sendRequestWithFiles': {
        const result = await handleRequestWithFiles(message.payload.api as ApiRequest, message.payload.filePaths)
        panel.webview.postMessage({ type: 'response', payload: result })
        break
      }
      case 'stopRequest': {
        const activeReq = activeRequests.get(panel)
        if (activeReq) {
          if (activeReq.type === 'ws') {
            // 停止 WebSocket 连接
            const conn = wsConnections.get(activeReq.id)
            if (conn) {
              conn.isStopped = true // 标记为已停止
              // 移除所有事件监听器，防止消息继续处理
              conn.ws.removeAllListeners()
              // 立即强制终止连接
              conn.ws.close(1000, 'User stopped')
              clearTimeout(conn.timeout)
              wsConnections.delete(activeReq.id)
            }
          } else if (activeReq.type === 'http' && activeReq.controller) {
            // 中止 HTTP 请求
            activeReq.controller.abort()
          }
          activeRequests.delete(panel)
        }
        break
      }
      case 'backupWebdav': {
        const result = await handleBackup(readState(context), message.payload)
        panel.webview.postMessage({ type: 'backupResult', payload: result })
        break
      }
      case 'restoreWebdav': {
        const result = await handleRestore(context, message.payload)
        panel.webview.postMessage({ type: 'restoreResult', payload: result })
        break
      }
      default:
        break
    }
  })
}

async function openExtensionSettings() {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:bmqy.apis-tester')
}

function broadcastState(state: StateShape) {
  panelRefs.forEach((p) => {
    p.webview.postMessage({ type: 'state', payload: state })
  })
  sidebarViewProviderRef?.pushState(state)
}

class SidebarViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}
  private view?: vscode.WebviewView

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this.view = webviewView
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) this.view = undefined
    })

    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this.getViewHtml(webviewView.webview)

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'requestState':
          webviewView.webview.postMessage({ type: 'state', payload: readState(this.context) })
          break
        case 'action':
          if (msg.action === 'refresh') {
            webviewView.webview.postMessage({ type: 'state', payload: readState(this.context) })
          } else if (msg.action === 'settings') {
            await openExtensionSettings()
          } else if (msg.action === 'new') {
            await vscode.commands.executeCommand('apiTester.newApi')
          }
          break
        case 'backup':
          await backupFromCommand(this.context)
          break
        case 'restore':
          await restoreFromCommand(this.context, broadcastState)
          break
        case 'deleteApi': {
          const state = readState(this.context)
          const target = state.apis.find((a) => a.id === msg.apiId)
          const nextApis = state.apis.filter((a) => a.id !== msg.apiId)
          let nextGroups = state.groups
          if (target?.groupId) {
            const remain = nextApis.some((a) => a.groupId === target.groupId)
            if (!remain) {
              nextGroups = nextGroups.filter((g) => g.id !== target.groupId)
            }
          }
          const next: StateShape = { apis: nextApis, groups: nextGroups }
          writeState(this.context, next)
          this.pushState(next)
          broadcastState(next)
          triggerAutoBackup(this.context, next)
          panelByApiId.delete(msg.apiId)
          break
        }
        case 'copyApi': {
          const state = readState(this.context)
          const target = state.apis.find((a) => a.id === msg.apiId)
          if (target) {
            const { lastResponse, ...copySource } = target
            const copiedApi: ApiRequest = {
              ...copySource,
              id: generateId(),
              name: `${target.name || target.url} - 副本`,
            }
            const next: StateShape = { ...state, apis: [...state.apis, copiedApi] }
            writeState(this.context, next)
            this.pushState(next)
            broadcastState(next)
            triggerAutoBackup(this.context, next)
            // 复制完成后打开新API的编辑面板
            await vscode.commands.executeCommand('apiTester.openPanel', copiedApi.id)
          }
          break
        }
        case 'deleteGroup': {
          const state = readState(this.context)
          const next: StateShape = {
            groups: state.groups.filter((g) => g.id !== msg.groupId),
            apis: state.apis.map((api) => (api.groupId === msg.groupId ? { ...api, groupId: null } : api)),
          }
          writeState(this.context, next)
          this.pushState(next)
          broadcastState(next)
          triggerAutoBackup(this.context, next)
          break
        }
        case 'openApi':
          await vscode.commands.executeCommand('apiTester.openPanel', msg.apiId ?? null)
          break
        case 'newInGroup':
          await vscode.commands.executeCommand('apiTester.openPanel', { apiId: null, groupId: msg.groupId ?? null })
          break
        default:
          break
      }
    })

    webviewView.webview.postMessage({ type: 'state', payload: readState(this.context) })
  }

  pushState(state?: StateShape) {
    const payload = state ?? readState(this.context)
    this.view?.webview.postMessage({ type: 'state', payload })
  }

  private getViewHtml(webview: vscode.Webview) {
    return getSidebarViewHtml(webview)
  }
}


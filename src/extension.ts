import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import FormData from 'form-data'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { createClient } from 'webdav'
import WebSocket from 'ws'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'WebSocket'

interface ApiRequest {
  id: string
  name: string
  url: string
  method: HttpMethod
  groupId: string | null
  headers: Record<string, string>
  params?: Record<string, string>
  cookies?: Record<string, string>
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'custom'
    bearer?: string
    username?: string
    password?: string
    custom?: string
  }
  bodyType: 'json' | 'form-data' | 'urlencoded' | 'raw'
  body: any
  proxyEnabled?: boolean
  proxyHost?: string
  proxyPort?: number
  proxyUsername?: string
  proxyPassword?: string
  isWebSocket?: boolean
  wsMessage?: string
}

interface ApiGroup {
  id: string
  name: string
}

interface StateShape {
  apis: ApiRequest[]
  groups: ApiGroup[]
}

const STATE_KEY = 'apiTester.state'
const WEBDAV_KEY = 'apiTester.webdavConfig'
const LAST_IMPORT_EXPORT_DIR_KEY = 'apiTester.lastImportExportDir'
const PROXY_CONFIG_KEY = 'apiTester.proxy'
let sidebarViewProviderRef: SidebarViewProvider | null = null
const panelRefs = new Set<vscode.WebviewPanel>()
// 记录每个 API 已打开的面板，避免重复标签
const panelByApiId = new Map<string, vscode.WebviewPanel>()
// WebSocket 连接管理器
const wsConnections = new Map<string, { ws: WebSocket; panel: vscode.WebviewPanel; timeout: NodeJS.Timeout; isStopped?: boolean }>()
// 追踪每个panel的活跃请求（可以是WebSocket connId或HTTP AbortController）
const activeRequests = new Map<vscode.WebviewPanel, { type: 'ws' | 'http'; id: string; controller?: AbortController }>()

function generateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    // @ts-ignore
    return crypto.randomUUID()
  }
  return 'id-' + Math.random().toString(16).slice(2)
}

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarViewProvider(context)
  sidebarViewProviderRef = sidebarProvider

  context.subscriptions.push(
    vscode.commands.registerCommand('apiTester.openPanel', (apiId?: string | { apiId?: string | null; groupId?: string | null } | null) => openPanel(context, apiId ?? null)),
    vscode.commands.registerCommand('apiTester.newApi', () => openPanel(context, null)),
    vscode.commands.registerCommand('apiTester.backupWebdavCommand', () => backupFromCommand(context)),
    vscode.commands.registerCommand('apiTester.restoreWebdavCommand', () => restoreFromCommand(context)),
    vscode.commands.registerCommand('apiTester.openSettings', () => openExtensionSettings()),
    vscode.commands.registerCommand('apiTester.exportData', () => exportData(context)),
    vscode.commands.registerCommand('apiTester.importData', () => importData(context)),
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

function readState(context: vscode.ExtensionContext): StateShape {
  const raw = context.globalState.get<any>(STATE_KEY)
  return normalizeState(raw)
}

function writeState(context: vscode.ExtensionContext, state: StateShape) {
  context.globalState.update(STATE_KEY, normalizeState(state))
}

function normalizeState(raw: any): StateShape {
  const groupsRaw = Array.isArray(raw?.groups) ? raw.groups : []
  const groups: ApiGroup[] = groupsRaw.map((g: any) => sanitizeGroup(g)).filter((g: ApiGroup | null): g is ApiGroup => Boolean(g))
  const groupIds = new Set(groups.map((g) => g.id))

  const apisRaw = Array.isArray(raw?.apis) ? raw.apis : []
  const apis: ApiRequest[] = apisRaw.map((a: any) => sanitizeApi(a, groupIds)).filter((a: ApiRequest | null): a is ApiRequest => Boolean(a))

  return { apis, groups }
}

function sanitizeGroup(group: any): ApiGroup | null {
  if (!group || typeof group !== 'object') return null
  const id = typeof group.id === 'string' && group.id ? group.id : generateId()
  const name = typeof group.name === 'string' ? group.name : ''
  return { id, name }
}

function sanitizeApi(api: any, groupIds?: Set<string>): ApiRequest | null {
  if (!api || typeof api !== 'object') return null
  const allowedMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'WebSocket']
  const allowedBody: ApiRequest['bodyType'][] = ['json', 'form-data', 'urlencoded', 'raw']
  const method = allowedMethods.includes(api.method) ? api.method : 'GET'
  const bodyType = allowedBody.includes(api.bodyType) ? api.bodyType : 'json'
  const headers = api.headers && typeof api.headers === 'object' ? api.headers : {}
  const params = api.params && typeof api.params === 'object' ? api.params : {}
  const cookies = api.cookies && typeof api.cookies === 'object' ? api.cookies : {}
  const groupIdRaw = typeof api.groupId === 'string' && api.groupId ? api.groupId : null
  const groupId = groupIds && groupIdRaw && !groupIds.has(groupIdRaw) ? null : groupIdRaw

  const sanitized: ApiRequest = {
    id: typeof api.id === 'string' && api.id ? api.id : generateId(),
    name: typeof api.name === 'string' ? api.name : '',
    url: typeof api.url === 'string' ? api.url : '',
    method,
    groupId,
    headers,
    cookies: Object.keys(cookies).length > 0 ? cookies : undefined,
    bodyType,
    body: api.body ?? '',
  }

  // 处理auth配置
  if (api.auth && typeof api.auth === 'object') {
    const authType = api.auth.type || 'none'
    if (authType !== 'none') {
      sanitized.auth = {
        type: authType as 'bearer' | 'basic' | 'custom',
      }
      if (authType === 'bearer' && typeof api.auth.bearer === 'string') {
        sanitized.auth.bearer = api.auth.bearer
      }
      if (authType === 'basic') {
        if (typeof api.auth.username === 'string') sanitized.auth.username = api.auth.username
        if (typeof api.auth.password === 'string') sanitized.auth.password = api.auth.password
      }
      if (authType === 'custom' && typeof api.auth.custom === 'string') {
        sanitized.auth.custom = api.auth.custom
      }
    }
  }

  // 处理params（query参数）
  if (Object.keys(params).length > 0) {
    sanitized.params = params
  }

  // 添加代理配置字段
  if (api.proxyEnabled) {
    sanitized.proxyEnabled = true
    sanitized.proxyHost = typeof api.proxyHost === 'string' ? api.proxyHost : ''
    sanitized.proxyPort = typeof api.proxyPort === 'number' ? api.proxyPort : 8080
    if (typeof api.proxyUsername === 'string' && api.proxyUsername) {
      sanitized.proxyUsername = api.proxyUsername
    }
    if (typeof api.proxyPassword === 'string' && api.proxyPassword) {
      sanitized.proxyPassword = api.proxyPassword
    }
  }

  return sanitized
}

// 对headers中的非ASCII字符进行编码，使其符合HTTP头规范
function encodeHeaders(headers: Record<string, string>): Record<string, string> {
  const encoded: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    // 对header值进行处理，如果包含非ASCII字符则进行URI编码
    try {
      // 检查是否包含非ASCII字符
      if (/[^\x00-\x7F]/.test(value)) {
        // 使用URI编码处理非ASCII字符
        encoded[key] = encodeURIComponent(value)
      } else {
        encoded[key] = value
      }
    } catch (e) {
      encoded[key] = value
    }
  }
  return encoded
}

function getProxyConfig(api?: ApiRequest): any | null {
  // 优先使用API级别的代理配置
  if (api?.proxyEnabled && api?.proxyHost) {
    const proxyUrl =
      api.proxyUsername && api.proxyPassword ? `http://${api.proxyUsername}:${api.proxyPassword}@${api.proxyHost}:${api.proxyPort || 8080}` : `http://${api.proxyHost}:${api.proxyPort || 8080}`

    return {
      httpAgent: new HttpProxyAgent(proxyUrl),
      httpsAgent: new HttpsProxyAgent(proxyUrl),
    }
  }

  // 使用全局代理配置
  const config = vscode.workspace.getConfiguration(PROXY_CONFIG_KEY)
  const enable = config.get<boolean>('enable', false)

  if (!enable) {
    return null
  }

  const host = config.get<string>('host', '')
  const port = config.get<number>('port', 8080)
  const username = config.get<string>('username', '')
  const password = config.get<string>('password', '')

  if (!host) {
    return null
  }

  const proxyUrl = username && password ? `http://${username}:${password}@${host}:${port}` : `http://${host}:${port}`

  return {
    httpAgent: new HttpProxyAgent(proxyUrl),
    httpsAgent: new HttpsProxyAgent(proxyUrl),
  }
}

function handleWebSocketRequest(api: ApiRequest, panel?: vscode.WebviewPanel): Promise<any> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(api.url, {
        headers: encodeHeaders(api.headers),
        handshakeTimeout: 5000,
      })

      const connId = generateId()
      let connected = false
      const startTime = Date.now()

      ws.on('open', () => {
        connected = true
        // 立即返回已连接状态
        resolve({
          success: true,
          status: 101,
          statusText: 'Switching Protocols',
          headers: { 'upgrade': 'websocket' },
          data: '[Connected] WebSocket connection established',
          connId: connId,
        })
        
        // 发送初始消息
        if (api.wsMessage) {
          try {
            ws.send(api.wsMessage)
            if (panel) {
              panel.webview.postMessage({
                type: 'wsMessage',
                payload: { connId, message: `[Sent] ${api.wsMessage}` },
              })
            }
          } catch (error: any) {
            if (panel) {
              panel.webview.postMessage({
                type: 'wsMessage',
                payload: { connId, message: `[Send Error] ${error?.message || String(error)}` },
              })
            }
          }
        }
        
        // 保存连接信息以支持长连接
        if (panel) {
          const timeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close()
            }
          }, 60000) // 60秒自动超时
          wsConnections.set(connId, { ws, panel, timeout })
          activeRequests.set(panel, { type: 'ws', id: connId }) // 记录活跃的WebSocket请求
        }
      })

      ws.on('message', (data: WebSocket.RawData) => {
        const conn = wsConnections.get(connId)
        // 只有在连接仍然存在且未被停止时才输出消息
        if (conn && !conn.isStopped && panel) {
          panel.webview.postMessage({
            type: 'wsMessage',
            payload: { connId, message: `[Received] ${data.toString()}` },
          })
        }
      })

      ws.on('error', (error: Error) => {
        const conn = wsConnections.get(connId)
        // 只有在连接仍然存在且未被停止时才输出错误
        if (conn && !conn.isStopped && panel) {
          panel.webview.postMessage({
            type: 'wsMessage',
            payload: { connId, message: `[Error] ${error?.message || String(error)}` },
          })
        }
      })

      ws.on('close', () => {
        const conn = wsConnections.get(connId)
        // 只在非用户停止的情况下发送关闭消息
        if (panel && !conn?.isStopped) {
          const duration = Date.now() - startTime
          panel.webview.postMessage({
            type: 'wsMessage',
            payload: { connId, message: `[Closed] Connection closed after ${duration}ms`, isClose: true },
          })
        }
        // 总是清除活跃请求和连接
        if (panel) {
          activeRequests.delete(panel)
        }
        wsConnections.delete(connId)
        ws.terminate()
      })
    } catch (error: any) {
      resolve({
        success: false,
        error: error?.message || String(error),
      })
    }
  })
}

async function handleRequest(api: ApiRequest, panel?: vscode.WebviewPanel) {
  // 检测WebSocket方法
  if (api.method === 'WebSocket') {
    return handleWebSocketRequest(api, panel)
  }

  let url = api.url

  // 构建headers，包含auth认证
  let headers = encodeHeaders(api.headers)

  // 处理认证信息
  if (api.auth && api.auth.type !== 'none') {
    if (api.auth.type === 'bearer' && api.auth.bearer) {
      headers['Authorization'] = `Bearer ${api.auth.bearer}`
    } else if (api.auth.type === 'basic' && api.auth.username) {
      const credentials = Buffer.from(`${api.auth.username}:${api.auth.password || ''}`).toString('base64')
      headers['Authorization'] = `Basic ${credentials}`
    } else if (api.auth.type === 'custom' && api.auth.custom) {
      headers['Authorization'] = api.auth.custom
    }
  }

  // 处理Cookies，添加到Cookie header
  if (api.cookies && Object.keys(api.cookies).length > 0) {
    const cookieString = Object.entries(api.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
    headers['Cookie'] = cookieString
  }

  // 处理Query Params
  if (api.params && Object.keys(api.params).length > 0) {
    const params = new URLSearchParams()
    Object.entries(api.params).forEach(([key, value]) => {
      params.append(key, String(value))
    })
    const separator = url.includes('?') ? '&' : '?'
    url = url + separator + params.toString()
  }

  // 创建 AbortController 以支持请求中止
  const controller = new AbortController()
  const httpRequestId = generateId()

  const config: AxiosRequestConfig = {
    url: url,
    method: api.method,
    headers: headers,
    validateStatus: () => true,
    signal: controller.signal,
  }

  // 记录活跃的 HTTP 请求
  if (panel) {
    activeRequests.set(panel, { type: 'http', id: httpRequestId, controller })
  }

  // 添加代理配置（支持API级别和全局级别）
  const proxyConfig = getProxyConfig(api)
  if (proxyConfig) {
    config.httpAgent = proxyConfig.httpAgent
    config.httpsAgent = proxyConfig.httpsAgent
  }

  try {
    switch (api.bodyType) {
      case 'json':
        config.data = api.body ? JSON.parse(api.body) : undefined
        break
      case 'form-data': {
        const form = new FormData()
        const bodyObj = api.body ? JSON.parse(api.body) : {}
        Object.entries(bodyObj).forEach(([k, v]) => form.append(k, v as any))
        config.data = form
        config.headers = { ...config.headers, ...form.getHeaders() }
        break
      }
      case 'urlencoded': {
        const bodyObj = api.body ? JSON.parse(api.body) : {}
        const params = new URLSearchParams()
        Object.entries(bodyObj).forEach(([k, v]) => params.append(k, String(v)))
        config.data = params.toString()
        config.headers = { ...config.headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        break
      }
      case 'raw':
        config.data = api.body
        break
      default:
        break
    }
    const res: AxiosResponse = await axios(config)
    if (panel) {
      activeRequests.delete(panel)
    }
    return { success: true, status: res.status, statusText: res.statusText, headers: res.headers, data: res.data }
  } catch (error: any) {
    // 清除活跃请求记录
    if (panel) {
      activeRequests.delete(panel)
    }
    // 处理中止错误
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request cancelled by user' }
    }
    return { success: false, error: error?.message || String(error) }
  }
}


async function handleRequestWithFiles(api: ApiRequest, filePaths: any[]) {
  try {
    if (!filePaths || filePaths.length === 0) {
      return { success: false, error: '未选择文件' }
    }

    let url = api.url

    // 构建headers，包含auth认证
    let headers = encodeHeaders(api.headers)

    // 处理认证信息
    if (api.auth && api.auth.type !== 'none') {
      if (api.auth.type === 'bearer' && api.auth.bearer) {
        headers['Authorization'] = `Bearer ${api.auth.bearer}`
      } else if (api.auth.type === 'basic' && api.auth.username) {
        const credentials = Buffer.from(`${api.auth.username}:${api.auth.password || ''}`).toString('base64')
        headers['Authorization'] = `Basic ${credentials}`
      } else if (api.auth.type === 'custom' && api.auth.custom) {
        headers['Authorization'] = api.auth.custom
      }
    }

    // 处理Cookies，添加到Cookie header
    if (api.cookies && Object.keys(api.cookies).length > 0) {
      const cookieString = Object.entries(api.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ')
      headers['Cookie'] = cookieString
    }

    // 处理Query Params
    if (api.params && Object.keys(api.params).length > 0) {
      const params = new URLSearchParams()
      Object.entries(api.params).forEach(([key, value]) => {
        params.append(key, String(value))
      })
      const separator = url.includes('?') ? '&' : '?'
      url = url + separator + params.toString()
    }

    const config: AxiosRequestConfig = {
      url: url,
      method: api.method,
      headers: headers,
      validateStatus: () => true,
    }

    // 添加代理配置（支持API级别和全局级别）
    const proxyConfig = getProxyConfig(api)
    if (proxyConfig) {
      config.httpAgent = proxyConfig.httpAgent
      config.httpsAgent = proxyConfig.httpsAgent
    }

    const form = new FormData()

    // 添加表单字段
    if (api.body) {
      try {
        const bodyObj = JSON.parse(api.body)
        Object.entries(bodyObj).forEach(([k, v]) => form.append(k, v as any))
      } catch (e) {
        // 如果解析失败，忽略
      }
    }

    // 添加文件（从 base64 内容转换为 Buffer）
    for (const fileInfo of filePaths) {
      const fileName = fileInfo.name
      const fileBuffer = Buffer.from(fileInfo.content, 'base64')
      form.append('file', fileBuffer, fileName)
    }

    config.data = form
    config.headers = { ...config.headers, ...form.getHeaders() }

    const res: AxiosResponse = await axios(config)
    return { success: true, status: res.status, statusText: res.statusText, headers: res.headers, data: res.data }
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) }
  }
}

async function handleBackup(state: StateShape, payload: any) {
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

async function handleRestore(context: vscode.ExtensionContext, payload: any) {
  const { url, username, password, path } = payload
  const dir = (path || '/apis-tester-backup').replace(/\/$/, '')
  const filename = 'api-tester-backup.json'
  const fullPath = `${dir || ''}/${filename}`
  try {
    const client = createClient(url, { username, password })
    let data
    try {
      // 先尝试从新目录读取
      data = await client.getFileContents(fullPath, { format: 'text' })
    } catch (e) {
      // 如果新目录不存在，尝试从旧目录读取（兼容旧版本用户）
      const oldDir = '/api-tester-backup'.replace(/\/$/, '')
      const oldFullPath = `${oldDir || ''}/${filename}`
      try {
        data = await client.getFileContents(oldFullPath, { format: 'text' })
      } catch {
        // 两个目录都找不到文件，抛出原始错误
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

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const nonce = getNonce()
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'panel.js'))
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'panel.css'))

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>APIs Tester</title>
    <style>
      html, body, #app {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`
}

function getNonce() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 32 })
    .map(() => possible.charAt(Math.floor(Math.random() * possible.length)))
    .join('')
}

async function promptWebdavConfig(context: vscode.ExtensionContext): Promise<any | undefined> {
  const prev = context.globalState.get<any>(WEBDAV_KEY) ?? { url: '', username: '', password: '', path: '/apis-tester-backup' }
  const url = await vscode.window.showInputBox({ prompt: 'WebDAV URL', value: prev.url, ignoreFocusOut: true })
  if (!url) return
  const username = await vscode.window.showInputBox({ prompt: 'Username', value: prev.username, ignoreFocusOut: true })
  if (username === undefined) return
  const password = await vscode.window.showInputBox({ prompt: 'Password', password: true, value: prev.password, ignoreFocusOut: true })
  if (password === undefined) return
  const path = await vscode.window.showInputBox({ prompt: 'Backup directory (default /apis-tester-backup)', value: prev.path || '/apis-tester-backup', ignoreFocusOut: true })
  if (path === undefined) return
  const cfg = { url, username, password, path }
  context.globalState.update(WEBDAV_KEY, cfg)
  return cfg
}

async function backupFromCommand(context: vscode.ExtensionContext) {
  const cfg = await ensureWebdavConfig(context)
  if (!cfg) return
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'WebDAV 备份中...' }, async () => {
    const res = await handleBackup(readState(context), cfg)
    if (res.success) vscode.window.showInformationMessage('备份成功')
    else vscode.window.showErrorMessage(`备份失败: ${res.error}`)
  })
}

async function restoreFromCommand(context: vscode.ExtensionContext) {
  const cfg = await ensureWebdavConfig(context)
  if (!cfg) return
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'WebDAV 恢复中...' }, async () => {
    const res = await handleRestore(context, cfg)
    if (res.success) {
      vscode.window.showInformationMessage('恢复成功')
      // 刷新侧边栏显示恢复的内容
      if (sidebarViewProviderRef && res.state) {
        sidebarViewProviderRef.pushState(res.state)
      }
      // 广播给所有打开的面板
      if (res.state) {
        broadcastState(res.state)
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
    await openExtensionSettings()
  }
  return undefined
}

function triggerAutoBackup(context: vscode.ExtensionContext, state: StateShape) {
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
          await restoreFromCommand(this.context)
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
            const copiedApi: ApiRequest = {
              ...target,
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
    const nonce = getNonce()
    const csp = `default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`
    return `<!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <style>
      body { margin: 0; padding: 12px; font-family: "Segoe UI", system-ui, sans-serif; color: #1f2937; background: #f7f8fa; }
      .toolbar { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
      .search { flex: 1; display: flex; align-items: center; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; }
      .search input { border: none; outline: none; width: 100%; font-size: 12px; background: transparent; color: #1f2937; }
      .search input::placeholder { color: #9ca3af; }
      .icon-btn { width: 32px; height: 32px; border-radius: 6px; border: 1px solid #e5e7eb; background: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #4b5563; }
      .icon-btn:hover { border-color: #d1d5db; color: #111827; }
      .menu { position: absolute; right: 12px; top: 54px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 8px 18px rgba(0,0,0,0.08); min-width: 180px; padding: 6px 0; z-index: 10; display: none; }
      .menu.open { display: block; }
      .menu-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; font-size: 12px; color: #1f2937; cursor: pointer; }
      .menu-item:hover { background: #f3f4f6; }
      .menu-item.active { background: #eef2ff; color: #4338ca; }
      .menu-item.disabled { color: #9ca3af; cursor: default; }
      .list { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
      .group { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; }
      .group-header { padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: #1f2937; border-bottom: 1px solid #e5e7eb; cursor: pointer; }
      .folder-icon { width: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
      .group-items { display: flex; flex-direction: column; }
      .item { position: relative; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #1f2933; cursor: pointer; padding: 6px 10px; }
      .item:hover { background: rgba(37,99,235,0.08); }
      .item .name { flex: 1; white-space: normal; word-break: break-all; overflow: hidden; text-overflow: ellipsis; }
      .item .meta { color: #6c7a89; font-size: 12px; margin-left: 10px; flex-shrink: 0; white-space: normal; word-break: break-all; }
      .item .actions { display: flex; gap: 6px; align-items: center; margin-left: 6px; opacity: 0; transition: opacity 120ms ease; }
      .item:hover .actions { opacity: 1; }
      .pill { padding: 2px 6px; border-radius: 6px; background: #eef2ff; color: #4338ca; font-size: 12px; margin-right: 6px; }
      .del-btn { border: none; background: transparent; color: #e11d48; cursor: pointer; font-size: 14px; line-height: 1; padding: 2px 4px; }
      .del-btn:hover { color: #b91c1c; }
      .copy-btn { border: none; background: transparent; color: #7c3aed; cursor: pointer; font-size: 14px; line-height: 1; padding: 2px 4px; }
      .copy-btn:hover { color: #6d28d9; }
      .new-btn { border: none; background: transparent; color: #2563eb; cursor: pointer; font-size: 14px; padding: 0 4px; }
      .new-btn:hover { color: #1d4ed8; }
      .empty { font-size: 12px; color: #6b7280; text-align: center; padding: 12px 6px; border: 1px dashed #e5e7eb; border-radius: 10px; background: #fff; }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div class="search">
        <input id="keywordInput" type="text" placeholder="搜索接口" />
      </div>
      <button id="groupMenuBtn" class="icon-btn" title="分组筛选">☰</button>
    </div>
    <div class="list" id="apiList"></div>
    <div id="groupMenu" class="menu"></div>
  </body>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const apiList = document.getElementById("apiList");
    const groupMenuBtn = document.getElementById("groupMenuBtn");
    const groupMenu = document.getElementById("groupMenu");
    const keywordInput = document.getElementById("keywordInput");
    let latestState = { apis: [], groups: [] };
    let currentFilter = "";
    const collapsed = new Set();

    window.addEventListener("message", (event) => {
      const { type, payload } = event.data;
      if (type === "state") {
        latestState = payload || { apis: [], groups: [] };
        renderFilter();
        renderList();
      }
    });

    groupMenuBtn.onclick = (e) => {
      e.stopPropagation();
      groupMenu.classList.toggle("open");
      if (groupMenu.classList.contains("open")) renderFilter();
    };
    document.addEventListener("click", () => groupMenu.classList.remove("open"));
    groupMenu.addEventListener("click", (e) => e.stopPropagation());
    keywordInput.oninput = () => renderList();

    function renderList() {
      const state = latestState || {};
      apiList.innerHTML = "";
      const keyword = (keywordInput.value || "").trim().toLowerCase();
      const groups = Array.isArray(state.groups) ? state.groups : [];
      const apis = Array.isArray(state.apis) ? state.apis : [];
      if (currentFilter && !groups.some((g) => g.id === currentFilter)) currentFilter = "";

      const buckets = currentFilter
        ? groups.filter((g) => g.id === currentFilter)
        : [...groups, { id: null, name: "未分组" }];

      let renderedCount = 0;
      buckets.forEach((g) => {
        const key = g.id ?? "__ungrouped";
        const list = apis.filter((api) => {
          const inGroup = g.id === null ? !api.groupId : api.groupId === g.id;
          if (!inGroup) return false;
          if (!keyword) return true;
          const nameHit = api.name && api.name.toLowerCase().includes(keyword);
          const urlHit = api.url && api.url.toLowerCase().includes(keyword);
          return nameHit || urlHit;
        });
        if (list.length === 0) return;
        renderedCount += list.length;
        const groupDiv = document.createElement("div");
        groupDiv.className = "group";
        const header = document.createElement("div");
        header.className = "group-header";
        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "8px";
        const icon = document.createElement("span");
        const isCollapsed = collapsed.has(key);
        icon.className = "folder-icon";
        icon.textContent = isCollapsed ? "📁" : "📂";
        const title = document.createElement("span");
        title.textContent = (g.name || "未命名分组") + " (" + list.length + ")";
        left.appendChild(icon);
        left.appendChild(title);

        const actionsWrap = document.createElement("div");
        actionsWrap.style.display = "flex";
        actionsWrap.style.gap = "4px";
        if (g.id) {
          const delGroup = document.createElement("button");
          delGroup.className = "del-btn";
          delGroup.title = "删除分组（接口将移至未分组）";
          delGroup.textContent = "×";
          delGroup.onclick = (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: "deleteGroup", groupId: g.id });
          };
          actionsWrap.appendChild(delGroup);
        }
        const newBtn = document.createElement("button");
        newBtn.className = "new-btn";
        newBtn.title = "在此分组新建接口";
        newBtn.textContent = "+";
        newBtn.onclick = (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: "newInGroup", groupId: g.id });
        };
        actionsWrap.appendChild(newBtn);

        header.appendChild(left);
        header.appendChild(actionsWrap);
        header.onclick = () => {
          if (collapsed.has(key)) collapsed.delete(key);
          else collapsed.add(key);
          renderList();
        };
        groupDiv.appendChild(header);

        if (isCollapsed) {
          apiList.appendChild(groupDiv);
          return;
        }

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "group-items";
        list.forEach((api) => {
          const div = document.createElement("div");
          div.className = "item";
        const leftWrap = document.createElement("div");
        leftWrap.style.display = "flex";
        leftWrap.style.alignItems = "center";
        leftWrap.style.gap = "8px";
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = api.method || "";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = api.name || api.url || "未命名接口";
        const meta = document.createElement("span");
        meta.className = "meta";
        if (!api.name && api.url) {
          meta.textContent = api.url;
          meta.style.display = "inline";
        } else {
          meta.textContent = "";
          meta.style.display = "none";
        }
        leftWrap.appendChild(pill);
        leftWrap.appendChild(name);
        if (meta.style.display !== "none") leftWrap.appendChild(meta);

          const actions = document.createElement("div");
          actions.className = "actions";
          const copy = document.createElement("button");
          copy.className = "copy-btn";
          copy.title = "复制接口";
          copy.textContent = "⧉";
          copy.onclick = (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: "copyApi", apiId: api.id });
          };
          actions.appendChild(copy);
          const del = document.createElement("button");
          del.className = "del-btn";
          del.title = "删除接口";
          del.textContent = "×";
          del.onclick = (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: "deleteApi", apiId: api.id });
          };
          actions.appendChild(del);

          div.onclick = () => vscode.postMessage({ type: "openApi", apiId: api.id });
          div.appendChild(leftWrap);
          div.appendChild(actions);
          itemsWrap.appendChild(div);
        });
        groupDiv.appendChild(itemsWrap);
        apiList.appendChild(groupDiv);
      });

      if (renderedCount === 0) {
        apiList.innerHTML = '<div class="empty">暂无接口</div>';
      }
    }

    function renderFilter() {
      const state = latestState || {};
      const groups = Array.isArray(state.groups) ? state.groups : [];
      groupMenu.innerHTML = "";
      const makeItem = (id, label) => {
        const item = document.createElement("div");
        item.className = "menu-item" + (currentFilter === id ? " active" : "");
        item.textContent = label;
        item.onclick = () => {
          currentFilter = id;
          renderList();
          groupMenu.classList.remove("open");
        };
        return item;
      };
      groupMenu.appendChild(makeItem("", "全部分组"));
      groups.forEach((g) => {
        groupMenu.appendChild(makeItem(g.id, g.name || "未命名分组"));
      });
      if (groups.length === 0) {
        const empty = document.createElement("div");
        empty.className = "menu-item disabled";
        empty.textContent = "暂无分组";
        groupMenu.appendChild(empty);
      }
    }

    vscode.postMessage({ type: "requestState" });
  </script>
  </html>`
  }
}

// ==================== 导出数据功能 ====================
async function exportData(context: vscode.ExtensionContext) {
  try {
    const state = readState(context)

    // 让用户选择导出格式
    const format = await vscode.window.showQuickPick(
      [
        { label: 'Postman Collection v2.1', value: 'postman' },
        { label: 'APIs Tester 原生格式', value: 'native' },
      ],
      { placeHolder: '选择导出格式' },
    )

    if (!format) return

    let exportData: any
    let defaultFileName: string

    if (format.value === 'postman') {
      exportData = convertToPostman(state)
      defaultFileName = 'api-tester-export-postman.json'
    } else {
      exportData = state
      defaultFileName = 'api-tester-export.json'
    }

    // 让用户选择保存位置（优先使用上次的目录，否则使用桌面）
    const lastDir = context.globalState.get<string>(LAST_IMPORT_EXPORT_DIR_KEY)
    const desktopPath = path.join(os.homedir(), 'Desktop')
    const defaultDir = lastDir || desktopPath
    const defaultPath = path.join(defaultDir, defaultFileName)
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultPath),
      filters: { JSON: ['json'] },
    })

    if (!uri) return

    // 记录用户选择的目录
    const selectedDir = path.dirname(uri.fsPath)
    await context.globalState.update(LAST_IMPORT_EXPORT_DIR_KEY, selectedDir)

    // 写入文件
    const content = JSON.stringify(exportData, null, 2)
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))

    vscode.window.showInformationMessage(`导出成功: ${uri.fsPath}`)
  } catch (error: any) {
    vscode.window.showErrorMessage(`导出失败: ${error?.message || String(error)}`)
  }
}

// ==================== 导入数据功能 ====================
async function importData(context: vscode.ExtensionContext) {
  try {
    // 让用户选择文件（优先使用上次的目录，否则使用桌面）
    const lastDir = context.globalState.get<string>(LAST_IMPORT_EXPORT_DIR_KEY)
    const desktopPath = path.join(os.homedir(), 'Desktop')
    const defaultDir = lastDir || desktopPath
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      defaultUri: vscode.Uri.file(defaultDir),
      filters: { JSON: ['json'] },
      openLabel: '选择导入文件',
    })

    if (!uris || uris.length === 0) return

    const uri = uris[0]
    // 记录用户选择的目录
    const selectedDir = path.dirname(uri.fsPath)
    await context.globalState.update(LAST_IMPORT_EXPORT_DIR_KEY, selectedDir)
    const content = await vscode.workspace.fs.readFile(uri)
    const jsonData = JSON.parse(content.toString())

    // 检测格式
    let importedState: StateShape

    if (jsonData.info && jsonData.info.schema && jsonData.info.schema.includes('postman')) {
      // Postman 格式
      importedState = convertFromPostman(jsonData)
    } else if (jsonData.apis && jsonData.groups) {
      // 原生格式
      importedState = normalizeState(jsonData)
    } else {
      throw new Error('无法识别的文件格式')
    }

    // 询问导入方式
    const mode = await vscode.window.showQuickPick(
      [
        { label: '合并导入', description: '保留现有数据，添加新数据', value: 'merge' },
        { label: '覆盖导入', description: '清空现有数据，替换为导入的数据', value: 'replace' },
      ],
      { placeHolder: '选择导入方式' },
    )

    if (!mode) return

    const currentState = readState(context)
    const importedGroupNames = new Set((importedState.groups || []).map((g) => (g.name || '').trim()).filter((n) => n.length > 0))
    const hasGroupInfo = importedGroupNames.size > 0

    let finalState: StateShape

    if (mode.value === 'merge') {
      if (hasGroupInfo) {
        // 合并到指定分组：按名称匹配已有分组，复用其 id；不存在则创建新分组
        const nameToExistingId = new Map<string, string>()
        currentState.groups.forEach((g) => {
          const n = (g.name || '').trim()
          if (n) nameToExistingId.set(n, g.id)
        })

        const adjustedImportedGroups: ApiGroup[] = []
        const idMap = new Map<string, string>() // imported groupId -> target groupId
        importedState.groups.forEach((ig) => {
          const n = (ig.name || '').trim()
          const existingId = n ? nameToExistingId.get(n) : undefined
          if (existingId) {
            idMap.set(ig.id, existingId)
            // 不重复添加分组
          } else {
            adjustedImportedGroups.push(ig)
            idMap.set(ig.id, ig.id)
          }
        })

        const adjustedImportedApis = importedState.apis.map((a) => {
          if (a.groupId) {
            const mapped = idMap.get(a.groupId) || a.groupId
            return { ...a, groupId: mapped }
          }
          return a
        })

        finalState = {
          groups: [...currentState.groups, ...adjustedImportedGroups],
          apis: [...currentState.apis, ...adjustedImportedApis],
        }
      } else {
        // 无分组信息：对全部数据合并
        finalState = {
          groups: [...currentState.groups, ...importedState.groups],
          apis: [...currentState.apis, ...importedState.apis],
        }
      }
    } else {
      if (hasGroupInfo) {
        // 覆盖指定分组：先移除同名分组及其接口，再添加导入分组及接口
        const toRemoveIds = new Set(currentState.groups.filter((g) => importedGroupNames.has((g.name || '').trim())).map((g) => g.id))
        const remainingGroups = currentState.groups.filter((g) => !toRemoveIds.has(g.id))
        const remainingApis = currentState.apis.filter((a) => !toRemoveIds.has(a.groupId || ''))

        finalState = {
          groups: [...remainingGroups, ...importedState.groups],
          apis: [...remainingApis, ...importedState.apis],
        }
      } else {
        // 无分组信息：对全部数据覆盖
        finalState = importedState
      }
    }

    // 保存状态
    writeState(context, finalState)

    // 刷新侧边栏和所有面板
    broadcastState(finalState)
    // 自动同步到 WebDAV（若开启）
    triggerAutoBackup(context, finalState)

    vscode.window.showInformationMessage(`导入成功: ${importedState.groups.length} 个分组, ${importedState.apis.length} 个接口`)
  } catch (error: any) {
    vscode.window.showErrorMessage(`导入失败: ${error?.message || String(error)}`)
  }
}

// ==================== Postman 格式转换 ====================
function convertToPostman(state: StateShape): any {
  const collection: any = {
    info: {
      name: 'APIs Tester Export',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description: 'Exported from APIs Tester',
    },
    item: [],
  }

  // 按分组组织
  const groupMap = new Map<string, ApiGroup>()
  state.groups.forEach((g) => groupMap.set(g.id, g))

  // 处理有分组的 API
  state.groups.forEach((group) => {
    const groupApis = state.apis.filter((api) => api.groupId === group.id)
    if (groupApis.length > 0) {
      const folder: any = {
        name: group.name || '未命名分组',
        item: groupApis.map((api) => convertApiToPostmanItem(api)),
      }
      collection.item.push(folder)
    }
  })

  // 处理未分组的 API
  const ungroupedApis = state.apis.filter((api) => !api.groupId)
  if (ungroupedApis.length > 0) {
    ungroupedApis.forEach((api) => {
      collection.item.push(convertApiToPostmanItem(api))
    })
  }

  return collection
}

function convertApiToPostmanItem(api: ApiRequest): any {
  const item: any = {
    name: api.name || api.url,
    request: {
      method: api.method,
      header: Object.entries(api.headers).map(([key, value]) => ({ key, value })),
      url: api.url,
    },
  }

  // 处理请求体
  if (['POST', 'PUT', 'PATCH'].includes(api.method)) {
    if (api.bodyType === 'json') {
      item.request.body = {
        mode: 'raw',
        raw: api.body,
        options: { raw: { language: 'json' } },
      }
    } else if (api.bodyType === 'form-data') {
      try {
        const bodyObj = api.body ? JSON.parse(api.body) : {}
        item.request.body = {
          mode: 'formdata',
          formdata: Object.entries(bodyObj).map(([key, value]) => ({ key, value, type: 'text' })),
        }
      } catch {
        item.request.body = { mode: 'raw', raw: api.body }
      }
    } else if (api.bodyType === 'urlencoded') {
      try {
        const bodyObj = api.body ? JSON.parse(api.body) : {}
        item.request.body = {
          mode: 'urlencoded',
          urlencoded: Object.entries(bodyObj).map(([key, value]) => ({ key, value })),
        }
      } catch {
        item.request.body = { mode: 'raw', raw: api.body }
      }
    } else {
      item.request.body = { mode: 'raw', raw: api.body }
    }
  }

  return item
}

function convertFromPostman(postmanCollection: any): StateShape {
  const groups: ApiGroup[] = []
  const apis: ApiRequest[] = []

  if (!postmanCollection.item || !Array.isArray(postmanCollection.item)) {
    return { groups, apis }
  }

  // 获取 Collection 名称作为默认分组
  const collectionName = postmanCollection.info?.name || '导入的接口'
  let defaultGroupId: string | null = null

  // 收集没有文件夹的请求
  const ungroupedApis: any[] = []

  // 处理 Postman item
  postmanCollection.item.forEach((item: any) => {
    if (item.item && Array.isArray(item.item)) {
      // 这是一个文件夹（分组）
      const groupId = generateId()
      groups.push({
        id: groupId,
        name: item.name || '未命名分组',
      })

      // 处理分组内的请求
      item.item.forEach((subItem: any) => {
        const api = convertPostmanItemToApi(subItem, groupId)
        if (api) apis.push(api)
      })
    } else {
      // 这是一个单独的请求，暂存起来
      ungroupedApis.push(item)
    }
  })

  // 如果有未分组的请求，创建一个以 Collection 名称命名的分组
  if (ungroupedApis.length > 0) {
    defaultGroupId = generateId()
    groups.push({
      id: defaultGroupId,
      name: collectionName,
    })

    // 将未分组的请求加入到这个默认分组
    ungroupedApis.forEach((item) => {
      const api = convertPostmanItemToApi(item, defaultGroupId)
      if (api) apis.push(api)
    })
  }

  return { groups, apis }
}

function convertPostmanItemToApi(item: any, groupId: string | null): ApiRequest | null {
  if (!item.request) return null

  const request = item.request
  let url = ''

  // 解析 URL
  if (typeof request.url === 'string') {
    url = request.url
  } else if (request.url && request.url.raw) {
    url = request.url.raw
  }

  // 解析 headers
  const headers: Record<string, string> = {}
  if (Array.isArray(request.header)) {
    request.header.forEach((h: any) => {
      if (h.key && !h.disabled) {
        headers[h.key] = h.value || ''
      }
    })
  }

  // 解析 body
  let bodyType: ApiRequest['bodyType'] = 'json'
  let body = ''

  if (request.body) {
    const mode = request.body.mode || 'raw'

    if (mode === 'raw') {
      bodyType = 'raw'
      body = request.body.raw || ''
      // 如果 raw 看起来像 JSON，设置为 json 类型
      if (request.body.options?.raw?.language === 'json') {
        bodyType = 'json'
      }
    } else if (mode === 'formdata') {
      bodyType = 'form-data'
      const formObj: any = {}
      if (Array.isArray(request.body.formdata)) {
        request.body.formdata.forEach((f: any) => {
          if (f.key && !f.disabled) {
            formObj[f.key] = f.value || ''
          }
        })
      }
      body = JSON.stringify(formObj, null, 2)
    } else if (mode === 'urlencoded') {
      bodyType = 'urlencoded'
      const urlObj: any = {}
      if (Array.isArray(request.body.urlencoded)) {
        request.body.urlencoded.forEach((u: any) => {
          if (u.key && !u.disabled) {
            urlObj[u.key] = u.value || ''
          }
        })
      }
      body = JSON.stringify(urlObj, null, 2)
    }
  }

  const method = (request.method || 'GET').toUpperCase() as HttpMethod

  return {
    id: generateId(),
    name: item.name || url,
    url,
    method,
    groupId,
    headers,
    bodyType,
    body,
  }
}

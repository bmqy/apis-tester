import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import FormData from 'form-data'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import * as vscode from 'vscode'
import WebSocket from 'ws'
import { generateId } from './ids'
import type { ApiRequest } from './types'

const PROXY_CONFIG_KEY = 'apiTester.proxy'

export const wsConnections = new Map<string, { ws: WebSocket; panel: vscode.WebviewPanel; timeout: NodeJS.Timeout; isStopped?: boolean }>()
export const activeRequests = new Map<vscode.WebviewPanel, { type: 'ws' | 'http'; id: string; controller?: AbortController }>()

function encodeHeaders(headers: Record<string, string>): Record<string, string> {
  const encoded: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    try {
      if (/[^\x00-\x7F]/.test(value)) {
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
  if (api?.proxyEnabled && api?.proxyHost) {
    const proxyUrl =
      api.proxyUsername && api.proxyPassword ? `http://${api.proxyUsername}:${api.proxyPassword}@${api.proxyHost}:${api.proxyPort || 8080}` : `http://${api.proxyHost}:${api.proxyPort || 8080}`

    return {
      httpAgent: new HttpProxyAgent(proxyUrl),
      httpsAgent: new HttpsProxyAgent(proxyUrl),
    }
  }

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
      const startTime = Date.now()

      ws.on('open', () => {
        resolve({
          success: true,
          status: 101,
          statusText: 'Switching Protocols',
          headers: { 'upgrade': 'websocket' },
          data: '[Connected] WebSocket connection established',
          connId: connId,
        })

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

        if (panel) {
          const timeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close()
            }
          }, 60000)
          wsConnections.set(connId, { ws, panel, timeout })
          activeRequests.set(panel, { type: 'ws', id: connId })
        }
      })

      ws.on('message', (data: WebSocket.RawData) => {
        const conn = wsConnections.get(connId)
        if (conn && !conn.isStopped && panel) {
          panel.webview.postMessage({
            type: 'wsMessage',
            payload: { connId, message: `[Received] ${data.toString()}` },
          })
        }
      })

      ws.on('error', (error: Error) => {
        const conn = wsConnections.get(connId)
        if (conn && !conn.isStopped && panel) {
          panel.webview.postMessage({
            type: 'wsMessage',
            payload: { connId, message: `[Error] ${error?.message || String(error)}` },
          })
        }
      })

      ws.on('close', () => {
        const conn = wsConnections.get(connId)
        if (panel && !conn?.isStopped) {
          const duration = Date.now() - startTime
          panel.webview.postMessage({
            type: 'wsMessage',
            payload: { connId, message: `[Closed] Connection closed after ${duration}ms`, isClose: true },
          })
        }
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

export async function handleRequest(api: ApiRequest, panel?: vscode.WebviewPanel) {
  if (api.method === 'WebSocket') {
    return handleWebSocketRequest(api, panel)
  }

  let url = api.url
  let headers = encodeHeaders(api.headers)

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

  if (api.cookies && Object.keys(api.cookies).length > 0) {
    const cookieString = Object.entries(api.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
    headers['Cookie'] = cookieString
  }

  if (api.params && Object.keys(api.params).length > 0) {
    const params = new URLSearchParams()
    Object.entries(api.params).forEach(([key, value]) => {
      params.append(key, String(value))
    })
    const separator = url.includes('?') ? '&' : '?'
    url = url + separator + params.toString()
  }

  const controller = new AbortController()
  const httpRequestId = generateId()

  const config: AxiosRequestConfig = {
    url: url,
    method: api.method,
    headers: headers,
    validateStatus: () => true,
    signal: controller.signal,
  }

  if (panel) {
    activeRequests.set(panel, { type: 'http', id: httpRequestId, controller })
  }

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
    if (panel) {
      activeRequests.delete(panel)
    }
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request cancelled by user' }
    }
    return { success: false, error: error?.message || String(error) }
  }
}

export async function handleRequestWithFiles(api: ApiRequest, filePaths: any[]) {
  try {
    if (!filePaths || filePaths.length === 0) {
      return { success: false, error: '未选择文件' }
    }

    let url = api.url
    let headers = encodeHeaders(api.headers)

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

    if (api.cookies && Object.keys(api.cookies).length > 0) {
      const cookieString = Object.entries(api.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ')
      headers['Cookie'] = cookieString
    }

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

    const proxyConfig = getProxyConfig(api)
    if (proxyConfig) {
      config.httpAgent = proxyConfig.httpAgent
      config.httpsAgent = proxyConfig.httpsAgent
    }

    const form = new FormData()

    if (api.body) {
      try {
        const bodyObj = JSON.parse(api.body)
        Object.entries(bodyObj).forEach(([k, v]) => form.append(k, v as any))
      } catch (e) {
      }
    }

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

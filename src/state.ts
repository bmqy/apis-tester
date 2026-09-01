import * as vscode from 'vscode'
import { generateId } from './ids'
import type { ApiGroup, ApiRequest, HttpMethod, StateShape } from './types'

export const STATE_KEY = 'apiTester.state'

export function readState(context: vscode.ExtensionContext): StateShape {
  const raw = context.globalState.get<any>(STATE_KEY)
  return normalizeState(raw)
}

export function writeState(context: vscode.ExtensionContext, state: StateShape) {
  context.globalState.update(STATE_KEY, normalizeState(state))
}

export function normalizeState(raw: any): StateShape {
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

  if (api.lastResponse && typeof api.lastResponse === 'object') {
    const meta = typeof api.lastResponse.meta === 'string' ? api.lastResponse.meta : ''
    const body = typeof api.lastResponse.body === 'string' ? api.lastResponse.body : ''
    const rawText = typeof api.lastResponse.rawText === 'string' ? api.lastResponse.rawText : body
    const updatedAt = typeof api.lastResponse.updatedAt === 'number' ? api.lastResponse.updatedAt : Date.now()
    const responseStatus = normalizeLastResponseStatus(api.lastResponse.status, meta)
    if (meta || body || rawText) {
      sanitized.lastResponse = { meta, body, rawText, updatedAt, status: responseStatus }
    }
  }

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

  if (Object.keys(params).length > 0) {
    sanitized.params = params
  }

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

function normalizeLastResponseStatus(status: any, meta: string): 'success' | 'failed' | undefined {
  if (status === 'success' || status === 'failed') return status
  if (meta.startsWith('请求失败')) return 'failed'
  if (meta.includes('WebSocket')) return 'success'
  const match = meta.match(/^状态[：:]\s*(\d{3})/)
  if (match) return match[1] === '200' ? 'success' : 'failed'
  return undefined
}

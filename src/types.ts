export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'WebSocket'

export interface ApiRequest {
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
  lastResponse?: {
    meta: string
    body: string
    rawText: string
    updatedAt: number
    status?: 'success' | 'failed'
  }
}

export interface ApiGroup {
  id: string
  name: string
}

export interface StateShape {
  apis: ApiRequest[]
  groups: ApiGroup[]
}

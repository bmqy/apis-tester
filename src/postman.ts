import { generateId } from './ids'
import type { ApiGroup, ApiRequest, HttpMethod, StateShape } from './types'

export function convertToPostman(state: StateShape): any {
  const collection: any = {
    info: {
      name: 'APIs Tester Export',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description: 'Exported from APIs Tester',
    },
    item: [],
  }

  const groupMap = new Map<string, ApiGroup>()
  state.groups.forEach((g) => groupMap.set(g.id, g))

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

export function convertFromPostman(postmanCollection: any): StateShape {
  const groups: ApiGroup[] = []
  const apis: ApiRequest[] = []

  if (!postmanCollection.item || !Array.isArray(postmanCollection.item)) {
    return { groups, apis }
  }

  const collectionName = postmanCollection.info?.name || '导入的接口'
  let defaultGroupId: string | null = null

  const ungroupedApis: any[] = []

  postmanCollection.item.forEach((item: any) => {
    if (item.item && Array.isArray(item.item)) {
      const groupId = generateId()
      groups.push({
        id: groupId,
        name: item.name || '未命名分组',
      })

      item.item.forEach((subItem: any) => {
        const api = convertPostmanItemToApi(subItem, groupId)
        if (api) apis.push(api)
      })
    } else {
      ungroupedApis.push(item)
    }
  })

  if (ungroupedApis.length > 0) {
    defaultGroupId = generateId()
    groups.push({
      id: defaultGroupId,
      name: collectionName,
    })

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

  if (typeof request.url === 'string') {
    url = request.url
  } else if (request.url && request.url.raw) {
    url = request.url.raw
  }

  const headers: Record<string, string> = {}
  if (Array.isArray(request.header)) {
    request.header.forEach((h: any) => {
      if (h.key && !h.disabled) {
        headers[h.key] = h.value || ''
      }
    })
  }

  let bodyType: ApiRequest['bodyType'] = 'json'
  let body = ''

  if (request.body) {
    const mode = request.body.mode || 'raw'

    if (mode === 'raw') {
      bodyType = 'raw'
      body = request.body.raw || ''
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

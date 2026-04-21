;(() => {
  const vscode = acquireVsCodeApi()
  let state = { groups: [], apis: [] }
  let currentApiId = null
  let lastResponse = null
  let hasInitialState = false

  const HEADERS_CATALOG = [
    'Accept',
    'Accept-Charset',
    'Accept-Encoding',
    'Accept-Language',
    'Accept-Ranges',
    'Access-Control-Allow-Credentials',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Origin',
    'Access-Control-Expose-Headers',
    'Access-Control-Max-Age',
    'Access-Control-Request-Headers',
    'Access-Control-Request-Method',
    'Age',
    'Allow',
    'API-Key',
    'Authorization',
    'Cache-Control',
    'Connection',
    'Content-Disposition',
    'Content-Encoding',
    'Content-Language',
    'Content-Length',
    'Content-Location',
    'Content-Range',
    'Content-Security-Policy',
    'Content-Type',
    'Cookie',
    'Date',
    'DNT',
    'ETag',
    'Expect',
    'Expires',
    'Forwarded',
    'From',
    'Host',
    'If-Match',
    'If-Modified-Since',
    'If-None-Match',
    'If-Range',
    'If-Unmodified-Since',
    'Keep-Alive',
    'Last-Modified',
    'Link',
    'Location',
    'Max-Forwards',
    'Origin',
    'Pragma',
    'Proxy-Authenticate',
    'Proxy-Authorization',
    'Range',
    'Referer',
    'Retry-After',
    'Save-Data',
    'Sec-Fetch-Dest',
    'Sec-Fetch-Mode',
    'Sec-Fetch-Site',
    'Server',
    'Set-Cookie',
    'Strict-Transport-Security',
    'TE',
    'Timing-Allow-Origin',
    'Trailer',
    'Transfer-Encoding',
    'Upgrade',
    'Upgrade-Insecure-Requests',
    'User-Agent',
    'Vary',
    'Via',
    'Warning',
    'WWW-Authenticate',
    'X-API-Key',
    'X-Content-Type-Options',
    'X-Correlation-ID',
    'X-CSRF-Token',
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Proto',
    'X-Frame-Options',
    'X-HTTP-Method-Override',
    'X-Powered-By',
    'X-Real-IP',
    'X-Request-ID',
    'X-Requested-With',
    'X-UA-Compatible',
    'X-XSS-Protection',
  ]

  const app = document.getElementById('app')
  app.innerHTML = `
    <main class="two-column">
      <div class="left-column">
        <div class="block" id="configBlock">
          <div class="block-header">
            <span>接口配置</span>
            <div>
              <button id="importCodeBtn" class="ghost">粘贴导入</button>
              <select id="quickExportFormat" class="quick-export-select" title="选择格式后自动复制到剪切板">
                <option value="">导出并复制...</option>
                <option value="curl">curl</option>
                <option value="fetch">fetch</option>
                <option value="wget">wget</option>
              </select>
              <button id="sendBtn" class="primary">发送/保存</button>
            </div>
          </div>
          <div class="form">
            <!-- 基本信息行1: 名称和分组 -->
            <div class="row">
              <label class="full-width">
                名称 
                <input id="apiName" placeholder="例如：获取用户信息" />
              </label>
              <label class="full-width">
                分组
                <div class="group-input-wrapper">
                  <input id="apiGroupInput" type="text" placeholder="选择分组或输入新分组名称" />
                  <div class="group-suggest"></div>
                </div>
              </label>
            </div>

            <!-- 基本信息行2: Method和URL -->
            <div class="row method-url-row">
              <label class="method-label">
                Method
                <select id="apiMethod">
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                  <option>HEAD</option>
                  <option>OPTIONS</option>
                  <option>WebSocket</option>
                </select>
              </label>
              <label class="full-width">
                URL 
                <input id="apiUrl" placeholder="https://example.com/api 或 ws://example.com/socket" />
              </label>
            </div>

            <!-- WebSocket 消息区域 (默认隐藏) -->
            <div id="wsMessageSection" style="display: none; margin-top: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
              <div class="label-row">
                <span>WebSocket 消息</span>
              </div>
              <textarea id="wsMessage" rows="4" placeholder="输入要发送的消息（可选）&#10;格式支持：JSON、文本等"></textarea>
            </div>

            <!-- Tab导航 -->
            <div class="tabs-container">
              <div class="tabs-nav">
                <button class="tab-btn active" data-tab="params">Params</button>
                <button class="tab-btn" data-tab="body">Body</button>
                <button class="tab-btn" data-tab="headers">Headers</button>
                <button class="tab-btn" data-tab="cookie">Cookie</button>
                <button class="tab-btn" data-tab="auth">Auth</button>
              </div>

              <!-- Params Tab -->
              <div class="tab-content active" id="params-tab">
                <div class="label-row">
                  <span>Query Params</span>
                  <button id="addParamBtn" type="button">添加参数</button>
                </div>
                <div id="paramRows"></div>
              </div>

              <!-- Body Tab -->
              <div class="tab-content" id="body-tab">
                <div class="row">
                  <label>Body 类型
                    <select id="bodyType">
                      <option value="json">JSON</option>
                      <option value="form-data">FormData</option>
                      <option value="urlencoded">x-www-form-urlencoded</option>
                      <option value="raw">Raw Text</option>
                    </select>
                  </label>
                </div>
                <div class="body-editor">
                  <div class="label-row">
                    <span>Body 内容</span>
                    <div>
                      <button id="formatJsonBtn" type="button" class="ghost mini hidden">格式化 JSON</button>
                      <button id="addBodyFieldBtn" type="button" class="hidden">添加字段</button>
                      <button id="toggleBodyModeBtn" type="button" class="ghost mini hidden">切换为文本模式</button>
                    </div>
                  </div>
                  <div id="bodyFields" class="hidden"></div>
                  <textarea id="bodyInput" rows="6" placeholder='{"key":"value"}'></textarea>
                </div>
                <div class="file-upload-section hidden" id="fileUploadSection">
                  <div class="label-row">
                    <span>文件上传</span>
                    <button id="addFileBtn" type="button">添加文件</button>
                  </div>
                  <div id="fileList"></div>
                  <input type="file" id="fileInput" multiple />
                </div>
              </div>

              <!-- Headers Tab -->
              <div class="tab-content" id="headers-tab">
                <div class="label-row">
                  <span>Request Headers</span>
                  <button id="addHeaderBtn" type="button">添加 Header</button>
                </div>
                <div id="headerRows"></div>
              </div>

              <!-- Cookie Tab -->
              <div class="tab-content" id="cookie-tab">
                <div class="label-row">
                  <span>Cookies</span>
                  <button id="addCookieBtn" type="button">添加 Cookie</button>
                </div>
                <div id="cookieRows"></div>
              </div>

              <!-- Auth Tab -->
              <div class="tab-content" id="auth-tab">
                <div class="auth-type-selector">
                  <label>认证类型
                    <select id="authType">
                      <option value="none">无</option>
                      <option value="bearer">Bearer Token</option>
                      <option value="basic">Basic Auth</option>
                      <option value="custom">自定义Header</option>
                    </select>
                  </label>
                </div>
                <div id="authContent"></div>
              </div>
            </div>

            <!-- 代理配置 -->
            <div class="proxy-section">
              <div class="label-row">
                <span>代理配置</span>
              </div>
              <label class="checkbox-label">
                <input type="checkbox" id="proxyEnabled" />
                <span>使用代理</span>
              </label>
              <div id="proxyConfigPanel" style="display: none;" class="proxy-config-form">
                <div class="proxy-row">
                  <label>代理地址 <input id="proxyHost" placeholder="例如：127.0.0.1" /></label>
                  <label>代理端口 <input id="proxyPort" type="number" value="8080" placeholder="8080" /></label>
                </div>
                <div class="proxy-row">
                  <label>用户名 <input id="proxyUsername" placeholder="可选" /></label>
                  <label>密码 <input id="proxyPassword" type="password" placeholder="可选" /></label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="right-column">
        <div class="block">
          <div class="block-header">
            <span>响应结果</span>
            <div>
              <button id="copyResponseBtn">复制响应</button>
            </div>
          </div>
          <div class="response">
            <div id="responseMeta"></div>
            <div id="responseContainer">
              <pre id="responseBody"></pre>
            </div>
          </div>
        </div>
      </div>
    </main>
  `

  const elems = {
    apiName: document.getElementById('apiName'),
    apiUrl: document.getElementById('apiUrl'),
    apiMethod: document.getElementById('apiMethod'),
    apiGroupInput: document.getElementById('apiGroupInput'),
    groupSuggest: document.querySelector('.group-suggest'),
    addParamBtn: document.getElementById('addParamBtn'),
    paramRows: document.getElementById('paramRows'),
    addHeaderBtn: document.getElementById('addHeaderBtn'),
    headerRows: document.getElementById('headerRows'),
    addCookieBtn: document.getElementById('addCookieBtn'),
    cookieRows: document.getElementById('cookieRows'),
    authType: document.getElementById('authType'),
    authContent: document.getElementById('authContent'),
    bodyType: document.getElementById('bodyType'),
    bodyInput: document.getElementById('bodyInput'),
    bodyFields: document.getElementById('bodyFields'),
    formatJsonBtn: document.getElementById('formatJsonBtn'),
    addBodyFieldBtn: document.getElementById('addBodyFieldBtn'),
    toggleBodyModeBtn: document.getElementById('toggleBodyModeBtn'),
    sendBtn: document.getElementById('sendBtn'),
    responseMeta: document.getElementById('responseMeta'),
    responseBody: document.getElementById('responseBody'),
    copyResponseBtn: document.getElementById('copyResponseBtn'),
    fileUploadSection: document.getElementById('fileUploadSection'),
    fileList: document.getElementById('fileList'),
    addFileBtn: document.getElementById('addFileBtn'),
    fileInput: document.getElementById('fileInput'),
    proxyEnabled: document.getElementById('proxyEnabled'),
    proxyConfigPanel: document.getElementById('proxyConfigPanel'),
    proxyHost: document.getElementById('proxyHost'),
    proxyPort: document.getElementById('proxyPort'),
    proxyUsername: document.getElementById('proxyUsername'),
    proxyPassword: document.getElementById('proxyPassword'),
    wsMessage: document.getElementById('wsMessage'),
    importCodeBtn: document.getElementById('importCodeBtn'),
    quickExportFormat: document.getElementById('quickExportFormat'),
  }

  let bodyEditMode = 'text' // "text" or "visual"
  let selectedFiles = [] // 存储选择的文件信息（包含内容）
  let currentConnId = null // 追踪当前活跃请求ID（WebSocket连接ID或HTTP请求ID）

  // Tab 切换功能
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab
      // 移除所有激活状态
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'))
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'))
      // 激活当前tab
      btn.classList.add('active')
      document.getElementById(`${tabName}-tab`).classList.add('active')
      // 触发body编辑器更新（如果切换到body tab）
      if (tabName === 'body') {
        setTimeout(() => updateBodyEditor(), 0)
      }
    })
  })

  window.addEventListener('message', (event) => {
    const { type, payload, selectedApiId, selectedGroupId } = event.data
    switch (type) {
      case 'state':
        state = payload || { groups: [], apis: [] }
        renderGroups()
        const hasExplicitSelection = selectedApiId !== undefined
        if (hasExplicitSelection) {
          const handled = applySelection(selectedApiId, selectedGroupId)
          if (!handled) syncCurrentApi()
          hasInitialState = true
          break
        }

        if (!hasInitialState) {
          hasInitialState = true
          syncCurrentApi()
        } else if (currentApiId) {
          const existing = state.apis.find((a) => a.id === currentApiId)
          if (!existing) {
            currentApiId = null
            fillApiForm(defaultApi())
          }
        }
        break
      case 'response':
        handleResponse(payload)
        break
      case 'wsMessage':
        handleWebSocketMessage(payload)
        break
      default:
        break
    }
  })

  // 分组输入框自动建议功能
  let groupActiveIndex = -1
  const groupInputElem = elems.apiGroupInput
  const groupSuggestBox = elems.groupSuggest

  const hideGroupSuggest = () => {
    groupSuggestBox.classList.remove('open')
    groupSuggestBox.innerHTML = ''
    groupActiveIndex = -1
  }

  const selectGroup = (group) => {
    groupInputElem.value = group.name
    groupInputElem.dataset.groupId = group.id
    hideGroupSuggest()
  }

  const renderGroupSuggest = () => {
    const keyword = (groupInputElem.value || '').trim().toLowerCase()
    let groupsToShow = state.groups
    
    if (keyword) {
      groupsToShow = state.groups.filter((g) => g.name.toLowerCase().includes(keyword))
    }

    if (groupsToShow.length === 0) {
      hideGroupSuggest()
      return
    }

    groupSuggestBox.innerHTML = ''
    groupsToShow.forEach((g, idx) => {
      const item = document.createElement('div')
      item.className = 'group-suggest-item'
      item.textContent = g.name
      item.dataset.groupId = g.id
      item.dataset.index = String(idx)
      item.onmousedown = (e) => {
        e.preventDefault()
        selectGroup(g)
      }
      groupSuggestBox.appendChild(item)
    })
    groupActiveIndex = 0
    Array.from(groupSuggestBox.children).forEach((child, idx) => {
      child.classList.toggle('active', idx === groupActiveIndex)
    })
    groupSuggestBox.classList.add('open')
  }

  groupInputElem.addEventListener('input', () => {
    const inputValue = groupInputElem.value.trim()
    const matchedGroup = state.groups.find((g) => g.name === inputValue)
    if (matchedGroup) {
      groupInputElem.dataset.groupId = matchedGroup.id
    } else {
      delete groupInputElem.dataset.groupId
    }
    renderGroupSuggest()
  })
  groupInputElem.addEventListener('focus', renderGroupSuggest)
  
  groupInputElem.addEventListener('keydown', (e) => {
    if (!groupSuggestBox.classList.contains('open')) return
    const total = groupSuggestBox.children.length
    if (e.key === 'ArrowDown') {
      groupActiveIndex = groupActiveIndex < total - 1 ? groupActiveIndex + 1 : 0
      Array.from(groupSuggestBox.children).forEach((child, idx) => {
        child.classList.toggle('active', idx === groupActiveIndex)
      })
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      groupActiveIndex = groupActiveIndex > 0 ? groupActiveIndex - 1 : total - 1
      Array.from(groupSuggestBox.children).forEach((child, idx) => {
        child.classList.toggle('active', idx === groupActiveIndex)
      })
      e.preventDefault()
    } else if (e.key === 'Enter') {
      const node = groupSuggestBox.children[groupActiveIndex]
      if (node) {
        const groupId = node.dataset.groupId
        const groupName = node.textContent
        selectGroup({ id: groupId, name: groupName })
        e.preventDefault()
      }
    } else if (e.key === 'Escape') {
      hideGroupSuggest()
    }
  })

  groupInputElem.addEventListener('blur', () => setTimeout(hideGroupSuggest, 120))

  elems.addParamBtn.addEventListener('click', () => addParamRow())
  elems.addHeaderBtn.addEventListener('click', () => addHeaderRow())
  elems.addCookieBtn.addEventListener('click', () => addCookieRow())

  elems.apiMethod.addEventListener('change', () => {
    updateUIforMethod()
  })

  elems.bodyType.addEventListener('change', () => {
    updateBodyEditor()
    updateBodyPlaceholder()
  })

  elems.authType.addEventListener('change', () => {
    renderAuthContent()
  })

  elems.formatJsonBtn.addEventListener('click', () => {
    formatJson()
  })

  elems.addBodyFieldBtn.addEventListener('click', () => addBodyField())

  elems.toggleBodyModeBtn.addEventListener('click', () => {
    toggleBodyMode()
  })

  elems.proxyEnabled.addEventListener('change', () => {
    elems.proxyConfigPanel.style.display = elems.proxyEnabled.checked ? 'block' : 'none'
  })

  elems.addFileBtn.addEventListener('click', () => {
    elems.fileInput.click()
  })

  elems.fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      // 读取文件内容为 base64
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64Content = event.target.result.split(',')[1] // 移除 data:xxx;base64, 前缀
        const fileInfo = {
          name: file.name,
          size: file.size,
          type: file.type,
          content: base64Content,
        }
        selectedFiles.push(fileInfo)
        addFileToList(fileInfo)
      }
      reader.readAsDataURL(file)
    }
    elems.fileInput.value = '' // 清空输入，允许重复选择同名文件
  })

  elems.sendBtn.addEventListener('click', () => {
    // 如果有活跃的连接（HTTP或WebSocket），点击按钮则停止
    if (currentConnId) {
      vscode.postMessage({ type: 'stopRequest' })
      currentConnId = null
      elems.sendBtn.disabled = false
      elems.sendBtn.textContent = '发送/保存'
      return
    }

    const api = collectApiForm()
    if (!api.url) {
      elems.responseMeta.textContent = '请先填写接口 URL'
      elems.responseBody.textContent = ''
      return
    }
    if (!api.name) {
      api.name = api.url
    }

    // 生成唯一的请求ID
    const requestId = generateRequestId()
    currentConnId = requestId

    // 禁用按钮，显示停止状态
    elems.sendBtn.disabled = false
    elems.sendBtn.textContent = '停止'

    vscode.postMessage({ type: 'saveApi', payload: api })
    currentApiId = api.id

    // 如果有文件，发送文件上传请求
    if (selectedFiles.length > 0) {
      vscode.postMessage({ type: 'sendRequestWithFiles', payload: { api, filePaths: selectedFiles } })
    } else {
      vscode.postMessage({ type: 'sendRequest', payload: api })
    }

    elems.responseMeta.textContent = '请求中...'
    elems.responseBody.textContent = ''
  })

  elems.copyResponseBtn.addEventListener('click', async () => {
    if (!lastResponse) return
    await navigator.clipboard.writeText(lastResponse.rawText || '')
    elems.responseMeta.textContent = '已复制响应内容'
  })

  elems.importCodeBtn.addEventListener('click', async () => {
    let source = ''
    try {
      source = (await navigator.clipboard.readText()).trim()
    } catch (error) {
      elems.responseMeta.textContent = `读取剪切板失败：${error.message || String(error)}`
      return
    }

    if (!source) {
      elems.responseMeta.textContent = '剪切板为空，请先复制 curl/fetch/wget 代码'
      return
    }

    try {
      const imported = parseApiFromSource(source, 'auto')
      const selectedGroupId = elems.apiGroupInput.dataset.groupId || null
      const nextApi = {
        ...defaultApi(selectedGroupId),
        ...imported,
        id: uid(),
        groupId: imported.groupId ?? selectedGroupId,
        name: imported.name || buildDefaultApiName(imported),
      }

      currentApiId = nextApi.id
      fillApiForm(nextApi)
      vscode.postMessage({ type: 'saveApi', payload: nextApi })
      elems.responseMeta.textContent = '已从剪切板导入并创建新接口'
    } catch (error) {
      elems.responseMeta.textContent = `导入失败：${error.message || String(error)}`
    }
  })

  elems.quickExportFormat.addEventListener('change', async () => {
    const format = elems.quickExportFormat.value
    if (!format) return

    const api = collectApiForm({ createGroup: false })
    if (!api.url) {
      elems.responseMeta.textContent = '请先填写接口 URL'
      elems.quickExportFormat.value = ''
      return
    }

    try {
      const code = generateCodeFromApi(api, format)
      await navigator.clipboard.writeText(code)
      elems.responseMeta.textContent = `已复制 ${format} 代码到剪切板`
    } catch (error) {
      elems.responseMeta.textContent = `导出失败：${error.message || String(error)}`
    } finally {
      elems.quickExportFormat.value = ''
    }
  })

  function defaultApi(selectedGroupId = null) {
    return {
      id: uid(),
      name: '',
      url: '',
      method: 'GET',
      groupId: selectedGroupId,
      headers: { 'User-Agent': 'VSCode-APIs-Tester' },
      params: {},
      cookies: {},
      auth: { type: 'none' },
      bodyType: 'json',
      body: '{}',
    }
  }

  function renderGroups() {
    // 分组列表已通过state.groups保存在内存中，
    // 分组输入框通过建议框展示，无需额外渲染
  }

  function fillApiForm(api) {
    if (!api) return
    if (!api.id) {
      api.id = uid()
    }
    elems.apiName.value = api.name || ''
    elems.apiUrl.value = api.url || ''
    elems.apiMethod.value = api.method || 'GET'
    
    // 填充分组
    if (api.groupId && state.groups.some((g) => g.id === api.groupId)) {
      const group = state.groups.find((g) => g.id === api.groupId)
      elems.apiGroupInput.value = group?.name || ''
      elems.apiGroupInput.dataset.groupId = api.groupId
    } else {
      elems.apiGroupInput.value = ''
      delete elems.apiGroupInput.dataset.groupId
    }
    
    elems.bodyType.value = api.bodyType || 'json'
    elems.bodyInput.value = api.body ? stringifyBody(api.body) : ''

    // 填充代理配置
    elems.proxyEnabled.checked = api.proxyEnabled || false
    elems.proxyHost.value = api.proxyHost || ''
    elems.proxyPort.value = api.proxyPort || 8080
    elems.proxyUsername.value = api.proxyUsername || ''
    elems.proxyPassword.value = api.proxyPassword || ''
    elems.proxyConfigPanel.style.display = elems.proxyEnabled.checked ? 'block' : 'none'

    // 填充Params
    elems.paramRows.innerHTML = ''
    const params = api.params || {}
    const paramEntries = Object.entries(params)
    if (paramEntries.length === 0) {
      addParamRow()
    } else {
      paramEntries.forEach(([key, value]) => addParamRow(key, value))
    }

    // 填充Headers
    elems.headerRows.innerHTML = ''
    const entries = Object.entries(api.headers || {})
    if (entries.length === 0) {
      addHeaderRow()
    } else {
      entries.forEach(([key, value]) => addHeaderRow(key, value))
    }

    // 填充Cookies
    elems.cookieRows.innerHTML = ''
    const cookies = api.cookies || {}
    const cookieEntries = Object.entries(cookies)
    if (cookieEntries.length === 0) {
      addCookieRow()
    } else {
      cookieEntries.forEach(([key, value]) => addCookieRow(key, value))
    }

    // 填充Auth
    const authConfig = api.auth || { type: 'none' }
    elems.authType.value = authConfig.type || 'none'
    renderAuthContent(authConfig)

    // 填充WebSocket消息
    elems.wsMessage.value = api.wsMessage || ''

    // 更新 body 编辑器
    updateBodyEditor()
    
    // 根据方法更新 UI
    updateUIforMethod()
  }

  function stringifyBody(body) {
    if (typeof body === 'string') return body
    try {
      return JSON.stringify(body, null, 2)
    } catch (err) {
      return String(body)
    }
  }

  function collectApiForm(options = {}) {
    const { createGroup = true } = options
    const headers = {}
    elems.headerRows.querySelectorAll('.header-row').forEach((row) => {
      const key = row.querySelector('.h-key').value.trim()
      const value = row.querySelector('.h-val').value.trim()
      if (key) headers[key] = value
    })

    const params = {}
    elems.paramRows.querySelectorAll('.param-row').forEach((row) => {
      const key = row.querySelector('.p-key').value.trim()
      const value = row.querySelector('.p-val').value.trim()
      if (key) params[key] = value
    })

    const cookies = {}
    elems.cookieRows.querySelectorAll('.cookie-row').forEach((row) => {
      const key = row.querySelector('.c-key').value.trim()
      const value = row.querySelector('.c-val').value.trim()
      if (key) cookies[key] = value
    })

    // 收集Auth配置
    const authType = elems.authType.value
    const auth = { type: authType }
    if (authType === 'bearer') {
      const tokenInput = document.getElementById('authBearerToken')
      if (tokenInput) {
        auth.bearer = tokenInput.value.trim()
      }
    } else if (authType === 'basic') {
      const usernameInput = document.getElementById('authBasicUsername')
      const passwordInput = document.getElementById('authBasicPassword')
      if (usernameInput) auth.username = usernameInput.value.trim()
      if (passwordInput) auth.password = passwordInput.value.trim()
    } else if (authType === 'custom') {
      const customInput = document.getElementById('authCustomValue')
      if (customInput) {
        auth.custom = customInput.value.trim()
      }
    }

    // 从表单获取分组ID
    let groupId = elems.apiGroupInput.dataset.groupId || null
    const groupInputValue = elems.apiGroupInput.value.trim()
    
    // 如果输入了分组名但没有对应的groupId，说明是新分组
    if (groupInputValue && !groupId) {
      // 检查是否已存在这个分组
      const existingGroup = state.groups.find((g) => g.name === groupInputValue)
      if (existingGroup) {
        groupId = existingGroup.id
      } else {
        if (createGroup) {
          // 创建新分组
          const newGroup = { id: uid(), name: groupInputValue }
          vscode.postMessage({ type: 'saveGroup', payload: newGroup })
          groupId = newGroup.id
        } else {
          groupId = null
        }
      }
    } else if (!groupInputValue) {
      groupId = null
    }

    // 收集 body 数据
    let body = ''
    if (bodyEditMode === 'visual' && (elems.bodyType.value === 'form-data' || elems.bodyType.value === 'urlencoded')) {
      const bodyObj = {}
      elems.bodyFields.querySelectorAll('.body-field-row').forEach((row) => {
        const key = row.querySelector('.bf-key').value.trim()
        const value = row.querySelector('.bf-val').value.trim()
        if (key) bodyObj[key] = value
      })
      body = JSON.stringify(bodyObj)
    } else {
      body = elems.bodyInput.value
    }

    // 收集代理配置
    const proxyEnabled = elems.proxyEnabled.checked
    const proxyHost = elems.proxyHost.value.trim()
    const proxyPort = parseInt(elems.proxyPort.value) || 8080
    const proxyUsername = elems.proxyUsername.value.trim()
    const proxyPassword = elems.proxyPassword.value.trim()

    const apiObj = {
      id: currentApiId || uid(),
      name: elems.apiName.value.trim(),
      url: elems.apiUrl.value.trim(),
      method: elems.apiMethod.value,
      groupId: groupId,
      headers,
      params: Object.keys(params).length > 0 ? params : undefined,
      cookies: Object.keys(cookies).length > 0 ? cookies : undefined,
      auth: auth.type !== 'none' ? auth : undefined,
      bodyType: elems.bodyType.value,
      body: body,
      wsMessage: elems.wsMessage ? elems.wsMessage.value.trim() : undefined,
    }

    // 仅在代理启用时才添加代理配置字段
    if (proxyEnabled && proxyHost) {
      apiObj.proxyEnabled = true
      apiObj.proxyHost = proxyHost
      apiObj.proxyPort = proxyPort
      if (proxyUsername) apiObj.proxyUsername = proxyUsername
      if (proxyPassword) apiObj.proxyPassword = proxyPassword
    }

    return apiObj
  }

  function addParamRow(key = '', value = '') {
    const row = document.createElement('div')
    row.className = 'param-row'
    row.innerHTML = `
      <input class="p-key" placeholder="参数名" value="${key}" />
      <input class="p-val" placeholder="参数值" value="${value}" />
      <button class="mini ghost">x</button>
    `
    const removeBtn = row.querySelector('button')
    removeBtn.onclick = () => row.remove()
    elems.paramRows.appendChild(row)
  }

  function addHeaderRow(key = '', value = '') {
    const row = document.createElement('div')
    row.className = 'header-row'
    row.innerHTML = `
      <div class="h-key-wrap">
        <input class="h-key" placeholder="Key" value="${key}" autocomplete="off" />
        <div class="header-suggest"></div>
      </div>
      <input class="h-val" placeholder="Value" value="${value}" />
      <button class="mini ghost">x</button>
    `
    const removeBtn = row.querySelector('button')
    const keyInput = row.querySelector('.h-key')
    const suggestBox = row.querySelector('.header-suggest')
    removeBtn.onclick = () => row.remove()
    attachHeaderSuggest(keyInput, suggestBox)
    elems.headerRows.appendChild(row)
  }

  function addCookieRow(key = '', value = '') {
    const row = document.createElement('div')
    row.className = 'cookie-row'
    row.innerHTML = `
      <input class="c-key" placeholder="Cookie名" value="${key}" />
      <input class="c-val" placeholder="Cookie值" value="${value}" />
      <button class="mini ghost">x</button>
    `
    const removeBtn = row.querySelector('button')
    removeBtn.onclick = () => row.remove()
    elems.cookieRows.appendChild(row)
  }

  function renderAuthContent(authConfig = {}) {
    const type = elems.authType.value || authConfig.type || 'none'
    elems.authContent.innerHTML = ''

    if (type === 'none') {
      return
    }

    if (type === 'bearer') {
      const div = document.createElement('div')
      const token = authConfig.bearer || ''
      div.innerHTML = `
        <label class="full-width">
          Bearer Token
          <input id="authBearerToken" type="password" placeholder="输入Bearer token" value="${token}" />
        </label>
      `
      elems.authContent.appendChild(div)
    } else if (type === 'basic') {
      const div = document.createElement('div')
      const username = authConfig.username || ''
      const password = authConfig.password || ''
      div.innerHTML = `
        <label class="full-width">
          用户名
          <input id="authBasicUsername" placeholder="用户名" value="${username}" />
        </label>
        <label class="full-width">
          密码
          <input id="authBasicPassword" type="password" placeholder="密码" value="${password}" />
        </label>
      `
      elems.authContent.appendChild(div)
    } else if (type === 'custom') {
      const div = document.createElement('div')
      const customValue = authConfig.custom || ''
      div.innerHTML = `
        <label class="full-width">
          自定义认证值
          <input id="authCustomValue" placeholder="例如：Authorization: Custom xxx" value="${customValue}" />
        </label>
      `
      elems.authContent.appendChild(div)
    }
  }

  function attachHeaderSuggest(input, listEl) {
    let activeIndex = -1

    const hide = () => {
      listEl.classList.remove('open')
      listEl.innerHTML = ''
      activeIndex = -1
    }

    const applyValue = (val) => {
      input.value = val
      hide()
      input.focus()
    }

    const highlightActive = () => {
      Array.from(listEl.children).forEach((child, idx) => {
        child.classList.toggle('active', idx === activeIndex)
      })
    }

    const render = () => {
      const keyword = (input.value || '').trim().toLowerCase()
      const hits = HEADERS_CATALOG.filter((h) => h.toLowerCase().includes(keyword)).slice(0, 10)
      if (hits.length === 0) {
        hide()
        return
      }
      listEl.innerHTML = ''
      hits.forEach((h, idx) => {
        const item = document.createElement('div')
        item.className = 'suggest-item'
        item.textContent = h
        item.dataset.index = String(idx)
        item.onclick = (e) => {
          e.preventDefault()
          applyValue(h)
        }
        listEl.appendChild(item)
      })
      activeIndex = 0
      highlightActive()
      listEl.classList.add('open')
    }

    input.addEventListener('input', render)
    input.addEventListener('focus', render)
    input.addEventListener('keydown', (e) => {
      if (!listEl.classList.contains('open')) return
      const total = listEl.children.length
      if (e.key === 'ArrowDown') {
        activeIndex = activeIndex < total - 1 ? activeIndex + 1 : 0
        highlightActive()
        e.preventDefault()
      } else if (e.key === 'ArrowUp') {
        activeIndex = activeIndex > 0 ? activeIndex - 1 : total - 1
        highlightActive()
        e.preventDefault()
      } else if (e.key === 'Enter') {
        const node = listEl.children[activeIndex]
        if (node) {
          applyValue(node.textContent || '')
          e.preventDefault()
        }
      } else if (e.key === 'Escape') {
        hide()
      }
    })
    input.addEventListener('blur', () => setTimeout(hide, 120))
  }

  function handleResponse(res) {
    if (!res) return

    // 响应完成，清除活跃请求ID并恢复按钮
    currentConnId = null
    elems.sendBtn.disabled = false
    elems.sendBtn.textContent = '发送/保存'

    if (!res.success) {
      elems.responseMeta.textContent = `请求失败：${res.error}`
      elems.responseBody.textContent = ''
      lastResponse = null
      return
    }
    
    // WebSocket 特殊处理（暂不关闭连接）
    if (res.status === 101) {
      // 记录连接ID，改变按钮为"停止连接"
      currentConnId = res.connId
      elems.sendBtn.disabled = false
      elems.sendBtn.textContent = '停止'
      
      elems.responseMeta.textContent = `WebSocket 连接 - 状态：${res.status} ${res.statusText}`
      elems.responseBody.textContent = res.data || '无消息'
      lastResponse = { rawText: elems.responseBody.textContent }
      return
    }
    
    const headers = JSON.stringify(res.headers, null, 2)
    const bodyText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2)
    elems.responseMeta.textContent = `状态：${res.status} ${res.statusText}`
    elems.responseBody.textContent = `Headers:\n${headers}\n\nBody:\n${bodyText}`
    lastResponse = { rawText: elems.responseBody.textContent }
  }

  function handleWebSocketMessage(payload) {
    const { connId, message, isClose } = payload
    if (!elems.responseMeta.textContent.includes('WebSocket')) {
      // 初始化响应元数据
      elems.responseMeta.textContent = 'WebSocket 已连接'
      elems.responseBody.textContent = ''
    }
    
    // 追加消息
    if (elems.responseBody.textContent) {
      elems.responseBody.textContent += '\n' + message
    } else {
      elems.responseBody.textContent = message
    }
    
    // 如果连接已关闭，清除connId并恢复按钮
    if (isClose) {
      currentConnId = null
      elems.sendBtn.disabled = false
      elems.sendBtn.textContent = '发送/保存'
    }
    
    // 自动滚动到底部
    const responseContainer = document.querySelector('.response')
    if (responseContainer) {
      setTimeout(() => {
        responseContainer.scrollTop = responseContainer.scrollHeight
      }, 0)
    }
    
    lastResponse = { rawText: elems.responseBody.textContent }
  }

  function applySelection(apiId, groupId = null) {
    if (apiId === null) {
      currentApiId = null
      fillApiForm(defaultApi(groupId ?? null))
      scrollToConfig()
      return true
    }
    if (typeof apiId === 'string') {
      const match = state.apis.find((a) => a.id === apiId)
      if (match) {
        currentApiId = match.id
        fillApiForm(match)
        scrollToConfig()
        return true
      }
    }
    return false
  }

  function syncCurrentApi() {
    if (currentApiId) {
      const api = state.apis.find((a) => a.id === currentApiId)
      if (api) {
        fillApiForm(api)
        return
      }
    }
    const first = state.apis[0]
    if (first) {
      currentApiId = first.id
      fillApiForm(first)
    } else {
      currentApiId = null
      fillApiForm(defaultApi())
    }
  }

  function scrollToConfig() {
    const target = document.getElementById('configBlock')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function updateBodyEditor() {
    const bodyType = elems.bodyType.value
    const supportsVisual = bodyType === 'form-data' || bodyType === 'urlencoded'

    // form-data 类型时显示文件上传区域
    if (bodyType === 'form-data') {
      elems.fileUploadSection.classList.remove('hidden')
    } else {
      elems.fileUploadSection.classList.add('hidden')
      selectedFiles = []
      elems.fileList.innerHTML = ''
    }

    // JSON 类型显示格式化按钮
    if (bodyType === 'json') {
      elems.formatJsonBtn.classList.remove('hidden')
      elems.toggleBodyModeBtn.classList.add('hidden')
      elems.addBodyFieldBtn.classList.add('hidden')
      elems.bodyFields.classList.add('hidden')
      elems.bodyInput.classList.remove('hidden')
      bodyEditMode = 'text'
    }
    // 表单数据支持可视化
    else if (supportsVisual) {
      elems.formatJsonBtn.classList.add('hidden')
      elems.toggleBodyModeBtn.classList.remove('hidden')
      if (bodyEditMode === 'visual') {
        elems.addBodyFieldBtn.classList.remove('hidden')
        elems.bodyFields.classList.remove('hidden')
        elems.bodyInput.classList.add('hidden')
      } else {
        elems.addBodyFieldBtn.classList.add('hidden')
        elems.bodyFields.classList.add('hidden')
        elems.bodyInput.classList.remove('hidden')
      }

      if (bodyEditMode === 'visual') {
        elems.toggleBodyModeBtn.textContent = '切换为文本模式'
        syncBodyFieldsFromText()
      } else {
        elems.toggleBodyModeBtn.textContent = '切换为可视化模式'
      }
    }
    // 其他类型只显示文本框
    else {
      bodyEditMode = 'text'
      elems.formatJsonBtn.classList.add('hidden')
      elems.toggleBodyModeBtn.classList.add('hidden')
      elems.addBodyFieldBtn.classList.add('hidden')
      elems.bodyFields.classList.add('hidden')
      elems.bodyInput.classList.remove('hidden')
    }
  }

  function updateBodyPlaceholder() {
    const bodyType = elems.bodyType.value
    const placeholders = {
      json: '{"key":"value"}',
      'form-data': 'key=value&key2=value2',
      urlencoded: 'key=value&key2=value2',
      raw: 'Enter your raw text content here',
    }
    elems.bodyInput.placeholder = placeholders[bodyType] || ''
  }

  function updateUIforMethod() {
    const method = elems.apiMethod.value
    const isWebSocket = method === 'WebSocket'
    
    const tabContainer = document.querySelector('.tabs-container')
    const wsMessageSection = document.getElementById('wsMessageSection')
    
    if (isWebSocket) {
      // 隐藏标签容器，显示 WebSocket 消息区域
      tabContainer.style.display = 'none'
      wsMessageSection.style.display = 'block'
    } else {
      // 显示标签容器，隐藏 WebSocket 消息区域
      tabContainer.style.display = 'block'
      wsMessageSection.style.display = 'none'
    }
  }

  function formatJson() {
    const text = elems.bodyInput.value.trim()
    if (!text) return

    try {
      const obj = JSON.parse(text)
      elems.bodyInput.value = JSON.stringify(obj, null, 2)
    } catch (e) {
      elems.responseMeta.textContent = 'JSON 格式错误：' + e.message
      setTimeout(() => {
        elems.responseMeta.textContent = ''
      }, 3000)
    }
  }

  function toggleBodyMode() {
    if (bodyEditMode === 'text') {
      bodyEditMode = 'visual'
      updateBodyEditor()
    } else {
      bodyEditMode = 'text'
      syncBodyTextFromFields()
      updateBodyEditor()
    }
  }

  function syncBodyFieldsFromText() {
    elems.bodyFields.innerHTML = ''
    const text = elems.bodyInput.value.trim()
    if (!text) {
      addBodyField()
      return
    }

    try {
      const obj = JSON.parse(text)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const entries = Object.entries(obj)
        if (entries.length === 0) {
          addBodyField()
        } else {
          entries.forEach(([key, value]) => {
            addBodyField(key, typeof value === 'string' ? value : JSON.stringify(value))
          })
        }
        return
      }
    } catch (e) {
      // 如果不是有效的 JSON，尝试解析为键值对格式
    }

    addBodyField()
  }

  function syncBodyTextFromFields() {
    const bodyObj = {}
    elems.bodyFields.querySelectorAll('.body-field-row').forEach((row) => {
      const key = row.querySelector('.bf-key').value.trim()
      const value = row.querySelector('.bf-val').value.trim()
      if (key) bodyObj[key] = value
    })

    if (Object.keys(bodyObj).length > 0) {
      elems.bodyInput.value = JSON.stringify(bodyObj, null, 2)
    }
  }

  function addBodyField(key = '', value = '') {
    const row = document.createElement('div')
    row.className = 'body-field-row'
    row.innerHTML = `
      <input class="bf-key" placeholder="Key" value="${key}" />
      <input class="bf-val" placeholder="Value" value="${value}" />
      <button class="mini ghost">x</button>
    `
    const removeBtn = row.querySelector('button')
    removeBtn.onclick = () => row.remove()
    elems.bodyFields.appendChild(row)
  }

  function addFileToList(file) {
    const row = document.createElement('div')
    row.className = 'file-item'
    const sizeText = formatFileSize(file.size)
    row.innerHTML = `
      <div class="file-info">
        <span class="file-name">${file.name}</span>
        <span class="file-size">${sizeText}</span>
      </div>
      <button class="mini ghost">移除</button>
    `
    const removeBtn = row.querySelector('button')
    removeBtn.onclick = () => {
      const index = selectedFiles.indexOf(file)
      if (index > -1) {
        selectedFiles.splice(index, 1)
      }
      row.remove()
    }
    elems.fileList.appendChild(row)
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  function parseApiFromSource(source, preferredFormat = 'auto') {
    const format = detectSourceFormat(source, preferredFormat)
    if (format === 'curl') return parseCurlSource(source)
    if (format === 'fetch') return parseFetchSource(source)
    if (format === 'wget') return parseWgetSource(source)
    throw new Error('暂不支持该代码格式')
  }

  function detectSourceFormat(source, preferredFormat = 'auto') {
    const format = (preferredFormat || 'auto').toLowerCase()
    if (format !== 'auto') return format

    const text = source.trim()
    if (/^\s*curl(?:\.exe)?\b/i.test(text)) return 'curl'
    if (/\bfetch\s*\(/i.test(text)) return 'fetch'
    if (/^\s*wget(?:\.exe)?\b/i.test(text)) return 'wget'
    throw new Error('无法自动识别代码类型，请手动选择格式')
  }

  function normalizeShellSource(source) {
    return source
      .replace(/\\\r?\n/g, ' ')
      .replace(/`\r?\n/g, ' ')
      .trim()
  }

  function tokenizeShellCommand(command) {
    const tokens = []
    let current = ''
    let quote = ''

    for (let i = 0; i < command.length; i += 1) {
      const ch = command[i]

      if (quote) {
        if (ch === quote) {
          quote = ''
          continue
        }
        if (ch === '\\' && i + 1 < command.length) {
          current += command[i + 1]
          i += 1
          continue
        }
        current += ch
        continue
      }

      if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current)
          current = ''
        }
        continue
      }

      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }

      if (ch === '\\' && i + 1 < command.length) {
        current += command[i + 1]
        i += 1
        continue
      }

      current += ch
    }

    if (current) tokens.push(current)
    return tokens
  }

  function parseCommandOption(tokens, index) {
    const token = tokens[index]
    const eq = token.indexOf('=')
    if (eq >= 0) {
      return { value: token.slice(eq + 1), nextIndex: index }
    }
    return { value: tokens[index + 1] || '', nextIndex: index + 1 }
  }

  function applyHeaderLine(raw, headers, cookies) {
    const idx = raw.indexOf(':')
    if (idx <= 0) return

    const key = raw.slice(0, idx).trim()
    const value = raw.slice(idx + 1).trim()
    if (!key) return

    if (key.toLowerCase() === 'cookie') {
      Object.assign(cookies, parseCookieString(value))
      return
    }

    headers[key] = value
  }

  function parseCookieString(cookieText) {
    const result = {}
    const pieces = String(cookieText || '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)

    pieces.forEach((piece) => {
      const eq = piece.indexOf('=')
      if (eq <= 0) return
      const key = piece.slice(0, eq).trim()
      const value = piece.slice(eq + 1).trim()
      if (key) result[key] = value
    })
    return result
  }

  function splitUrlAndParams(rawUrl) {
    const urlText = String(rawUrl || '').trim()
    if (!urlText) return { url: '', params: {} }

    try {
      const parsed = new URL(urlText)
      const params = {}
      parsed.searchParams.forEach((value, key) => {
        params[key] = value
      })
      parsed.search = ''
      return { url: parsed.toString(), params }
    } catch {
      const qIndex = urlText.indexOf('?')
      if (qIndex < 0) return { url: urlText, params: {} }

      const base = urlText.slice(0, qIndex)
      const query = urlText.slice(qIndex + 1)
      const params = {}
      const queryPairs = query.split('&').filter(Boolean)
      queryPairs.forEach((pair) => {
        const [rawKey, rawVal = ''] = pair.split('=')
        const key = decodeURIComponent(rawKey || '').trim()
        if (!key) return
        params[key] = decodeURIComponent(rawVal || '').trim()
      })
      return { url: base, params }
    }
  }

  function inferBodyType(headers, bodyText) {
    const normalizedHeaders = Object.entries(headers || {}).reduce((acc, [key, value]) => {
      acc[String(key).toLowerCase()] = String(value)
      return acc
    }, {})

    const contentType = normalizedHeaders['content-type'] || ''
    if (contentType.includes('application/json')) return 'json'
    if (contentType.includes('application/x-www-form-urlencoded')) return 'urlencoded'
    if (contentType.includes('multipart/form-data')) return 'form-data'

    const trimmed = String(bodyText || '').trim()
    if (!trimmed) return 'json'
    if (tryParseJsonLike(trimmed) !== null) return 'json'
    if (/^[^=\s]+=[^\n]+(&[^=\s]+=[^\n]+)*$/.test(trimmed)) return 'urlencoded'
    return 'raw'
  }

  function normalizeBodyValue(bodyText, bodyType) {
    const raw = String(bodyText || '').trim()
    if (!raw) return ''

    if (bodyType === 'json') {
      const parsed = tryParseJsonLike(raw)
      if (parsed !== null) {
        return JSON.stringify(parsed, null, 2)
      }
    }

    return raw
  }

  function extractAuthFromHeaders(headers) {
    const entries = Object.entries(headers || {})
    const authEntry = entries.find(([key]) => key.toLowerCase() === 'authorization')
    if (!authEntry) return undefined

    const value = String(authEntry[1] || '').trim()
    if (!value) return undefined

    if (/^bearer\s+/i.test(value)) {
      return { type: 'bearer', bearer: value.replace(/^bearer\s+/i, '').trim() }
    }

    if (/^basic\s+/i.test(value)) {
      const encoded = value.replace(/^basic\s+/i, '').trim()
      try {
        const decoded = atob(encoded)
        const idx = decoded.indexOf(':')
        if (idx >= 0) {
          return { type: 'basic', username: decoded.slice(0, idx), password: decoded.slice(idx + 1) }
        }
      } catch {
        // ignore decode error
      }
    }

    return { type: 'custom', custom: `Authorization: ${value}` }
  }

  function finalizeImportedApi(data) {
    const output = {
      url: data.url || '',
      method: data.method || 'GET',
      headers: data.headers || {},
      bodyType: data.bodyType || 'json',
      body: data.body || '',
    }

    if (data.params && Object.keys(data.params).length > 0) {
      output.params = data.params
    }
    if (data.cookies && Object.keys(data.cookies).length > 0) {
      output.cookies = data.cookies
    }
    if (data.auth && data.auth.type && data.auth.type !== 'none') {
      output.auth = data.auth
    }
    if (data.wsMessage) {
      output.wsMessage = data.wsMessage
    }

    return output
  }

  function parseCurlSource(source) {
    const command = normalizeShellSource(source)
    const tokens = tokenizeShellCommand(command)
    if (!tokens.length || !/^curl(?:\.exe)?$/i.test(tokens[0])) {
      throw new Error('不是有效的 curl 命令')
    }

    let method = 'GET'
    let url = ''
    let body = ''
    let hasBody = false
    let hasExplicitMethod = false
    const headers = {}
    const cookies = {}
    let auth

    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i]

      if (token === '-X' || token === '--request' || token.startsWith('--request=')) {
        const parsed = parseCommandOption(tokens, i)
        method = String(parsed.value || 'GET').toUpperCase()
        hasExplicitMethod = true
        i = parsed.nextIndex
        continue
      }

      if (token === '-H' || token === '--header' || token.startsWith('--header=')) {
        const parsed = parseCommandOption(tokens, i)
        applyHeaderLine(parsed.value, headers, cookies)
        i = parsed.nextIndex
        continue
      }

      if (
        token === '-d' ||
        token === '--data' ||
        token === '--data-raw' ||
        token === '--data-binary' ||
        token === '--data-urlencode' ||
        token.startsWith('--data=') ||
        token.startsWith('--data-raw=') ||
        token.startsWith('--data-binary=') ||
        token.startsWith('--data-urlencode=')
      ) {
        const parsed = parseCommandOption(tokens, i)
        body = parsed.value || ''
        hasBody = true
        i = parsed.nextIndex
        continue
      }

      if (token === '-b' || token === '--cookie' || token.startsWith('--cookie=')) {
        const parsed = parseCommandOption(tokens, i)
        Object.assign(cookies, parseCookieString(parsed.value || ''))
        i = parsed.nextIndex
        continue
      }

      if (token === '-u' || token === '--user' || token.startsWith('--user=')) {
        const parsed = parseCommandOption(tokens, i)
        const userPair = String(parsed.value || '')
        const sep = userPair.indexOf(':')
        auth = {
          type: 'basic',
          username: sep >= 0 ? userPair.slice(0, sep) : userPair,
          password: sep >= 0 ? userPair.slice(sep + 1) : '',
        }
        i = parsed.nextIndex
        continue
      }

      if (token === '-I' || token === '--head') {
        method = 'HEAD'
        hasExplicitMethod = true
        continue
      }

      if (token === '--url' || token.startsWith('--url=')) {
        const parsed = parseCommandOption(tokens, i)
        url = parsed.value || url
        i = parsed.nextIndex
        continue
      }

      if (/^https?:\/\//i.test(token) || /^wss?:\/\//i.test(token)) {
        url = token
      }
    }

    if (!url) {
      throw new Error('未识别到 URL')
    }

    if (!hasExplicitMethod && hasBody) {
      method = 'POST'
    }

    const { url: cleanUrl, params } = splitUrlAndParams(url)
    if (!auth) auth = extractAuthFromHeaders(headers)
    const isWebSocket = /^wss?:\/\//i.test(cleanUrl)
    if (isWebSocket) method = 'WebSocket'

    const bodyType = inferBodyType(headers, body)

    return finalizeImportedApi({
      url: cleanUrl,
      method,
      headers,
      params,
      cookies,
      auth,
      bodyType,
      body: normalizeBodyValue(body, bodyType),
      wsMessage: isWebSocket ? body : undefined,
    })
  }

  function parseWgetSource(source) {
    const command = normalizeShellSource(source)
    const tokens = tokenizeShellCommand(command)
    if (!tokens.length || !/^wget(?:\.exe)?$/i.test(tokens[0])) {
      throw new Error('不是有效的 wget 命令')
    }

    let method = 'GET'
    let url = ''
    let body = ''
    let hasBody = false
    let user = ''
    let password = ''
    const headers = {}
    const cookies = {}

    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i]

      if (token === '--method' || token.startsWith('--method=')) {
        const parsed = parseCommandOption(tokens, i)
        method = String(parsed.value || 'GET').toUpperCase()
        i = parsed.nextIndex
        continue
      }

      if (token === '--header' || token.startsWith('--header=')) {
        const parsed = parseCommandOption(tokens, i)
        applyHeaderLine(parsed.value, headers, cookies)
        i = parsed.nextIndex
        continue
      }

      if (
        token === '--body-data' ||
        token === '--post-data' ||
        token.startsWith('--body-data=') ||
        token.startsWith('--post-data=')
      ) {
        const parsed = parseCommandOption(tokens, i)
        body = parsed.value || ''
        hasBody = true
        i = parsed.nextIndex
        continue
      }

      if (token === '--user' || token.startsWith('--user=')) {
        const parsed = parseCommandOption(tokens, i)
        user = parsed.value || ''
        i = parsed.nextIndex
        continue
      }

      if (token === '--password' || token.startsWith('--password=')) {
        const parsed = parseCommandOption(tokens, i)
        password = parsed.value || ''
        i = parsed.nextIndex
        continue
      }

      if (/^https?:\/\//i.test(token) || /^wss?:\/\//i.test(token)) {
        url = token
      }
    }

    if (!url) throw new Error('未识别到 URL')
    if (method === 'GET' && hasBody) method = 'POST'

    const { url: cleanUrl, params } = splitUrlAndParams(url)
    const isWebSocket = /^wss?:\/\//i.test(cleanUrl)
    if (isWebSocket) method = 'WebSocket'

    let auth
    if (user || password) {
      auth = { type: 'basic', username: user, password }
    } else {
      auth = extractAuthFromHeaders(headers)
    }

    const bodyType = inferBodyType(headers, body)

    return finalizeImportedApi({
      url: cleanUrl,
      method,
      headers,
      params,
      cookies,
      auth,
      bodyType,
      body: normalizeBodyValue(body, bodyType),
      wsMessage: isWebSocket ? body : undefined,
    })
  }

  function parseFetchSource(source) {
    const text = source.trim()
    const fetchIndex = text.indexOf('fetch')
    if (fetchIndex < 0) throw new Error('不是有效的 fetch 代码')

    const openParen = text.indexOf('(', fetchIndex)
    if (openParen < 0) throw new Error('fetch 语法不完整')

    const closeParen = findMatchingBracket(text, openParen, '(', ')')
    if (closeParen < 0) throw new Error('fetch 参数解析失败')

    const argsText = text.slice(openParen + 1, closeParen)
    const args = splitTopLevel(argsText, ',')
    if (!args.length) throw new Error('fetch 参数为空')

    const rawUrl = args[0].trim()
    const url = parseStringOrRaw(rawUrl)
    if (!url) throw new Error('未识别到 URL')

    const headers = {}
    const cookies = {}
    let method = 'GET'
    let body = ''
    let hasMethod = false
    let auth

    if (args.length > 1) {
      const rawOptions = args.slice(1).join(',').trim()
      const props = parseObjectPropertiesRaw(rawOptions)

      if (props.method) {
        method = String(parseStringOrRaw(props.method) || 'GET').toUpperCase()
        hasMethod = true
      }

      if (props.headers) {
        const headerMap = parseHeaderObjectRaw(props.headers)
        Object.entries(headerMap).forEach(([key, value]) => {
          if (key.toLowerCase() === 'cookie') {
            Object.assign(cookies, parseCookieString(value))
          } else {
            headers[key] = value
          }
        })
      }

      if (props.body) {
        body = parseFetchBodyRaw(props.body)
      }
    }

    if (!hasMethod && body) {
      method = 'POST'
    }

    const { url: cleanUrl, params } = splitUrlAndParams(url)
    const isWebSocket = /^wss?:\/\//i.test(cleanUrl)
    if (isWebSocket) method = 'WebSocket'

    auth = extractAuthFromHeaders(headers)
    const bodyType = inferBodyType(headers, body)

    return finalizeImportedApi({
      url: cleanUrl,
      method,
      headers,
      params,
      cookies,
      auth,
      bodyType,
      body: normalizeBodyValue(body, bodyType),
      wsMessage: isWebSocket ? body : undefined,
    })
  }

  function splitTopLevel(text, delimiter) {
    const result = []
    let current = ''
    let quote = ''
    let depthParen = 0
    let depthBrace = 0
    let depthBracket = 0

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]

      if (quote) {
        current += ch
        if (ch === '\\' && i + 1 < text.length) {
          current += text[i + 1]
          i += 1
          continue
        }
        if (ch === quote) {
          quote = ''
        }
        continue
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
        current += ch
        continue
      }

      if (ch === '(') depthParen += 1
      if (ch === ')') depthParen = Math.max(0, depthParen - 1)
      if (ch === '{') depthBrace += 1
      if (ch === '}') depthBrace = Math.max(0, depthBrace - 1)
      if (ch === '[') depthBracket += 1
      if (ch === ']') depthBracket = Math.max(0, depthBracket - 1)

      if (ch === delimiter && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
        if (current.trim()) result.push(current.trim())
        current = ''
        continue
      }

      current += ch
    }

    if (current.trim()) result.push(current.trim())
    return result
  }

  function findMatchingBracket(text, startIndex, openCh, closeCh) {
    let depth = 0
    let quote = ''

    for (let i = startIndex; i < text.length; i += 1) {
      const ch = text[i]

      if (quote) {
        if (ch === '\\' && i + 1 < text.length) {
          i += 1
          continue
        }
        if (ch === quote) quote = ''
        continue
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
        continue
      }

      if (ch === openCh) depth += 1
      if (ch === closeCh) {
        depth -= 1
        if (depth === 0) return i
      }
    }

    return -1
  }

  function parseObjectPropertiesRaw(rawObjectText) {
    const text = String(rawObjectText || '').trim()
    if (!text.startsWith('{') || !text.endsWith('}')) return {}

    const inner = text.slice(1, -1).trim()
    if (!inner) return {}

    const props = {}
    const segments = splitTopLevel(inner, ',')
    segments.forEach((segment) => {
      const colonIndex = findTopLevelColon(segment)
      if (colonIndex < 0) return
      const rawKey = segment.slice(0, colonIndex).trim()
      const rawValue = segment.slice(colonIndex + 1).trim()
      const key = normalizeObjectKey(rawKey)
      if (!key) return
      props[key] = rawValue
    })

    return props
  }

  function findTopLevelColon(text) {
    let quote = ''
    let depthParen = 0
    let depthBrace = 0
    let depthBracket = 0

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i]

      if (quote) {
        if (ch === '\\' && i + 1 < text.length) {
          i += 1
          continue
        }
        if (ch === quote) quote = ''
        continue
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
        continue
      }

      if (ch === '(') depthParen += 1
      if (ch === ')') depthParen = Math.max(0, depthParen - 1)
      if (ch === '{') depthBrace += 1
      if (ch === '}') depthBrace = Math.max(0, depthBrace - 1)
      if (ch === '[') depthBracket += 1
      if (ch === ']') depthBracket = Math.max(0, depthBracket - 1)

      if (ch === ':' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
        return i
      }
    }

    return -1
  }

  function normalizeObjectKey(rawKey) {
    const key = String(rawKey || '').trim()
    if (!key) return ''
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")) || (key.startsWith('`') && key.endsWith('`'))) {
      return key.slice(1, -1)
    }
    return key
  }

  function parseStringOrRaw(rawValue) {
    const text = String(rawValue || '').trim()
    if (!text) return ''

    const quote = text[0]
    const isQuoted = (quote === '"' || quote === "'" || quote === '`') && text[text.length - 1] === quote
    if (!isQuoted) return text

    if (quote === '"') {
      try {
        return JSON.parse(text)
      } catch {
        return text.slice(1, -1)
      }
    }

    return text
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\`/g, '`')
      .replace(/\\\\/g, '\\')
  }

  function parseHeaderObjectRaw(rawHeaders) {
    const parsedJson = tryParseJsonLike(rawHeaders)
    if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
      return Object.entries(parsedJson).reduce((acc, [key, value]) => {
        acc[String(key)] = String(value)
        return acc
      }, {})
    }

    const props = parseObjectPropertiesRaw(rawHeaders)
    return Object.entries(props).reduce((acc, [key, value]) => {
      acc[String(key)] = String(parseStringOrRaw(value) || '')
      return acc
    }, {})
  }

  function parseFetchBodyRaw(rawBody) {
    const text = String(rawBody || '').trim()
    if (!text) return ''

    if (/^JSON\.stringify\s*\(/i.test(text)) {
      const firstParen = text.indexOf('(')
      const endParen = findMatchingBracket(text, firstParen, '(', ')')
      if (firstParen >= 0 && endParen > firstParen) {
        const inner = text.slice(firstParen + 1, endParen)
        const parsedInner = tryParseJsonLike(inner)
        if (parsedInner !== null) {
          return JSON.stringify(parsedInner, null, 2)
        }
        return inner.trim()
      }
    }

    const parsedText = parseStringOrRaw(text)
    if (typeof parsedText === 'string') {
      return parsedText
    }

    const parsedJson = tryParseJsonLike(text)
    if (parsedJson !== null) {
      return JSON.stringify(parsedJson, null, 2)
    }

    return text
  }

  function tryParseJsonLike(text) {
    const raw = String(text || '').trim()
    if (!raw) return null

    try {
      return JSON.parse(raw)
    } catch {
      const relaxed = raw
        .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)\s*:/g, '$1"$2":')
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
      try {
        return JSON.parse(relaxed)
      } catch {
        return null
      }
    }
  }

  function buildDefaultApiName(api) {
    const method = String(api?.method || 'GET').toUpperCase()
    const url = String(api?.url || '').trim()
    if (!url) return `${method} 接口`

    try {
      const parsed = new URL(url)
      const pathPart = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : parsed.hostname
      return `${method} ${pathPart}`
    } catch {
      return `${method} ${url}`
    }
  }

  function generateCodeFromApi(api, format) {
    if (format === 'fetch') return generateFetchCode(api)
    if (format === 'wget') return generateWgetCode(api)
    return generateCurlCode(api)
  }

  function buildRequestUrl(api) {
    const baseUrl = String(api.url || '').trim()
    const params = api.params && typeof api.params === 'object' ? api.params : {}
    const entries = Object.entries(params).filter(([key]) => Boolean(String(key).trim()))
    if (!entries.length) return baseUrl

    const query = entries
      .map(([key, value]) => `${encodeURIComponent(String(key))}=${encodeURIComponent(String(value ?? ''))}`)
      .join('&')

    const joiner = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${joiner}${query}`
  }

  function mergeEffectiveHeaders(api) {
    const headers = { ...(api.headers || {}) }

    if (api.auth && api.auth.type === 'bearer' && api.auth.bearer) {
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) {
        headers.Authorization = `Bearer ${api.auth.bearer}`
      }
    }

    if (api.auth && api.auth.type === 'basic' && (api.auth.username || api.auth.password)) {
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) {
        const raw = `${api.auth.username || ''}:${api.auth.password || ''}`
        const encoded = btoa(unescape(encodeURIComponent(raw)))
        headers.Authorization = `Basic ${encoded}`
      }
    }

    if (api.auth && api.auth.type === 'custom' && api.auth.custom) {
      const custom = String(api.auth.custom)
      const idx = custom.indexOf(':')
      if (idx > 0) {
        const key = custom.slice(0, idx).trim()
        const value = custom.slice(idx + 1).trim()
        if (key && value && !headers[key]) {
          headers[key] = value
        }
      }
    }

    const cookies = api.cookies && typeof api.cookies === 'object' ? api.cookies : {}
    const cookieEntries = Object.entries(cookies).filter(([key]) => Boolean(String(key).trim()))
    if (cookieEntries.length > 0 && !Object.keys(headers).some((key) => key.toLowerCase() === 'cookie')) {
      headers.Cookie = cookieEntries.map(([key, value]) => `${key}=${value}`).join('; ')
    }

    return headers
  }

  function normalizeBodyForExport(api) {
    const body = api.body == null ? '' : String(api.body)
    return body.trim()
  }

  function shouldExportBody(api, bodyText) {
    const method = String(api.method || 'GET').toUpperCase()
    if (!bodyText) return false
    return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && method !== 'WEBSOCKET'
  }

  function shellQuote(value) {
    return `'${String(value || '').replace(/'/g, `'\\''`)}'`
  }

  function formatShellCommand(program, args) {
    if (!args.length) return program
    const lines = []
    lines.push(`${program} ${args[0]}${args.length > 1 ? ' \\' : ''}`)
    for (let i = 1; i < args.length; i += 1) {
      const suffix = i === args.length - 1 ? '' : ' \\'
      lines.push(`  ${args[i]}${suffix}`)
    }
    return lines.join('\n')
  }

  function generateCurlCode(api) {
    const method = String(api.method || 'GET').toUpperCase()
    const url = buildRequestUrl(api)
    const headers = mergeEffectiveHeaders(api)
    const bodyText = normalizeBodyForExport(api)

    const args = [`--request ${method}`, `--url ${shellQuote(url)}`]

    Object.entries(headers).forEach(([key, value]) => {
      args.push(`--header ${shellQuote(`${key}: ${value}`)}`)
    })

    if (shouldExportBody(api, bodyText)) {
      args.push(`--data ${shellQuote(bodyText)}`)
    }

    return formatShellCommand('curl', args)
  }

  function generateWgetCode(api) {
    const method = String(api.method || 'GET').toUpperCase()
    const url = buildRequestUrl(api)
    const headers = mergeEffectiveHeaders(api)
    const bodyText = normalizeBodyForExport(api)

    const args = [`--method=${method}`]
    Object.entries(headers).forEach(([key, value]) => {
      args.push(`--header=${shellQuote(`${key}: ${value}`)}`)
    })

    if (shouldExportBody(api, bodyText)) {
      args.push(`--body-data=${shellQuote(bodyText)}`)
    }

    args.push('-O -')
    args.push(shellQuote(url))
    return formatShellCommand('wget', args)
  }

  function generateFetchCode(api) {
    const method = String(api.method || 'GET').toUpperCase()
    const url = buildRequestUrl(api)
    const headers = mergeEffectiveHeaders(api)
    const bodyText = normalizeBodyForExport(api)
    const optionsLines = [`method: ${JSON.stringify(method)}`]

    const headerEntries = Object.entries(headers)
    if (headerEntries.length > 0) {
      const headerLines = headerEntries.map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(String(value))}`)
      optionsLines.push(`headers: {\n${headerLines.join(',\n')}\n  }`)
    }

    if (shouldExportBody(api, bodyText)) {
      if (api.bodyType === 'json') {
        const parsed = tryParseJsonLike(bodyText)
        if (parsed !== null) {
          optionsLines.push(`body: JSON.stringify(${JSON.stringify(parsed, null, 2)})`)
        } else {
          optionsLines.push(`body: ${JSON.stringify(bodyText)}`)
        }
      } else {
        optionsLines.push(`body: ${JSON.stringify(bodyText)}`)
      }
    }

    return `fetch(${JSON.stringify(url)}, {\n  ${optionsLines.join(',\n  ')}\n});`
  }

  function generateRequestId() {
    if (crypto.randomUUID) return crypto.randomUUID()
    return 'req-' + Math.random().toString(16).slice(2)
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID()
    return 'id-' + Math.random().toString(16).slice(2)
  }

  // Initialize placeholder based on default body type
  updateBodyPlaceholder()

  vscode.postMessage({ type: 'init' })
})()

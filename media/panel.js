(() => {
  const vscode = acquireVsCodeApi();
  let state = { groups: [], apis: [] };
  let currentApiId = null;
  let lastResponse = null;
  let hasInitialState = false;

  const HEADERS_CATALOG = [
    "Accept",
    "Accept-Charset",
    "Accept-Encoding",
    "Accept-Language",
    "Accept-Ranges",
    "Access-Control-Allow-Credentials",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Methods",
    "Access-Control-Allow-Origin",
    "Access-Control-Expose-Headers",
    "Access-Control-Max-Age",
    "Access-Control-Request-Headers",
    "Access-Control-Request-Method",
    "Age",
    "Allow",
    "API-Key",
    "Authorization",
    "Cache-Control",
    "Connection",
    "Content-Disposition",
    "Content-Encoding",
    "Content-Language",
    "Content-Length",
    "Content-Location",
    "Content-Range",
    "Content-Security-Policy",
    "Content-Type",
    "Cookie",
    "Date",
    "DNT",
    "ETag",
    "Expect",
    "Expires",
    "Forwarded",
    "From",
    "Host",
    "If-Match",
    "If-Modified-Since",
    "If-None-Match",
    "If-Range",
    "If-Unmodified-Since",
    "Keep-Alive",
    "Last-Modified",
    "Link",
    "Location",
    "Max-Forwards",
    "Origin",
    "Pragma",
    "Proxy-Authenticate",
    "Proxy-Authorization",
    "Range",
    "Referer",
    "Retry-After",
    "Save-Data",
    "Sec-Fetch-Dest",
    "Sec-Fetch-Mode",
    "Sec-Fetch-Site",
    "Server",
    "Set-Cookie",
    "Strict-Transport-Security",
    "TE",
    "Timing-Allow-Origin",
    "Trailer",
    "Transfer-Encoding",
    "Upgrade",
    "Upgrade-Insecure-Requests",
    "User-Agent",
    "Vary",
    "Via",
    "Warning",
    "WWW-Authenticate",
    "X-API-Key",
    "X-Content-Type-Options",
    "X-Correlation-ID",
    "X-CSRF-Token",
    "X-Forwarded-For",
    "X-Forwarded-Host",
    "X-Forwarded-Proto",
    "X-Frame-Options",
    "X-HTTP-Method-Override",
    "X-Powered-By",
    "X-Real-IP",
    "X-Request-ID",
    "X-Requested-With",
    "X-UA-Compatible",
    "X-XSS-Protection"
  ];

  const app = document.getElementById("app");
  app.innerHTML = `
    <main class="two-column">
      <div class="left-column">
        <div class="block" id="configBlock">
          <div class="block-header">
            <span>接口配置</span>
            <div>
              <button id="sendBtn" class="primary">发送/保存</button>
            </div>
          </div>
          <div class="form">
            <label>名称 <input id="apiName" placeholder="例如：获取用户信息" /></label>
            <label>URL <input id="apiUrl" placeholder="https://example.com/api" /></label>
            <div class="row">
              <label>Method
                <select id="apiMethod">
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                  <option>HEAD</option>
                  <option>OPTIONS</option>
                </select>
              </label>
              <label>分组
                <select id="apiGroup">
                  <option value="">未分组</option>
                </select>
              </label>
            </div>
            <div class="inline-form inline-form-margin">
              <input id="newGroupName" placeholder="新分组名称" />
              <button id="addGroupBtn" type="button">添加分组</button>
            </div>
            <div class="headers">
              <div class="label-row">
                <span>Headers</span>
                <button id="addHeaderBtn" type="button">添加 Header</button>
              </div>
              <div id="headerRows"></div>
            </div>
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
              <textarea id="bodyInput" rows="6" placeholder='{"name":"Codex"}'></textarea>
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
            <pre id="responseBody" class="code"></pre>
          </div>
        </div>
      </div>
    </main>
  `;

  const elems = {
    newGroupName: document.getElementById("newGroupName"),
    addGroupBtn: document.getElementById("addGroupBtn"),
    apiName: document.getElementById("apiName"),
    apiUrl: document.getElementById("apiUrl"),
    apiMethod: document.getElementById("apiMethod"),
    apiGroup: document.getElementById("apiGroup"),
    addHeaderBtn: document.getElementById("addHeaderBtn"),
    headerRows: document.getElementById("headerRows"),
    bodyType: document.getElementById("bodyType"),
    bodyInput: document.getElementById("bodyInput"),
    bodyFields: document.getElementById("bodyFields"),
    formatJsonBtn: document.getElementById("formatJsonBtn"),
    addBodyFieldBtn: document.getElementById("addBodyFieldBtn"),
    toggleBodyModeBtn: document.getElementById("toggleBodyModeBtn"),
    sendBtn: document.getElementById("sendBtn"),
    responseMeta: document.getElementById("responseMeta"),
    responseBody: document.getElementById("responseBody"),
    copyResponseBtn: document.getElementById("copyResponseBtn"),
    fileUploadSection: document.getElementById("fileUploadSection"),
    fileList: document.getElementById("fileList"),
    addFileBtn: document.getElementById("addFileBtn"),
    fileInput: document.getElementById("fileInput"),
  };

  let bodyEditMode = "text"; // "text" or "visual"
  let selectedFiles = []; // 存储选择的文件信息（包含内容）
  let pendingGroupId = null; // 待选中的新分组ID

  window.addEventListener("message", (event) => {
    const { type, payload, selectedApiId, selectedGroupId } = event.data;
    switch (type) {
      case "state":
        state = payload || { groups: [], apis: [] };
        renderGroups();
        const hasExplicitSelection = selectedApiId !== undefined;
        if (hasExplicitSelection) {
          const handled = applySelection(selectedApiId, selectedGroupId);
          if (!handled) syncCurrentApi();
          hasInitialState = true;
          break;
        }

        if (!hasInitialState) {
          hasInitialState = true;
          syncCurrentApi();
        } else if (currentApiId) {
          const existing = state.apis.find((a) => a.id === currentApiId);
          if (!existing) {
            currentApiId = null;
            fillApiForm(defaultApi());
          }
        }
        break;
      case "response":
        handleResponse(payload);
        break;
      default:
        break;
    }
  });

  elems.addGroupBtn.addEventListener("click", () => {
    const name = elems.newGroupName.value.trim();
    if (!name) return;
    const group = { id: uid(), name };
    pendingGroupId = group.id; // 记录新分组ID，待状态更新后选中
    vscode.postMessage({ type: "saveGroup", payload: group });
    elems.newGroupName.value = "";
  });

  elems.addHeaderBtn.addEventListener("click", () => addHeaderRow());

  elems.bodyType.addEventListener("change", () => {
    updateBodyEditor();
  });

  elems.formatJsonBtn.addEventListener("click", () => {
    formatJson();
  });

  elems.addBodyFieldBtn.addEventListener("click", () => addBodyField());

  elems.toggleBodyModeBtn.addEventListener("click", () => {
    toggleBodyMode();
  });

  elems.addFileBtn.addEventListener("click", () => {
    elems.fileInput.click();
  });

  elems.fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      // 读取文件内容为 base64
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Content = event.target.result.split(',')[1]; // 移除 data:xxx;base64, 前缀
        const fileInfo = {
          name: file.name,
          size: file.size,
          type: file.type,
          content: base64Content
        };
        selectedFiles.push(fileInfo);
        addFileToList(fileInfo);
      };
      reader.readAsDataURL(file);
    }
    elems.fileInput.value = ""; // 清空输入，允许重复选择同名文件
  });

  elems.sendBtn.addEventListener("click", () => {
    const api = collectApiForm();
    if (!api.url) {
      elems.responseMeta.textContent = "请先填写接口 URL";
      elems.responseBody.textContent = "";
      return;
    }
    if (!api.name) {
      api.name = api.url;
    }
    
    // 禁用按钮，显示加载状态
    elems.sendBtn.disabled = true;
    elems.sendBtn.textContent = "发送中...";
    
    vscode.postMessage({ type: "saveApi", payload: api });
    currentApiId = api.id;
    
    // 如果有文件，发送文件上传请求
    if (selectedFiles.length > 0) {
      vscode.postMessage({ type: "sendRequestWithFiles", payload: { api, filePaths: selectedFiles } });
    } else {
      vscode.postMessage({ type: "sendRequest", payload: api });
    }
    
    elems.responseMeta.textContent = "请求中...";
    elems.responseBody.textContent = "";
  });

  elems.copyResponseBtn.addEventListener("click", async () => {
    if (!lastResponse) return;
    await navigator.clipboard.writeText(lastResponse.rawText || "");
    elems.responseMeta.textContent = "已复制响应内容";
  });

  function defaultApi(selectedGroupId = null) {
    return {
      id: uid(),
      name: "",
      url: "",
      method: "GET",
      groupId: selectedGroupId,
      headers: { "User-Agent": "VSCode-APIs-Tester" },
      bodyType: "json",
      body: "{}",
    };
  }

  function renderGroups() {
    // 保留当前选中的分组ID
    const currentSelectedGroupId = elems.apiGroup.value;
    
    elems.apiGroup.innerHTML = `<option value="">未分组</option>`;
    state.groups.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.name || "未命名分组";
      elems.apiGroup.appendChild(opt);
    });
    
    // 如果有待选中的新分组，优先选中它
    if (pendingGroupId && state.groups.some((g) => g.id === pendingGroupId)) {
      elems.apiGroup.value = pendingGroupId;
      pendingGroupId = null; // 清除标记
    }
    // 否则恢复之前选中的分组
    else if (currentSelectedGroupId && state.groups.some((g) => g.id === currentSelectedGroupId)) {
      elems.apiGroup.value = currentSelectedGroupId;
    }
  }

  function fillApiForm(api) {
    if (!api) return;
    if (!api.id) {
      api.id = uid();
    }
    elems.apiName.value = api.name || "";
    elems.apiUrl.value = api.url || "";
    elems.apiMethod.value = api.method || "GET";
    // 确保设置的分组ID在当前可用的分组中存在
    const validGroupId = api.groupId && state.groups.some((g) => g.id === api.groupId) ? api.groupId : "";
    elems.apiGroup.value = validGroupId;
    elems.bodyType.value = api.bodyType || "json";
    elems.bodyInput.value = api.body ? stringifyBody(api.body) : "";

    elems.headerRows.innerHTML = "";
    const entries = Object.entries(api.headers || {});
    if (entries.length === 0) {
      addHeaderRow();
    } else {
      entries.forEach(([key, value]) => addHeaderRow(key, value));
    }

    // 更新 body 编辑器
    updateBodyEditor();
  }

  function stringifyBody(body) {
    if (typeof body === "string") return body;
    try {
      return JSON.stringify(body, null, 2);
    } catch (err) {
      return String(body);
    }
  }

  function collectApiForm() {
    const headers = {};
    elems.headerRows.querySelectorAll(".header-row").forEach((row) => {
      const key = row.querySelector(".h-key").value.trim();
      const value = row.querySelector(".h-val").value.trim();
      if (key) headers[key] = value;
    });

    // 从表单获取分组ID，确保保留有效的分组引用
    const groupValue = elems.apiGroup.value;
    const groupId = groupValue && typeof groupValue === "string" && groupValue.trim() !== "" ? groupValue.trim() : null;

    // 收集 body 数据
    let body = "";
    if (bodyEditMode === "visual" && (elems.bodyType.value === "form-data" || elems.bodyType.value === "urlencoded")) {
      const bodyObj = {};
      elems.bodyFields.querySelectorAll(".body-field-row").forEach((row) => {
        const key = row.querySelector(".bf-key").value.trim();
        const value = row.querySelector(".bf-val").value.trim();
        if (key) bodyObj[key] = value;
      });
      body = JSON.stringify(bodyObj);
    } else {
      body = elems.bodyInput.value;
    }

    return {
      id: currentApiId || uid(),
      name: elems.apiName.value.trim(),
      url: elems.apiUrl.value.trim(),
      method: elems.apiMethod.value,
      groupId: groupId,
      headers,
      bodyType: elems.bodyType.value,
      body: body,
    };
  }

  function addHeaderRow(key = "", value = "") {
    const row = document.createElement("div");
    row.className = "header-row";
    row.innerHTML = `
      <div class="h-key-wrap">
        <input class="h-key" placeholder="Key" value="${key}" autocomplete="off" />
        <div class="header-suggest"></div>
      </div>
      <input class="h-val" placeholder="Value" value="${value}" />
      <button class="mini ghost">x</button>
    `;
    const removeBtn = row.querySelector("button");
    const keyInput = row.querySelector(".h-key");
    const suggestBox = row.querySelector(".header-suggest");
    removeBtn.onclick = () => row.remove();
    attachHeaderSuggest(keyInput, suggestBox);
    elems.headerRows.appendChild(row);
  }

  function attachHeaderSuggest(input, listEl) {
    let activeIndex = -1;

    const hide = () => {
      listEl.classList.remove("open");
      listEl.innerHTML = "";
      activeIndex = -1;
    };

    const applyValue = (val) => {
      input.value = val;
      hide();
      input.focus();
    };

    const highlightActive = () => {
      Array.from(listEl.children).forEach((child, idx) => {
        child.classList.toggle("active", idx === activeIndex);
      });
    };

    const render = () => {
      const keyword = (input.value || "").trim().toLowerCase();
      const hits = HEADERS_CATALOG.filter((h) => h.toLowerCase().includes(keyword)).slice(0, 10);
      if (hits.length === 0) {
        hide();
        return;
      }
      listEl.innerHTML = "";
      hits.forEach((h, idx) => {
        const item = document.createElement("div");
        item.className = "suggest-item";
        item.textContent = h;
        item.dataset.index = String(idx);
        item.onclick = (e) => {
          e.preventDefault();
          applyValue(h);
        };
        listEl.appendChild(item);
      });
      activeIndex = 0;
      highlightActive();
      listEl.classList.add("open");
    };

    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("keydown", (e) => {
      if (!listEl.classList.contains("open")) return;
      const total = listEl.children.length;
      if (e.key === "ArrowDown") {
        activeIndex = activeIndex < total - 1 ? activeIndex + 1 : 0;
        highlightActive();
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        activeIndex = activeIndex > 0 ? activeIndex - 1 : total - 1;
        highlightActive();
        e.preventDefault();
      } else if (e.key === "Enter") {
        const node = listEl.children[activeIndex];
        if (node) {
          applyValue(node.textContent || "");
          e.preventDefault();
        }
      } else if (e.key === "Escape") {
        hide();
      }
    });
    input.addEventListener("blur", () => setTimeout(hide, 120));
  }

  function handleResponse(res) {
    if (!res) return;
    
    // 响应完成，启用按钮
    elems.sendBtn.disabled = false;
    elems.sendBtn.textContent = "发送/保存";
    
    if (!res.success) {
      elems.responseMeta.textContent = `请求失败：${res.error}`;
      elems.responseBody.textContent = "";
      lastResponse = null;
      return;
    }
    const headers = JSON.stringify(res.headers, null, 2);
    const bodyText = typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2);
    elems.responseMeta.textContent = `状态：${res.status} ${res.statusText}`;
    elems.responseBody.textContent = `Headers:\n${headers}\n\nBody:\n${bodyText}`;
    lastResponse = { rawText: elems.responseBody.textContent };
  }

  function applySelection(apiId, groupId = null) {
    if (apiId === null) {
      currentApiId = null;
      fillApiForm(defaultApi(groupId ?? null));
      scrollToConfig();
      return true;
    }
    if (typeof apiId === "string") {
      const match = state.apis.find((a) => a.id === apiId);
      if (match) {
        currentApiId = match.id;
        fillApiForm(match);
        scrollToConfig();
        return true;
      }
    }
    return false;
  }

  function syncCurrentApi() {
    if (currentApiId) {
      const api = state.apis.find((a) => a.id === currentApiId);
      if (api) {
        fillApiForm(api);
        return;
      }
    }
    const first = state.apis[0];
    if (first) {
      currentApiId = first.id;
      fillApiForm(first);
    } else {
      currentApiId = null;
      fillApiForm(defaultApi());
    }
  }

  function scrollToConfig() {
    const target = document.getElementById("configBlock");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function updateBodyEditor() {
    const bodyType = elems.bodyType.value;
    const supportsVisual = bodyType === "form-data" || bodyType === "urlencoded";
    
    // form-data 类型时显示文件上传区域
    if (bodyType === "form-data") {
      elems.fileUploadSection.classList.remove("hidden");
    } else {
      elems.fileUploadSection.classList.add("hidden");
      selectedFiles = [];
      elems.fileList.innerHTML = "";
    }
    
    // JSON 类型显示格式化按钮
    if (bodyType === "json") {
      elems.formatJsonBtn.classList.remove("hidden");
      elems.toggleBodyModeBtn.classList.add("hidden");
      elems.addBodyFieldBtn.classList.add("hidden");
      elems.bodyFields.classList.add("hidden");
      elems.bodyInput.classList.remove("hidden");
      bodyEditMode = "text";
    }
    // 表单数据支持可视化
    else if (supportsVisual) {
      elems.formatJsonBtn.classList.add("hidden");
      elems.toggleBodyModeBtn.classList.remove("hidden");
      if (bodyEditMode === "visual") {
        elems.addBodyFieldBtn.classList.remove("hidden");
        elems.bodyFields.classList.remove("hidden");
        elems.bodyInput.classList.add("hidden");
      } else {
        elems.addBodyFieldBtn.classList.add("hidden");
        elems.bodyFields.classList.add("hidden");
        elems.bodyInput.classList.remove("hidden");
      }
      
      if (bodyEditMode === "visual") {
        elems.toggleBodyModeBtn.textContent = "切换为文本模式";
        syncBodyFieldsFromText();
      } else {
        elems.toggleBodyModeBtn.textContent = "切换为可视化模式";
      }
    }
    // 其他类型只显示文本框
    else {
      bodyEditMode = "text";
      elems.formatJsonBtn.classList.add("hidden");
      elems.toggleBodyModeBtn.classList.add("hidden");
      elems.addBodyFieldBtn.classList.add("hidden");
      elems.bodyFields.classList.add("hidden");
      elems.bodyInput.classList.remove("hidden");
    }
  }

  function formatJson() {
    const text = elems.bodyInput.value.trim();
    if (!text) return;
    
    try {
      const obj = JSON.parse(text);
      elems.bodyInput.value = JSON.stringify(obj, null, 2);
    } catch (e) {
      elems.responseMeta.textContent = "JSON 格式错误：" + e.message;
      setTimeout(() => {
        elems.responseMeta.textContent = "";
      }, 3000);
    }
  }

  function toggleBodyMode() {
    if (bodyEditMode === "text") {
      bodyEditMode = "visual";
      updateBodyEditor();
    } else {
      bodyEditMode = "text";
      syncBodyTextFromFields();
      updateBodyEditor();
    }
  }

  function syncBodyFieldsFromText() {
    elems.bodyFields.innerHTML = "";
    const text = elems.bodyInput.value.trim();
    if (!text) {
      addBodyField();
      return;
    }
    
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const entries = Object.entries(obj);
        if (entries.length === 0) {
          addBodyField();
        } else {
          entries.forEach(([key, value]) => {
            addBodyField(key, typeof value === "string" ? value : JSON.stringify(value));
          });
        }
        return;
      }
    } catch (e) {
      // 如果不是有效的 JSON，尝试解析为键值对格式
    }
    
    addBodyField();
  }

  function syncBodyTextFromFields() {
    const bodyObj = {};
    elems.bodyFields.querySelectorAll(".body-field-row").forEach((row) => {
      const key = row.querySelector(".bf-key").value.trim();
      const value = row.querySelector(".bf-val").value.trim();
      if (key) bodyObj[key] = value;
    });
    
    if (Object.keys(bodyObj).length > 0) {
      elems.bodyInput.value = JSON.stringify(bodyObj, null, 2);
    }
  }

  function addBodyField(key = "", value = "") {
    const row = document.createElement("div");
    row.className = "body-field-row";
    row.innerHTML = `
      <input class="bf-key" placeholder="Key" value="${key}" />
      <input class="bf-val" placeholder="Value" value="${value}" />
      <button class="mini ghost">x</button>
    `;
    const removeBtn = row.querySelector("button");
    removeBtn.onclick = () => row.remove();
    elems.bodyFields.appendChild(row);
  }

  function addFileToList(file) {
    const row = document.createElement("div");
    row.className = "file-item";
    const sizeText = formatFileSize(file.size);
    row.innerHTML = `
      <div class="file-info">
        <span class="file-name">${file.name}</span>
        <span class="file-size">${sizeText}</span>
      </div>
      <button class="mini ghost">移除</button>
    `;
    const removeBtn = row.querySelector("button");
    removeBtn.onclick = () => {
      const index = selectedFiles.indexOf(file);
      if (index > -1) {
        selectedFiles.splice(index, 1);
      }
      row.remove();
    };
    elems.fileList.appendChild(row);
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(16).slice(2);
  }

  vscode.postMessage({ type: "init" });
})();

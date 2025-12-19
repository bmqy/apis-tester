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
    "ETag",
    "Expires",
    "Forwarded",
    "Host",
    "If-Match",
    "If-Modified-Since",
    "If-None-Match",
    "If-Range",
    "If-Unmodified-Since",
    "Keep-Alive",
    "Last-Modified",
    "Location",
    "Origin",
    "Pragma",
    "Proxy-Authorization",
    "Range",
    "Referer",
    "Retry-After",
    "Sec-Fetch-Mode",
    "Sec-Fetch-Site",
    "Sec-Fetch-Dest",
    "Server",
    "Strict-Transport-Security",
    "TE",
    "Trailer",
    "Transfer-Encoding",
    "Upgrade-Insecure-Requests",
    "User-Agent",
    "Vary",
    "Via",
    "WWW-Authenticate",
    "X-CSRF-Token",
    "X-Forwarded-For",
    "X-Forwarded-Host",
    "X-Forwarded-Proto",
    "X-Real-IP",
    "X-Request-ID",
    "X-XSS-Protection"
  ];

  const app = document.getElementById("app");
  app.innerHTML = `
    <main class="single-column">
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
          <div class="inline-form" style="margin-top: 8px;">
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
            <label class="full">Body 内容
              <textarea id="bodyInput" rows="6" placeholder='{"name":"Codex"}'></textarea>
            </label>
          </div>
        </div>
      </div>
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
    sendBtn: document.getElementById("sendBtn"),
    responseMeta: document.getElementById("responseMeta"),
    responseBody: document.getElementById("responseBody"),
    copyResponseBtn: document.getElementById("copyResponseBtn"),
  };

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
    vscode.postMessage({ type: "saveGroup", payload: group });
    elems.newGroupName.value = "";
  });

  elems.addHeaderBtn.addEventListener("click", () => addHeaderRow());

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
    vscode.postMessage({ type: "saveApi", payload: api });
    currentApiId = api.id;
    vscode.postMessage({ type: "sendRequest", payload: api });
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
      headers: { "User-Agent": "VSCode-API-Tester" },
      bodyType: "json",
      body: "{}",
    };
  }

  function renderGroups() {
    elems.apiGroup.innerHTML = `<option value="">未分组</option>`;
    state.groups.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.name || "未命名分组";
      elems.apiGroup.appendChild(opt);
    });
  }

  function fillApiForm(api) {
    if (!api) return;
    if (!api.id) {
      api.id = uid();
    }
    elems.apiName.value = api.name || "";
    elems.apiUrl.value = api.url || "";
    elems.apiMethod.value = api.method || "GET";
    elems.apiGroup.value = api.groupId || "";
    elems.bodyType.value = api.bodyType || "json";
    elems.bodyInput.value = api.body ? stringifyBody(api.body) : "";

    elems.headerRows.innerHTML = "";
    const entries = Object.entries(api.headers || {});
    if (entries.length === 0) {
      addHeaderRow();
    } else {
      entries.forEach(([key, value]) => addHeaderRow(key, value));
    }
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

    return {
      id: currentApiId || uid(),
      name: elems.apiName.value.trim(),
      url: elems.apiUrl.value.trim(),
      method: elems.apiMethod.value,
      groupId: elems.apiGroup.value || null,
      headers,
      bodyType: elems.bodyType.value,
      body: elems.bodyInput.value,
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

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(16).slice(2);
  }

  vscode.postMessage({ type: "init" });
})();

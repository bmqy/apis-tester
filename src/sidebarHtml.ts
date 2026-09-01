import * as vscode from 'vscode'
import { getNonce } from './webviewHtml'

export function getSidebarViewHtml(webview: vscode.Webview) {
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
      .search { box-sizing: border-box; height: 32px; flex: 1; display: flex; align-items: center; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; }
      .search input { border: none; outline: none; width: 100%; font-size: 12px; background: transparent; color: #1f2937; }
      .search input::placeholder { color: #9ca3af; }
      .icon-btn { box-sizing: border-box; width: 32px; height: 32px; border-radius: 6px; border: 1px solid #e5e7eb; background: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #4b5563; font-size: 16px; line-height: 1; }
      .icon-btn:hover { border-color: #d1d5db; color: #111827; }
      .menu { position: absolute; right: 12px; top: 54px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 8px 18px rgba(0,0,0,0.08); min-width: 180px; padding: 6px 0; z-index: 10; display: none; }
      .menu.open { display: block; }
      .menu-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; font-size: 12px; color: #1f2937; cursor: pointer; }
      .menu-item:hover { background: #f3f4f6; }
      .menu-item.active { background: #eef2ff; color: #4338ca; }
      .menu-item.disabled { color: #9ca3af; cursor: default; }
      .menu-item.disabled:hover { background: transparent; }
      .menu-separator { height: 1px; margin: 6px 0; background: #e5e7eb; }
      .list { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
      .group { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; }
      .group-header { padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: #1f2937; border-bottom: 1px solid #e5e7eb; cursor: pointer; }
      .folder-icon { width: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
      .group-items { display: flex; flex-direction: column; }
      .item { position: relative; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #1f2933; cursor: pointer; padding: 6px 10px; }
      .item:hover { background: rgba(37,99,235,0.08); }
      .status-dot { width: 6px; height: 6px; border-radius: 999px; flex: 0 0 6px; box-shadow: 0 0 0 1px rgba(255,255,255,0.9); }
      .status-dot.success { background: #16a34a; }
      .status-dot.failed { background: #dc2626; }
      .status-dot.pending { background: #cbd5e1; }
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
      <button id="groupMenuBtn" class="icon-btn" title="分组筛选" aria-label="分组筛选">···</button>
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

    document.addEventListener("click", () => groupMenu.classList.remove("open"));
    groupMenu.addEventListener("click", (e) => e.stopPropagation());
    keywordInput.oninput = () => renderList();

    function getVisibleGroupKeys() {
      const state = latestState || {};
      const keyword = (keywordInput.value || "").trim().toLowerCase();
      const groups = Array.isArray(state.groups) ? state.groups : [];
      const apis = Array.isArray(state.apis) ? state.apis : [];
      if (currentFilter && !groups.some((g) => g.id === currentFilter)) currentFilter = "";
      const buckets = currentFilter
        ? groups.filter((g) => g.id === currentFilter)
        : [...groups, { id: null, name: "未分组" }];

      return buckets
        .filter((g) => apis.some((api) => {
          const inGroup = g.id === null ? !api.groupId : api.groupId === g.id;
          if (!inGroup) return false;
          if (!keyword) return true;
          const nameHit = api.name && api.name.toLowerCase().includes(keyword);
          const urlHit = api.url && api.url.toLowerCase().includes(keyword);
          return nameHit || urlHit;
        }))
        .map((g) => g.id ?? "__ungrouped");
    }

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
        const requestStatus = getRequestStatus(api);
        const statusDot = document.createElement("span");
        statusDot.className = "status-dot " + requestStatus;
        statusDot.title = requestStatus === "success" ? "上次请求成功" : requestStatus === "failed" ? "上次请求失败" : "未执行";
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
        leftWrap.appendChild(statusDot);
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

    function getRequestStatus(api) {
      const lastResponse = api && api.lastResponse;
      const status = lastResponse && lastResponse.status;
      if (status === "success" || status === "failed") return status;
      const meta = lastResponse && typeof lastResponse.meta === "string" ? lastResponse.meta : "";
      if (meta.startsWith("请求失败")) return "failed";
      if (meta.startsWith("状态") || meta.includes("WebSocket")) return "success";
      return "pending";
    }

    function renderFilter() {
      const state = latestState || {};
      const groups = Array.isArray(state.groups) ? state.groups : [];
      groupMenu.innerHTML = "";
      const visibleKeys = getVisibleGroupKeys();
      const canExpandAll = visibleKeys.some((key) => collapsed.has(key));
      const canCollapseAll = visibleKeys.some((key) => !collapsed.has(key));
      const makeActionItem = (label, enabled, handler) => {
        const item = document.createElement("div");
        item.className = "menu-item" + (enabled ? "" : " disabled");
        item.textContent = label;
        item.onclick = () => {
          if (!enabled) return;
          handler();
          renderList();
          renderFilter();
          groupMenu.classList.remove("open");
        };
        return item;
      };
      const separator = document.createElement("div");
      separator.className = "menu-separator";
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
      groupMenu.appendChild(makeActionItem("全部展开", canExpandAll, () => {
        visibleKeys.forEach((key) => collapsed.delete(key));
      }));
      groupMenu.appendChild(makeActionItem("全部收起", canCollapseAll, () => {
        visibleKeys.forEach((key) => collapsed.add(key));
      }));
      groupMenu.appendChild(separator);
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

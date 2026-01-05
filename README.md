# APIs Tester

一个轻量级的 VS Code 扩展，用于在编辑器内快速测试和管理 API 接口。支持分组管理、导入导出、WebDAV 云端同步，让 API 测试更加高效。

## 📦 安装

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bmqy.apis-tester)
- [Open VSX Registry](https://open-vsx.org/extension/bmqy/apis-tester)

## ✨ 核心功能

### 📡 API 测试
- 支持所有常见 HTTP 方法：GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS
- 可视化配置请求参数：URL、Headers、Body
- 多种 Body 格式支持：JSON、Form-data、x-www-form-urlencoded、Raw
- 实时查看响应结果，支持复制粘贴

### 📁 分组管理
- 按项目或模块分组管理接口
- 支持在分组内快速创建新接口
- 删除接口时自动清理空分组
- 分组列表过滤功能

### 💾 导入导出
- **Postman 兼容**：支持导入/导出 Postman Collection v2.1 格式
- **原生格式**：支持 APIs Tester 原生 JSON 格式
- **智能合并**：
  - 合并导入：保留现有数据，添加新数据（按分组名称匹配）
  - 覆盖导入：替换指定分组数据，其他分组保持不变
- **路径记忆**：自动记录上次使用的导入/导出目录
- **分组导入**：Postman Collection 自动按文件夹和集合名称创建分组

### ☁️ WebDAV 云端同步
- 手动备份/恢复：通过"更多"菜单随时同步
- 自动备份：接口变更后自动同步到 WebDAV（可配置）
- 实时提示：同步成功或失败都有明确提示
- 配置简单：只需填写 WebDAV 服务器地址和账号信息

## 🚀 快速开始

### 安装
1. 克隆仓库：`git clone <repo-url>`
2. 安装依赖：`npm install`
3. 编译代码：`npm run compile`
4. 按 `F5` 启动调试

### 使用
1. 点击活动栏的 APIs Tester 图标打开侧边栏
2. 点击 "+" 按钮创建新接口
3. 填写接口信息并发送请求
4. 使用"更多"菜单进行导入导出和同步操作

### WebDAV 配置
1. 打开 VS Code 设置（`Ctrl+,`）
2. 搜索 `APIs Tester`
3. 填写 WebDAV 配置：
   - `apiTester.webdav.url`：WebDAV 服务地址
   - `apiTester.webdav.username`：用户名
   - `apiTester.webdav.password`：密码
   - `apiTester.webdav.path`：备份目录路径（默认：/apis-tester-backup）
   - `apiTester.webdav.autoBackup`：是否开启自动备份

#### 备份目录更新说明
**版本 0.0.9+** 更新了默认备份目录：
- **旧版本**：`/api-tester-backup`
- **新版本**：`/apis-tester-backup`（复数形式）

**向下兼容性**：
- 新版本会将备份数据保存到 `/apis-tester-backup` 目录
- 恢复数据时会自动兼容旧版本，优先从新目录读取，若新目录无数据则自动降级读取旧目录 `/api-tester-backup` 中的数据
- 已有备份的用户无需手动迁移，恢复时自动识别

## 📋 功能菜单

### 主界面
- **新建按钮（+）**：快速创建新接口
- **更多菜单（⋯）**：
  - 导出数据
  - 导入数据
  - WebDAV 备份
  - WebDAV 恢复
  - 打开设置

## 开发提示
- 主入口：`src/extension.ts`，负责处理 Webview 消息、请求发送、WebDAV 备份。
- 前端 UI：`media/panel.js`、`media/panel.css`。
- 构建输出目录：`out/`（由 `npm run compile` 生成）。

## 发布
- 打包：安装 `vsce` 后运行 `npm run package` 生成 `.vsix`。
- 安装：在 VS Code 执行 `code --install-extension <文件名>.vsix`。

## 📝 更新记录

### v0.0.9
- ✨ 更新默认备份目录：`/api-tester-backup` → `/apis-tester-backup`
- 🔄 恢复功能向下兼容：自动识别旧版本备份数据，无需手动迁移
- 🎨 新增彩色 logo 图标

### v0.0.8
- ✨ 更新部分文案

### v0.0.7
- ✨ 布局调整
- ✨ 优化发送按钮逻辑

### v0.0.6
- ✨ 优化添加分组功能
- 🎯 支持更多常见headers
- 🎯 支持文件上传测试

### v0.0.5
- 🧹 更新分组选择逻辑

### v0.0.4
- 🎯 优化从webdav恢复备份后面板不刷新问题

### v0.0.3
- ✨ 更新分类

### v0.0.2
- 📚 更新图标；

### v0.0.1
- 🎉 初始版本发布

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { convertFromPostman, convertToPostman } from './postman'
import { normalizeState, readState, writeState } from './state'
import type { ApiGroup, StateShape } from './types'

const LAST_IMPORT_EXPORT_DIR_KEY = 'apiTester.lastImportExportDir'

export async function exportData(context: vscode.ExtensionContext) {
  try {
    const state = readState(context)

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

    const lastDir = context.globalState.get<string>(LAST_IMPORT_EXPORT_DIR_KEY)
    const desktopPath = path.join(os.homedir(), 'Desktop')
    const defaultDir = lastDir || desktopPath
    const defaultPath = path.join(defaultDir, defaultFileName)
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultPath),
      filters: { JSON: ['json'] },
    })

    if (!uri) return

    const selectedDir = path.dirname(uri.fsPath)
    await context.globalState.update(LAST_IMPORT_EXPORT_DIR_KEY, selectedDir)

    const content = JSON.stringify(exportData, null, 2)
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))

    vscode.window.showInformationMessage(`导出成功: ${uri.fsPath}`)
  } catch (error: any) {
    vscode.window.showErrorMessage(`导出失败: ${error?.message || String(error)}`)
  }
}

export async function importData(context: vscode.ExtensionContext, onImported?: (state: StateShape) => void) {
  try {
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
    const selectedDir = path.dirname(uri.fsPath)
    await context.globalState.update(LAST_IMPORT_EXPORT_DIR_KEY, selectedDir)
    const content = await vscode.workspace.fs.readFile(uri)
    const jsonData = JSON.parse(content.toString())

    let importedState: StateShape

    if (jsonData.info && jsonData.info.schema && jsonData.info.schema.includes('postman')) {
      importedState = convertFromPostman(jsonData)
    } else if (jsonData.apis && jsonData.groups) {
      importedState = normalizeState(jsonData)
    } else {
      throw new Error('无法识别的文件格式')
    }

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
        const nameToExistingId = new Map<string, string>()
        currentState.groups.forEach((g) => {
          const n = (g.name || '').trim()
          if (n) nameToExistingId.set(n, g.id)
        })

        const adjustedImportedGroups: ApiGroup[] = []
        const idMap = new Map<string, string>()
        importedState.groups.forEach((ig) => {
          const n = (ig.name || '').trim()
          const existingId = n ? nameToExistingId.get(n) : undefined
          if (existingId) {
            idMap.set(ig.id, existingId)
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
        finalState = {
          groups: [...currentState.groups, ...importedState.groups],
          apis: [...currentState.apis, ...importedState.apis],
        }
      }
    } else {
      if (hasGroupInfo) {
        const toRemoveIds = new Set(currentState.groups.filter((g) => importedGroupNames.has((g.name || '').trim())).map((g) => g.id))
        const remainingGroups = currentState.groups.filter((g) => !toRemoveIds.has(g.id))
        const remainingApis = currentState.apis.filter((a) => !toRemoveIds.has(a.groupId || ''))

        finalState = {
          groups: [...remainingGroups, ...importedState.groups],
          apis: [...remainingApis, ...importedState.apis],
        }
      } else {
        finalState = importedState
      }
    }

    writeState(context, finalState)
    onImported?.(finalState)

    vscode.window.showInformationMessage(`导入成功: ${importedState.groups.length} 个分组, ${importedState.apis.length} 个接口`)
  } catch (error: any) {
    vscode.window.showErrorMessage(`导入失败: ${error?.message || String(error)}`)
  }
}

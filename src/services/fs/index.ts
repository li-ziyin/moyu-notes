/**
 * File System Access API 封装
 * 提供本地文件夹的读写、扫描、导入功能
 */

export interface WorkspaceInfo {
  directoryHandle: FileSystemDirectoryHandle
  directoryName: string
}

/** 扫描到的文件条目 */
export interface FileEntry {
  name: string
  handle: FileSystemFileHandle
}

let workspaceHandle: FileSystemDirectoryHandle | null = null
let workspaceName = ''

/** 当前是否有活跃的工作目录 */
export function isActive(): boolean {
  return workspaceHandle !== null
}

/** 当前工作目录名 */
export function currentName(): string {
  return workspaceName
}

/** 弹出目录选择器，设为当前工作目录 */
export async function pickDirectory(): Promise<WorkspaceInfo> {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  workspaceHandle = handle
  workspaceName = handle.name
  return { directoryHandle: handle, directoryName: handle.name }
}

/**
 * 尝试恢复之前授权过的目录句柄。
 * handle 必须来自此前 pickDirectory 后持久化的结果。
 * 注意：requestPermission 需要用户手势，页面加载时调用会失败/抛异常，
 * 失败统一返回 null，由上层提供"重新连接"的手动入口。
 */
export async function restoreWorkspace(
  savedHandle: FileSystemDirectoryHandle
): Promise<WorkspaceInfo | null> {
  try {
    const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
    const granted = (await savedHandle.queryPermission?.(opts)) === 'granted'
    if (!granted) {
      const requested = await savedHandle.requestPermission?.(opts)
      if (requested !== 'granted') return null
    }
    workspaceHandle = savedHandle
    workspaceName = savedHandle.name
    return { directoryHandle: savedHandle, directoryName: savedHandle.name }
  } catch {
    // 无用户手势等场景：浏览器直接抛异常，视为未授权
    return null
  }
}

/** 扫描工作目录下所有 .md 文件（仅根目录，不含子目录） */
export async function scanDirectory(): Promise<FileEntry[]> {
  if (!workspaceHandle) throw new Error('未选择工作目录')
  const entries: FileEntry[] = []
  for await (const [name, handle] of workspaceHandle.entries()) {
    if (handle.kind === 'file' && name.endsWith('.md')) {
      entries.push({ name, handle: handle as FileSystemFileHandle })
    }
  }
  return entries
}

/** 读取文件内容 */
export async function readFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

/** 写入文件内容 */
export async function writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

/**
 * 在工作目录下创建新 .md 文件。
 * 如果文件已存在会自动追加数字后缀。
 */
export async function createFile(baseName: string, content: string): Promise<FileSystemFileHandle> {
  if (!workspaceHandle) throw new Error('未选择工作目录')

  let fileName = baseName.endsWith('.md') ? baseName : `${baseName}.md`
  let handle: FileSystemFileHandle

  // 检测重名，追加后缀
  let counter = 1
  const pureName = fileName.replace(/\.md$/, '')
  while (true) {
    try {
      handle = await workspaceHandle.getFileHandle(fileName, { create: false })
      // 文件存在，换名
      fileName = `${pureName} (${counter}).md`
      counter++
    } catch {
      // 文件不存在，创建它
      handle = await workspaceHandle.getFileHandle(fileName, { create: true })
      break
    }
  }

  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
  return handle
}

/** 重命名文件（删除旧的，创建新的） */
export async function renameFile(
  oldHandle: FileSystemFileHandle,
  newName: string
): Promise<FileSystemFileHandle> {
  if (!workspaceHandle) throw new Error('未选择工作目录')
  const content = await readFile(oldHandle)
  const newHandle = await createFile(newName, content)
  await workspaceHandle.removeEntry(oldHandle.name)
  return newHandle
}

/** 删除文件 */
export async function deleteFile(handle: FileSystemFileHandle): Promise<void> {
  if (!workspaceHandle) throw new Error('未选择工作目录')
  await workspaceHandle.removeEntry(handle.name)
}

/**
 * 导入外部 .md 文件到工作目录。
 * 弹出文件选择器，选中后将文件内容复制到工作目录。
 */
export async function importFile(): Promise<FileEntry | null> {
  if (!workspaceHandle) throw new Error('请先选择工作目录')

  const [fileHandle] = await window.showOpenFilePicker({
    types: [
      {
        description: 'Markdown 文件',
        accept: { 'text/markdown': ['.md'] },
      },
    ],
    multiple: false,
  })

  const file = await fileHandle.getFile()
  const content = await file.text()

  // 复制到工作目录（如有重名会自动加后缀）
  const newHandle = await createFile(file.name, content)
  return { name: newHandle.name, handle: newHandle }
}

/** 关闭当前工作目录 */
export function closeWorkspace(): void {
  workspaceHandle = null
  workspaceName = ''
}

/**
 * File System Access API 类型补充
 * lib.dom.d.ts 尚未收录的部分：窗口选择器、句柄权限、目录遍历
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: 'read' | 'readwrite'
    id?: string
    startIn?: string
  }): Promise<FileSystemDirectoryHandle>

  showOpenFilePicker(options?: {
    types?: { description?: string; accept: Record<string, string[]> }[]
    multiple?: boolean
  }): Promise<FileSystemFileHandle[]>
}

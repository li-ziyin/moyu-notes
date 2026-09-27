/**
 * WebDAV 同步时间比较（纯函数）
 * 本地 updatedAt 为毫秒精度，远端 Last-Modified 只有秒精度，
 * 直接比较会产生同秒内的假"较新"。双方先归一到秒再决策。
 */

export type SyncAction = 'upload' | 'download' | 'none'

/** 毫秒时间戳归一到秒精度（向下取整到秒桶） */
export function toSecondPrecision(ms: number): number {
  return Math.floor(ms / 1000) * 1000
}

/**
 * 同步决策：
 *  - 本地秒桶更新 → 上传
 *  - 远端秒桶更新 → 下载
 *  - 同秒（含毫秒噪音）→ 无动作
 */
export function resolveSyncAction(localUpdatedAt: number, remoteLastModified: number): SyncAction {
  const local = toSecondPrecision(localUpdatedAt)
  const remote = toSecondPrecision(remoteLastModified)
  if (local > remote) return 'upload'
  if (remote > local) return 'download'
  return 'none'
}

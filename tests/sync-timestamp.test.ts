/**
 * M-1 时间粒度回归测试（code-reviewer 审查发现）：
 * 本地 updatedAt 是毫秒精度，WebDAV Last-Modified 只有秒精度。
 * 同一秒内的毫秒差会导致：本地被误判"较新"反复上传、远端同秒修改漏下载。
 * 比较前双方必须归一到秒。
 */
import { describe, it, expect } from 'vitest'
import { resolveSyncAction } from '@/services/sync/timestamp'

describe('resolveSyncAction（秒精度归一后的同步决策）', () => {
  it('同一秒内的毫秒差 → 判等，不动作（防反复上传）', () => {
    // 本地 1000ms 桶内的 1500ms vs 远端同秒的 1000ms
    expect(resolveSyncAction(1500, 1000)).toBe('none')
  })

  it('本地确实更新（跨秒）→ 上传', () => {
    expect(resolveSyncAction(2500, 1000)).toBe('upload')
  })

  it('远端确实更新（跨秒）→ 下载', () => {
    expect(resolveSyncAction(1000, 2500)).toBe('download')
  })

  it('远端秒级时间戳比本地毫秒大但同秒 → 判等（防覆盖本地）', () => {
    // 本地 1900ms，远端 1000ms：同属第 1 秒桶，若直接比较 remote(1000) > local(1900) 为 false，
    // 会走"无动作"；这里验证归一后同样判等，不会误下载
    expect(resolveSyncAction(1900, 1000)).toBe('none')
  })

  it('完全相等 → 无动作', () => {
    expect(resolveSyncAction(3000, 3000)).toBe('none')
  })
})

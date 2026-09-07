import { describe, it, expect } from 'vitest'
import { encryptText, decryptText, isEncryptedPayload } from '@/services/crypto'

describe('crypto', () => {
  it('加解密往返还原明文', async () => {
    const plain = '墨语笔记 · 秘密内容 Markdown\n第二行'
    const cipher = await encryptText('密码123', plain)
    expect(isEncryptedPayload(cipher)).toBe(true)
    expect(cipher).not.toContain('秘密内容')
    const decrypted = await decryptText('密码123', cipher)
    expect(decrypted).toBe(plain)
  })

  it('同一内容两次加密产生不同密文（随机盐/IV）', async () => {
    const c1 = await encryptText('pw', 'same')
    const c2 = await encryptText('pw', 'same')
    expect(c1).not.toBe(c2)
  })

  it('错误密码解密抛异常', async () => {
    const cipher = await encryptText('正确密码', 'secret')
    await expect(decryptText('错误密码', cipher)).rejects.toThrow()
  })

  it('篡改密文解密失败（GCM 完整性校验）', async () => {
    const cipher = await encryptText('pw', 'secret')
    const parts = cipher.split(':')
    parts[4] = btoa(String.fromCharCode(...new TextEncoder().encode('tampered')).slice(0, 10))
    await expect(decryptText('pw', parts.join(':'))).rejects.toThrow()
  })

  it('isEncryptedPayload 判断', () => {
    expect(isEncryptedPayload('moyu-enc:v1:a:b:c')).toBe(true)
    expect(isEncryptedPayload('# 普通笔记')).toBe(false)
    expect(isEncryptedPayload('')).toBe(false)
    expect(isEncryptedPayload(undefined)).toBe(false)
  })

  it('中文密码可用（UTF-8 路径）', async () => {
    const cipher = await encryptText('中文密码测试', '内容')
    const plain = await decryptText('中文密码测试', cipher)
    expect(plain).toBe('内容')
  })
})

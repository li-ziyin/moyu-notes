/**
 * 加密服务 — 原生 Web Crypto API
 * AES-GCM 256 对称加密 + PBKDF2（SHA-256, 10 万次迭代）密钥派生
 *
 * 密文格式：moyu-enc:v1:<salt b64>:<iv b64>:<cipher b64>
 */

const PREFIX = 'moyu-enc:v1:'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toB64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const buf = new ArrayBuffer(bin.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** 判断内容是否为本应用加密格式 */
export function isEncryptedPayload(s: string | null | undefined): boolean {
  return !!s && s.startsWith(PREFIX)
}

/** 加密明文，返回带前缀的密文串 */
export async function encryptText(password: string, plaintext: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )
  return PREFIX + [toB64(salt), toB64(iv), toB64(cipher)].join(':')
}

/** 解密密文，密码错误时抛异常 */
export async function decryptText(password: string, payload: string): Promise<string> {
  if (!isEncryptedPayload(payload)) throw new Error('不是有效的加密内容')
  const [, , saltB64, ivB64, dataB64] = payload.split(':')
  const key = await deriveKey(password, fromB64(saltB64))
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) },
    key,
    fromB64(dataB64)
  )
  return decoder.decode(plain)
}

import { describe, it, expect } from 'vitest'
import { prepareSearchText } from '@/utils/searchText'

describe('prepareSearchText', () => {
  it('中文按二元分词', () => {
    expect(prepareSearchText('中文搜索')).toBe('中文 文搜 搜索')
  })

  it('单个汉字保留单字', () => {
    expect(prepareSearchText('墨')).toBe('墨')
  })

  it('英文转小写并保留整词', () => {
    expect(prepareSearchText('Hello World')).toBe('hello world')
  })

  it('中英混排分段处理', () => {
    const out = prepareSearchText('Vue3框架')
    expect(out).toContain('vue3')
    expect(out).toContain('框架')
  })

  it('标点被丢弃，相邻汉字跨标点不连字', () => {
    // "你好，世界！" → 你好 | 世界（逗号是标点，不成 gram）
    expect(prepareSearchText('你好，世界！')).toBe('你好 世界')
  })

  it('空串与纯标点返回空', () => {
    expect(prepareSearchText('')).toBe('')
    expect(prepareSearchText('!!! ...')).toBe('')
  })
})

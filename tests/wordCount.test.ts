import { describe, it, expect } from 'vitest'
import { countWords } from '@/utils/wordCount'

describe('countWords', () => {
  it('中文逐字计数', () => {
    expect(countWords('你好世界')).toBe(4)
  })

  it('英文按单词计数', () => {
    expect(countWords('hello world foo')).toBe(3)
  })

  it('中英混排相加', () => {
    expect(countWords('两个词 hello')).toBe(4) // 3 CJK（两/个/词）+ 1 word
  })

  it('数字串算一个词', () => {
    expect(countWords('2026 年')).toBe(2)
  })

  it('标点与空白不计', () => {
    expect(countWords('你好，世界！ \n\t')).toBe(4)
  })

  it('空文本为 0', () => {
    expect(countWords('')).toBe(0)
  })
})

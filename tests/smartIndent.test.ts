import { describe, it, expect } from 'vitest'
import { detectPrefix, shouldContinue, shouldExit, getNextPrefix } from '@/utils/smartIndent'

describe('detectPrefix', () => {
  it('识别无序列表（- * +）', () => {
    expect(detectPrefix('- 项目')?.type).toBe('unordered')
    expect(detectPrefix('* 项目')?.type).toBe('unordered')
    expect(detectPrefix('+ 项目')?.type).toBe('unordered')
    expect(detectPrefix('- 项目')?.prefix).toBe('- ')
  })

  it('识别带缩进的列表', () => {
    expect(detectPrefix('  - 缩进项')?.prefix).toBe('  - ')
    expect(detectPrefix('\t1. 缩进项')?.type).toBe('ordered')
  })

  it('识别有序列表前缀', () => {
    expect(detectPrefix('1. 甲')?.type).toBe('ordered')
    expect(detectPrefix('12. 甲')?.prefix).toBe('12. ')
  })

  it('识别引用块（含嵌套）', () => {
    expect(detectPrefix('> 引用')?.type).toBe('blockquote')
    expect(detectPrefix('> > 嵌套')?.prefix).toBe('> > ')
  })

  it('普通文本与代码围栏不误判', () => {
    expect(detectPrefix('普通段落')).toBeNull()
    expect(detectPrefix('# 标题')).toBeNull()
    expect(detectPrefix('```js')).toBeNull()
    expect(detectPrefix('-')).toBeNull() // 无空格不算列表
  })
})

describe('shouldContinue / shouldExit', () => {
  it('有内容的列表项应续行', () => {
    expect(shouldContinue('- 第一项')).toBe(true)
    expect(shouldContinue('1. 甲')).toBe(true)
    expect(shouldContinue('> 引用文字')).toBe(true)
  })

  it('只有前缀的空项应退出', () => {
    expect(shouldExit('- ')).toBe(true)
    expect(shouldExit('  - ')).toBe(true)
    expect(shouldExit('1. ')).toBe(true)
    expect(shouldExit('> ')).toBe(true)
  })

  it('空项不应续行、有内容不应退出', () => {
    expect(shouldContinue('- ')).toBe(false)
    expect(shouldExit('- 有内容')).toBe(false)
    expect(shouldContinue('普通文本')).toBe(false)
    expect(shouldExit('普通文本')).toBe(false)
  })
})

describe('getNextPrefix', () => {
  it('无序/引用保持前缀', () => {
    expect(getNextPrefix('- 甲')).toBe('- ')
    expect(getNextPrefix('* 甲')).toBe('* ')
    expect(getNextPrefix('> 甲')).toBe('> ')
  })

  it('有序列表自动递增', () => {
    expect(getNextPrefix('1. 甲')).toBe('2. ')
    expect(getNextPrefix('9. 甲')).toBe('10. ')
    expect(getNextPrefix('  3. 甲')).toBe('4. ')
  })
})

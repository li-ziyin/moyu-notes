import { describe, it, expect } from 'vitest'
import { parseWikiTitles } from '@/utils/wiki'

describe('parseWikiTitles', () => {
  it('解析单个双链', () => {
    expect(parseWikiTitles('见 [[读书摘录]]')).toEqual(['读书摘录'])
  })

  it('解析多个双链并保序', () => {
    expect(parseWikiTitles('[[甲]] 和 [[乙]] 与 [[丙]]')).toEqual(['甲', '乙', '丙'])
  })

  it('重复标题去重', () => {
    expect(parseWikiTitles('[[甲]] 又见 [[甲]]')).toEqual(['甲'])
  })

  it('标题两端空格被修剪', () => {
    expect(parseWikiTitles('[[  空格标题  ]]')).toEqual(['空格标题'])
  })

  it('忽略空标题与跨行', () => {
    expect(parseWikiTitles('[[]] 多 [[\n跨行]] [[好]]')).toEqual(['好'])
  })

  it('普通链接与文本不受影响', () => {
    expect(parseWikiTitles('[普通](https://x.com) 文本 [[真双链]]')).toEqual(['真双链'])
  })
})

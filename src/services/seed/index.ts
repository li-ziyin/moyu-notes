/**
 * 首次启动种子内容
 * 空笔记库（且非文件夹模式）时创建三篇示例笔记与两个文件夹，
 * 展示双链 / 文件夹 / 标签 / 渲染效果；只播种一次（localStorage 标记），
 * 用户删除后不会复活。
 */

import { db } from '@/services/db'
import * as articleDB from '@/services/db/article'

const SEED_FLAG = 'moyu.seeded'

function generateId(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15)
}

const WELCOME = `# 欢迎使用墨语笔记

> 这是示例内容，看完删掉它们，就可以开始你自己的笔记。

墨语是一个**本地优先**的 Markdown 笔记应用：所有内容只保存在这台设备上，不会上传到任何服务器。

## 30 秒上手

1. 点击侧栏顶部的 **+** 新建笔记
2. 左侧写作，右侧实时预览
3. 随时 \`Ctrl+S\` 立即保存，平时自动保存也不用管

## 它能做什么

- **双链笔记**：输入 \`[[\` 会弹出笔记标题，试试点开 [[功能导览]]
- **文件夹与标签**：侧栏里可以分组、按标签筛选
- **知识图谱**：顶栏的图谱按钮，看看你的笔记如何连成网络 —— [[写作建议]] 里也等着你
- **沉浸写作**：折叠侧栏与预览分栏，再打开状态栏的「专注」模式

## 常用快捷键

| 快捷键 | 作用 |
|--------|------|
| \`Ctrl+P\` | 全文搜索 |
| \`Ctrl+B\` | 加粗 |
| \`Ctrl+K\` | 插入链接 |
| \`Ctrl+S\` | 立即保存 |

> 提示：侧栏的「打开本地文件夹」可以让笔记变成硬盘上真实的 \`.md\` 文件，不再受浏览器影响。`

const GUIDE = `# 功能导览

所有功能的快速索引，来自 [[欢迎使用墨语笔记]]。

## 组织

- **文件夹**：侧栏的文件夹图标新建，支持多级嵌套；笔记行悬停可见「移动到…」
- **标签**：编辑器标题下方「添加标签」，侧栏的标签按钮可筛选
- **双链**：\`[[标题]]\` 引用其他笔记，预览中点击即跳转；目标不存在会自动创建

## 安全

- **回收站**：删除的笔记可在侧栏底部找回，30 天后自动清除
- **加密笔记**：标题栏的锁图标设置密码，加密后需解锁才能查看
- **备份提醒**：超过 7 天未导出，「导出全部」按钮会亮起琥珀点

## 同步与携带

「WebDAV 同步」可以把全部笔记与你的自建服务器双向同步，跨设备使用；
也可以随时「导出全部 (.zip)」打包带走，图片资产一并导出。

## 看见知识

写几篇互相 \`[[链接]]\` 的笔记，再打开顶栏的知识图谱 ——
它们会连成一张属于你的网。`

const WRITING = `# 写作建议

> 写作不是把想法倒出来，而是把想法想清楚。

## 先写下来

不要等想清楚了再写 —— **写**这个动作本身就是在想清楚。
列表回车自动续行，空项回车即可退出；代码围栏回车自动补全闭合，别让格式打断思路。

## 用双链建立联系

当你提到一个概念，就给它一篇笔记：\`[[中心词]]\`。
日积月累后打开知识图谱，你会发现想法之间早就有了桥梁 ——
比如这篇和 [[功能导览]] 就因为同一个话题连在了一起。

## 分层组织

- 文件夹放「项目」，标签放「属性」
- 一篇笔记只说一件事，长了就拆，用双链连回去

## 沉浸与节奏

需要专注时：折叠侧栏与预览分栏，状态栏点「专注」——
光标会始终停在屏幕中部，像打字机一样陪你一行一行往前走。`

/** 空库时播种示例内容（仅执行一次） */
export async function seedWelcomeContent(): Promise<void> {
  if (localStorage.getItem(SEED_FLAG) === '1') return

  const folderStart = generateId()
  const folderAdvanced = generateId()
  await db.folders.bulkPut([
    { id: folderStart, name: '开始上手', parentId: null, sortOrder: 1, createdAt: Date.now() },
    { id: folderAdvanced, name: '进阶技巧', parentId: null, sortOrder: 2, createdAt: Date.now() },
  ])

  // 创建顺序 = 同文件夹内时间序（新的在上）：导览 → 建议 → 欢迎
  await articleDB.createArticle({
    title: '功能导览',
    content: GUIDE,
    folderId: folderStart,
    tags: ['功能'],
    filePath: null,
  })
  await articleDB.createArticle({
    title: '写作建议',
    content: WRITING,
    folderId: folderAdvanced,
    tags: ['写作'],
    filePath: null,
  })
  await articleDB.createArticle({
    title: '欢迎使用墨语笔记',
    content: WELCOME,
    folderId: null,
    tags: ['快速上手'],
    filePath: null,
  })

  localStorage.setItem(SEED_FLAG, '1')
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # 开发模式 (localhost:3000)
npm run build     # 生产构建
npm start         # 启动生产服务器 (端口 3000)
npm run lint      # ESLint 检查
```

Docker 部署: `docker compose up -d --build` (容器名 `infinite-notes`, 数据卷 `./data:/app/data`)

## Architecture

**无限嵌套白板** — 基于 tldraw v5 的白板应用, 核心机制是"子白板便签": 每个 custom-note 形状代表一个子白板, 双击进入 → 形成树状嵌套结构, 根节点固定为 `main_board_001`.

### 数据流

- **持久化**: 每次用户操作后, tldraw 的 `getSnapshot(editor.store)` 完整快照通过 POST `/api/board/[id]` 写入 SQLite (`data/dev.db`)
- **加载**: 页面挂载时 GET `/api/board/[id]`, 通过 `loadSnapshot()` 恢复画布
- **白板表结构**: `Board(id TEXT PK, elements TEXT, parentBoardId TEXT, updatedAt DATETIME)`
- `elements` 字段存储 JSON, 格式为 `{ snapshot: <tldraw snapshot>, locks: { isTitleCaptured, isImgCaptured } }`

### 父子同步机制

子白板内容自动反馈到父级便签的外观:
1. **标题捕获** (`isTitleCaptured`): 子白板首个文字输入 2 秒后, 自动设为父便签标题
2. **封面捕获** (`isImgCaptured`): 子白板首张上传图片, 自动设为父便签封面
3. 捕获后锁死, 用户可手动在弹窗中覆盖

### 关键组件

| 文件 | 职责 |
|---|---|
| `src/components/Whiteboard.tsx` | 主白板 (~960行), 含 tldraw 初始化、便签属性面板、父子同步、资源清理、导航逻辑 |
| `src/components/NoteShape.tsx` | 自定义 tldraw 形状定义 (custom-note), 含渲染、双击跳转、样式属性 |
| `src/app/board/[id]/page.tsx` | 动态路由页面, 接收 URL params (`parentId`, `rootPageId`, `targetPageId`) |
| `src/app/api/board/[id]/route.ts` | 白板 CRUD (SQLite), GET 读取 / POST 保存 |
| `src/app/api/upload/route.ts` | 图片上传管理: POST 上传、DELETE 移入回收站 (`data/trash/`)、PUT 从回收站恢复 |
| `src/app/api/uploads/[filename]/route.ts` | 动态读取图片, 支持强缓存 (immutable) |
| `src/app/page.tsx` | 首页, 直接 redirect 到 `/board/main_board_001` |

### 导航与页面状态

URL 参数传递维持上下文:
- `parentId` — 当前白板的父级 ID
- `rootPageId` — 从根白板出发时所在的 tldraw Page (Sheet), 返回根白板时精准降落
- `targetPageId` — 从子白板返回根白板时, 要切到的目标 Page

根白板 (`main_board_001`) 保留 tldraw 默认的 PageMenu 多页切换; 子白板隐藏 PageMenu.

### 资源生命周期

- 上传图片 → `data/uploads/`, 通过 Next.js rewrites (`/uploads/*` → `/api/uploads/*`) 动态读取
- 删除图片 → `rename()` 移到 `data/trash/` (撤销时移回)
- 孤儿检测: 每次保存时检查未被任何 shape 引用的 asset, 自动清理
- 递归清理: 删除便签时递归处理子白板上传文件

### 自定义字体

Xiaolai 手写字体 (`public/fonts/Xiaolai-Regular.ttf`), 在 `globals.css` 中通过 `@font-face` 定义, 通过 `!important` 注入 `.tl-container *`, 并在 `Whiteboard.tsx` 的 `onMount` 中通过 `FontFace` API 强制预加载.

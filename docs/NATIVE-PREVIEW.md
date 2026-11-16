# Mono Markdown Preview 设计说明

这是给 VS Code 原生 Markdown 预览用的扩展，不替换预览器本身。样式和目录通过官方贡献点注入，浏览器导出由扩展自带的本地服务完成。

当前版本：`1.3.3`

## 功能

1. **极简样式**：黑白灰 + 蓝色 `#1a88ff`，英文等宽，亮色/暗色/高对比自动适配。
2. **浮动目录**：右下角 `目录` 按钮，按标题层级嵌套，带垂直虚线，点击平滑跳转。
3. **在浏览器打开**：地球按钮、编辑器标题栏图标、命令面板或右键菜单；浏览器直接显示 HTML，或生成 `.mono.html` 文件。

## 目录

- 打开原生预览：`Ctrl+Shift+V`。
- 点右下角 `目录`，面板列出 `h1`–`h4`。
- 每级子列表左侧有一条垂直虚线，缩进更清楚。
- 滚动正文时，当前章节保持蓝色；点条目可平滑跳转。
- `Esc` 或点击面板外部关闭，打开状态会记住。
- 少于两个标题时自动隐藏；打印时隐藏；导出的 HTML 里也会带上目录。

## 在浏览器打开

命令：`monoMarkdown.openInBrowser`

入口：

- 预览右下角、目录按钮右侧的地球图标
- 编辑器标题栏的浏览器图标
- 命令面板 `Mono: 在浏览器打开 HTML`
- 编辑器或资源管理器右键 `.md` 文件

行为：

- 本地服务可用时，浏览器直接打开渲染后的页面。
- 服务不可用时，标题栏/命令会生成 `<文件名>.mono.html`，放在 Markdown 文件旁边。
- 服务版会把本地图片内联成 data URI；文件版使用相对路径。
- HTML 内联了 Mono 样式、目录 CSS/JS 和 VS Code 内置的 markdown/highlight 样式。
- 跟随系统深浅色，打印时使用浅色配色。

## 本地导出服务

预览里的地球按钮打开的是：

```text
http://127.0.0.1:48765/export?token=...&source=...
```

- 只监听 `127.0.0.1`，需要 token。
- 打开 Markdown 文件或执行命令时才启动，不在 VS Code 启动时占端口。
- 只渲染 Markdown，不提供任意文件浏览。
- 多窗口时只有第一个能占用端口；其他窗口请用编辑器标题栏图标。
- 仅支持本地工作区，远程/虚拟工作区不可用。

这样设计是因为预览页是沙箱 webview，按钮不能直接调用扩展命令；`vscode://` 又依赖系统协议注册，容易在部分机器上报 `0x2`。本地 HTTP 服务更稳定。

## 为什么用扩展，而不是 `markdown.styles`

官方文档只保证 `markdown.styles` 支持 https URL 或当前工作区的相对路径；跨工作区的全局绝对路径并不可靠。扩展的 `markdown.previewStyles` / `markdown.previewScripts` 是官方提供的全局入口，所以样式和目录做成了扩展。

参考：

- <https://code.visualstudio.com/docs/languages/markdown>
- <https://code.visualstudio.com/api/extension-guides/markdown-extension>
- <https://code.visualstudio.com/api/extension-guides/webview>

## 样式要点

- 黑白灰高对比，唯一强调色 `#1a88ff`
- 英文 JetBrains Mono，中文 Noto Sans SC / 微软雅黑
- H1 2px 下划线；H2 细线 + 蓝色方块
- 引用只留 3px 蓝色左线，无底色、无圆角
- 表格只有上下强边框和表头分隔线
- 代码块/行内代码 2px 圆角，无阴影
- 图片直角、无阴影
- 滚动条 8px、透明轨道、灰色滑块、悬停变蓝、无箭头
- 自动适配 `vscode-light`、`vscode-dark`、`vscode-high-contrast`

## 开发与打包

```powershell
cd E:\code\apps\mono-markdown-preview
npm test
npm run package
```

`npm run package` 使用 `vsce package --no-dependencies`。项目已配置 GitHub 仓库，README 里的相对图片地址会自动改写为仓库地址。

## 排查

- **样式没生效**：确认扩展已启用，完全重启 VS Code，并确认打开的是原生预览。
- **目录按钮没出现**：文档至少需要两个标题；确认扩展版本是 1.3.3 或更新。
- **浏览器按钮连接失败**：48765 端口可能被其他 VS Code 窗口占用；改用编辑器标题栏图标。
- **无法调用内置渲染器**：确认 VS Code 内置 Markdown 扩展没有被禁用。
- **导出图片不显示**：文件版依赖源文件旁边的相对路径；服务版要求图片能被本地扩展读取。
- **任务清单没有勾选框**：原生预览本身不支持，和样式无关。

## 已知限制

- 原生预览不渲染任务清单勾选框。
- Mermaid、数学公式等依赖预览脚本的内容，导出的 HTML 可能不完整。
- 导出的 HTML 主要面向标准 Markdown，指向其他本地文件的相对链接不会自动转换。

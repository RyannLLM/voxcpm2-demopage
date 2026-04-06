# VoxCPM2 Demo Workspace

这个目录用于从 Markdown 快速生成与主站风格相近的静态 demo 页面。

## 目录说明

- `audio/`: 存放所有音频文件
- `pics/`: 存放封面、logo、配图
- `css/`: 已复制主站样式文件
- `md/`: 存放你填写的 Markdown 内容
- `output/`: 生成后的静态页面输出目录

## 你需要填写的文件

- `md/demo-content.md`

## 推荐写法（卡片表格）

- Section 标题：使用 Markdown 的 `##`
- 样本标题：使用 Markdown 的 `### 卡片: ...`
- 每个样本保留两张表：
  - 样本信息表：字段/内容（标签、Prompt 音频、Prompt 文本、Target 文本）
  - 模型输出表：模型/音频路径

这种写法更适合手工编辑，我会基于这份 Markdown 直接生成同风格静态网页。

## 一键渲染

在项目根目录运行：

node voxcpm2-demo/scripts/render-demo.js

生成结果：

- `voxcpm2-demo/index.html`

## 表格兼容说明

- 支持卡片写法（`### 卡片: ...` 后接表格）
- 支持 Section 下直接写表格
- 支持标准 Markdown 表格（含 `|---|---|` 分隔线）
- 也支持你示例那种简表格（不写分隔线，首行作为表头）

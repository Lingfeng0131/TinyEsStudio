# Tiny ES Studio

一个可爱但专业的 Elasticsearch 桌面端小工具，适合开发、测试、运维在日常排查时快速查看索引、查询文档、直接编辑数据、执行 DSL。

它不是重量级管理平台，更像一个顺手的个人工作台：

- 保存多个 Elasticsearch 连接
- 快速切换集群与索引
- 表格方式查看、编辑、删除文档
- 独立 DSL 控制台执行 Elasticsearch 请求
- 查看索引设置与映射
- 支持浅色 / 暗黑两套主题

## 预览

### 主界面

![主界面](./docs/images/界面1.png)

### 右侧详情面板

![右侧详情面板](./docs/images/界面2.png)

### 条件筛选查询

![条件筛选查询](./docs/images/界面3.png)

### DSL 控制台

![DSL 控制台](./docs/images/界面4.png)

## 当前功能

### 连接管理

- 新增、编辑、删除 Elasticsearch 连接
- 本地持久化保存常用连接
- 手动重新测试连接并刷新索引
- 顶部明确显示当前连接和当前索引，降低误操作风险

### 索引与查询

- 左侧索引列表支持快速筛选
- 关键词查询支持全文片段搜索与 `_id` 命中
- 条件筛选支持 `AND / OR`
- 支持分页查询
- 可查看当前索引的 `settings` 和 `mappings`

### 表格增删改查

- 查询结果使用接近 Excel 的表格展示
- 支持直接新增草稿行并保存到 ES
- 支持编辑已有文档并按字段增量保存
- 支持多选后批量删除
- 支持在详情区查看当前文档原始 JSON
- 时间字段会根据列内已有值和 mapping 格式给出快捷补全

### DSL 控制台

- 独立工作区，不和表格查询混在一起
- 支持执行 Elasticsearch 常见 REST 请求
- 返回原始 JSON 响应
- 支持复制完整响应结果
- 编辑器支持基础补全：
  - HTTP 方法
  - 常见 ES API 路径
  - 当前连接下索引名
  - 当前索引字段名
  - 常用查询片段与模板

### 界面体验

- 粉白主题为默认风格
- 支持一键切换暗黑模式
- 右侧详情面板支持收起与放大
- 表格支持横向与纵向滚动
- 全局通知已适配浅色 / 暗黑主题

## 技术栈

- Electron
- React 19
- TypeScript
- Mantine
- react-data-grid
- Monaco Editor
- @elastic/elasticsearch
- electron-vite

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 类型检查

```bash
npm run typecheck
```

### 构建

```bash
npm run build
```

### 打包

```bash
npm run dist:mac
npm run dist:win
```

默认产物输出到 `release/` 目录：

- macOS：`Tiny ES Studio-<version>-macOS-arm64.dmg`
- Windows：`Tiny ES Studio-<version>-win-x64.exe`

## 使用说明

### 1. 添加连接

在左侧连接面板新增 Elasticsearch 地址，可选填写用户名、密码和 TLS 设置。

### 2. 选择索引

连接成功后会自动加载索引列表。可以先筛索引，再进入查询或 DSL 操作。

### 3. 表格模式

- 输入关键词后执行查询
- 需要更精确时可叠加条件筛选
- 直接点击单元格编辑
- 新增、保存、删除都在结果表格上方工具栏完成

### 4. DSL 模式

- 点击右上角 DSL 按钮切换到独立控制台
- 第一行输入方法和路径，例如：

```http
GET /user_index/_search
{
  "query": {
    "match_all": {}
  }
}
```

- 点击“执行”即可查看原始 JSON 响应

## 项目结构

```text
.
├─ src/
│  ├─ main/        # Electron 主进程，负责连接、查询、保存、删除等逻辑
│  ├─ preload/     # 渲染进程桥接 API
│  ├─ renderer/    # React 界面
│  └─ shared/      # 主进程与渲染进程共享类型
├─ docs/images/    # README 截图
├─ build/          # 打包图标资源
├─ electron.vite.config.ts
├─ package.json
└─ README.md
```

## 本地数据说明

- 连接配置保存在 Electron `userData` 目录
- 仓库内不包含任何真实连接信息
- 当前版本更适合个人开发环境或受控测试环境
- 如果后续用于长期正式场景，建议接入系统钥匙串或更安全的凭据存储方案

## License

MIT

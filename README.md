# 智能 UI · Intelligent UI for DeepSeek Harness

参考 [thesysdev/open-intelligent-ui](https://github.com/thesysdev/open-intelligent-ui) 实现的 DSH 插件：
**模型的回答不再是一段文字，而是一个可以直接操作的界面。**

模型调用 `intelligent_ui` 工具，写出一段声明式的 **openui-lang** 程序；Harness Web GUI 在聊天里把它渲染成真实的交互界面——
可编辑的清单、滑块、下拉框、表格、图表、SVG 绘图。所有控件绑定在 `$变量` 上，界面上任何一处改动都会让整段程序重新计算，
所以回答本身就是一个能干活的工具，而不是一张需要再发回给模型的表单。

```
模型 ──tool call: intelligent_ui({ title, program })──▶ 会话日志 (tool/call)
                                                        │
客户端 tool.call.toolview[key=intelligent_ui] ◀─────────┘
  读取 block.call.argsRaw → parse → evaluate → React 元素树（自带 $state）
```

## 安装

需要 DeepSeek Harness（带 `plugin_manager`；Creator 预设默认启用该工具，Web 侧栏的**插件**页也可以安装外部 bundle）。

### 方式一：从 npm 安装（推荐）

已发布到 npm：<https://www.npmjs.com/package/@my-dsh/dsh-intelligent-ui>

```text
plugin_manager(action="install_bundle", target="@my-dsh/dsh-intelligent-ui")
```

- 包名**必须带 `@my-dsh/` scope**：npm 上裸名 `dsh-intelligent-ui` 已被另一个同名插件占用，用裸名安装会装到别人的包。
- 国内不需要额外配置：pnpm 走你已配置的 registry（npmmirror 已同步本包）。
- 仓库自带构建产物 `client.js`，安装即用，不需要构建步骤。

### 方式二：从插件市场安装

在 Web 侧栏的**插件**页启用实验性的「自定义插件市场」，添加索引源：

```text
https://my-dsh.github.io/deepseek-intelligent-ui/market/index.json
```

索引里只有本插件，安装同样解析到 npm 上的版本。

### 方式三：从 GitHub 安装

仓库自带构建产物 `client.js`，**无需预先构建**。安装 spec 任选一种等价写法：

```text
github:my-dsh/deepseek-intelligent-ui
https://github.com/my-dsh/deepseek-intelligent-ui.git
```

通过 agent 的 `plugin_manager` 工具安装：

```text
plugin_manager(action="install_bundle", target="github:my-dsh/deepseek-intelligent-ui")
```

管理器会先用 `git ls-remote` 探测仓库可达性，再交给 pnpm 安装。

### 安装后

`install_bundle` 会把包装进 profile 的依赖，并把 `@my-dsh/dsh-intelligent-ui` 追加到 profile
`package.json` 的 `dsh.profile.bundles` 列表。它**不会**往 profile 的 `cordis.patch.yml` 写行：
真正启用插件的那一行来自本包自带的 `cordis.patch.yml`（bundle 层）：

```yaml
- insert:
    - id: intelligent-ui
      name: '@my-dsh/dsh-intelligent-ui'
```

要调整行为，在 profile 的 `cordis.patch.yml`（用户层，最后应用、覆盖 bundle 层）里给同一个
`id` 写一次覆盖即可（本插件不导出 `Config` schema，因此不做校验）：

```yaml
- id: intelligent-ui
  config:
    prompt: true          # 是否在系统提示里教这套语言，默认 true
    maxProgramBytes: 60000
    maxDiagnostics: 24
```

### 升级 / 切换安装来源

已经装过同名 bundle 时，再 `install_bundle` 会返回 `already-installed`（运行中的 bundle 不能就地替换）。
升级或切换来源都是"先移除、再安装"：

```text
plugin_manager(action="remove_bundle", target="@my-dsh/dsh-intelligent-ui")
plugin_manager(action="install_bundle", target="@my-dsh/dsh-intelligent-ui")
```

`remove_bundle` 同时把这一项从 `dsh.profile.bundles` 里去掉；再次安装会把它追加到列表末尾
（会改变 bundle 的配置优先级），你写在 profile `cordis.patch.yml` 里的 `config` 覆盖不受影响。

### 本地开发安装

```bash
git clone https://github.com/my-dsh/deepseek-intelligent-ui.git
cd deepseek-intelligent-ui
node scripts/build-client.mjs          # 严格构建：缺 fragment、重复顶层名、坏语法都会失败
```

以**绝对目录**为目标安装；profile 里会记成 `link:<目录>`，之后改文件立即生效：

```text
plugin_manager(action="install_bundle", target="/absolute/path/to/deepseek-intelligent-ui")
```

- 之前装过 npm/市场版本时，先 `remove_bundle` 再装目录，否则会得到 `already-installed`。
- **客户端热更新**：改完 `src/**` 后运行 `node scripts/build-client.mjs`；Web 端的 client-hmr
  每 500 ms 轮询一次 bundle，`client.js` 一变页面就换新版——不用刷新页面，也不用重启 DSH。
- **Host 半边**：`index.js`（工具与系统提示的注册）只在启动时加载，改它要重启 DSH 才生效。
  `src/lang/**` 会打进 `client.js`，语言层的改动走上面的客户端热更新。
- 确认页面正在跑哪一版：控制台读 `window.__DSH_INTELLIGENT_UI__.version`
  和 `window.__DSH_INTELLIGENT_UI__.builtAt`（构建时写入的包版本与构建戳）。

## 使用

直接让模型用界面回答，例如：

- 「我在旧金山有一天时间，帮我排一条观光路线」
- 「帮我做一个 30 年房贷计算器，能拖利率和首付」
- 「把我这份旅行清单做成能勾选、能算总价的表格」

模型会自行决定是否调用 `intelligent_ui`。工具只做校验并把诊断返回给模型；
渲染完全由客户端完成，程序直接来自会话日志里的调用参数，因此刷新、重放、fork 之后界面依然在。

## openui-lang 速览

一行一条语句，**一条语句不能换行续写**（长数组、行数据、对象都写在一条行里）；`root` 是入口；
组件按**位置**传参（不支持 `name:` 关键字参数）。

```
$budget = 1200
$days = 3

root = Col([Title("旧金山一日路线", "2xl"), Text(["全程 ", Text($days + " 天", "md", "muted"), "，预算 $", Input($budget, "预算", "number")]), Slider($days, 1, 7, 1, "天数", "天"), Chart("bar", @Each(@Range(0, 3), "i", {day: "D" + (i + 1), cost: $budget / $days * (i + 1)}), "day", ["cost"]), Row([Button("重新计算", @Set($budget, 1500)), Button("清空", @Reset())])], 4)
```

- **状态**：`$name = 默认值` 声明；输入组件的第一个参数就是它绑定的 `$变量`。
- **动作**：`@Set($x, v)`、`@Reset()`、`@OpenUrl(url)`、`@CopyToClipboard(text)`、`@ToAssistant(text)`；
  多个动作写 `Action([...])`。
- **函数**：`@Sum @Avg @Each @Filter @Range @Round @Format @Allocate @Payment @GroupBy @Stats` 等 60+ 个，
  列表、数字、文本、日期、颜色、仪表盘数据都有。
- **组件**：48 个，分六组——布局、文本、输入、媒体与数据、绘图、互动。

完整的组件签名与函数签名由插件自己写进系统提示（`src/lang/spec.js`），模型只看得到真实实现过的部分。

## 避坑清单（来自真实会话，2026-10-16）

一次「30 年房贷计算器」会话连续踩了下面这些坑。每条都对应到修复或约定，**下次直接照做**。

### 写程序时（语言层）

1. **一条语句必须待在单独一行**。解析器按物理行切 token，`root = Col([` 换行接着写会直接报错
   （`expected "]" to close the array`、`expected "=" after Title` 一连串）。本 README 速览里的
   示例曾经就是多行写的——那是一个**非法程序**，已改成单行，并有测试守着（见 `test/docs.test.mjs`）。
2. **对象键只能是裸标识符，中文键必须加引号**：`{"年份": y, "本金": 1}`；写成 `{年份: y}` 是
   tokenizer 错误（`unexpected character "年"`）。
3. **枚举参数写错不报错，只静默回退**，所以特别容易漏：Card 的 `variant` 只有 `"outline" | "soft"`
   （没有 `"filled"`/`"elevated"`）；**Button 的 `variant` 只有
   `"primary" | "secondary" | "ghost" | "outline" | "danger"`——没有 `"soft"`**（那是 Card 的变体，
   真实 demo 里 `Button("Book these for me", …, "soft", "primary")` 静默回退成了 `primary`）；Text 的
   `weight` 只有 `"normal" | "medium" | "semibold"`（不是 `700`）；Chart 的 `type` 是
   `"bar"|"line"|"area"|"pie"|"donut"|"scatter"`，`format` 是 `"number"|"currency"|"percent"`。
4. **Table 的 `rows` 是"单元格数组的数组"**（`any[][]`，按列序），不是对象数组；Chart 的 `series`
   必须是行对象的键（要中文图例，就把行对象的键写成带引号的中文）。
5. **贷款/房贷有现成函数，不要手推公式**：`@Payment(principal, rate, periods)` 就是等额本息月供
   （`rate` 是每期利率的百分数：年利率 ÷ 12，期数 = 年数 × 12）；等额本金月供 = 本金 ÷ 期数 +
   剩余本金 × 每期利率，总利息 = 本金 × 每期利率 × (期数 + 1) ÷ 2。
6. 诊断会随工具结果返回给模型，照着行号改就行；解析失败时不会有部分渲染。

### 用户说"没看见"时（渲染层）

真实案例：一个 1337px 高的计算器渲染在聊天记录靠上的位置，聊天窗口默认吸附在底部，用户只看到后面
的文字回复，于是反馈"没看见啊"——界面其实渲染成功了。

- **界面块渲染在工具调用所在的位置**，不会浮起；聊天记录越长、界面越高，越容易落在视口外。
- **a11y 快照看不到它**：界面在 shadow DOM 里，`take_snapshot` 抓不到任何控件。用 DOM 查询验证：
  `document.querySelectorAll('input[type=range]').length`、`label.iui-field-label` 的文本，
  或读 `window.__DSH_INTELLIGENT_UI__`（已注册组件/函数数、`$state` 存储、`parseProgram`）。
- **处置顺序**：① 保持 root 紧凑——Chart 传 `height`、少堆卡片，一个界面控制在半屏到一屏；
  ② 已经滚出去时，**在原地重新调用一次 `intelligent_ui`**，新块落在当前消息底部，用户一眼看到；
  ③ 也可以把聊天记录的滚动容器滚到界面顶部，但页面一交互就会重新吸附回底部，不如 ② 稳。
- 刷新、重放、fork 之后界面会从会话日志重建，不会丢。

## 实现结构

| 路径 | 作用 |
| --- | --- |
| `index.js` | Host 半边：注册 `intelligent_ui` 工具 + 系统提示段落；不 import 任何外部包 |
| `client.js` | 由构建脚本生成的浏览器产物（`window.__ModuleLoader__.load`） |
| `src/lang/` | 语言核心：词法/语法、求值器、`@函数`、签名表、提示文本（Host 与浏览器共用同一份源码） |
| `src/client/` | 客户端外壳：状态存储、渲染器、槽位注册、诊断入口 |
| `src/client/components/` | 48 个组件的实现 |
| `scripts/build-client.mjs` | 把 `src/**` 拼成 `client.js`（无打包器、无依赖） |
| `docs/INTERFACES.md` | 冻结的模块间接口契约 |

扩展点只有两个，都是 Harness 已经提供的位置：

- **Host**：`ctx.tools.register`（工具）与 `ctx.systemPrompt.section`（语言说明）。
- **Client**：`tool.call.toolview` 中以 `intelligent_ui` 为 key 的视图。

界面只使用宿主主题令牌（`--dsw-alias-*`）承载底色、文字与边框，图形与数据色另外定义，
不写死主题；样式表由组件自身以 `<style>` 元素渲染，行卸载即移除。

## 开发

```bash
node scripts/build-client.mjs            # 由 src/** 生成 client.js（严格构建，缺文件即失败）
node --check client.js                   # 产物语法
node scripts/probe-client.mjs            # 在 Node 里真实执行产物：48/48 组件、73/73 函数、槽位注册
node --test                              # 语言核心单测 + 语料/契约/清单/发布与打包检查 + README 示例守护

# 或一条命令跑完整门禁（与 CI / 发布一致）：
npm run check
```

构建脚本是唯一的"编译"步骤：它按固定阶段顺序把 `src/lang/**` 与 `src/client/**` 拼进一个
`window.__ModuleLoader__.load` 闭包，剥掉 `import`/`export`，并逐片段做语法门禁与顶层重名检查，
因此半成品文件不会产出坏产物。转换是词法感知的（字符串/模板字符串/块注释里的 `import`/`export`
不会被改写）；产物还会丢掉整行注释（JSDoc 与独占一行的 `//`），比带注释时小约 15%，
调试产物时可用 `node scripts/build-client.mjs --keep-comments` 保留。构建是幂等的：
源码没变时重跑不会改写 `client.js`，工作区保持干净。

`.github/workflows/ci.yml` 在 push 到 main 和每个 PR 上跑同一套门禁（`npm run check` + 校验
`client.js` 与 `src/**` 一致）；推送 `vX.Y.Z` tag 后由 `publish.yml` 重跑门禁、发布 npm 并更新
插件市场索引。

测试**不要**写成 `node --test test/`（Node 会把目录参数当成模块/测试文件而报错，直接用 `node --test`）。

调试时页面控制台可读 `window.__DSH_INTELLIGENT_UI__`：已注册组件/函数数量、当前行的 `$state` 存储、
`version`/`builtAt`、以及 `parseProgram` / `evaluateProgram`，可以直接在里面试一段程序。

发布交给 CI：推 `vX.Y.Z` tag 后会跑测试、重建 `client.js` 并确认产物与 `src/**` 一致、用
`probe-client` 真实执行产物、通过 **OIDC 发布到 npm（仓库里不放任何 token）**，再把新版本写进
插件市场索引并提交回 main。一次性配置步骤与排错见 [docs/RELEASING.md](docs/RELEASING.md)。

## 验证状态

已在真实 DSH Web GUI 中完成端到端验证（安装、槽位注册、真实工具调用、交互重算、刷新重放）。
[docs/screenshots/](docs/screenshots) 的四张截图由两个真实 demo 程序（路线规划、账单拆分器）用宿主
主题令牌重新渲染采集：浅色路线、浅色拆分器、深色拆分器、390px 窄屏拆分器；截图中不含任何会话内容。

| 项目 | 证据 |
| --- | --- |
| 插件安装 | `install_bundle` 目录链接安装，`application: applied`，无 warning |
| 槽位注册 | `tool.call.toolview` 占用者出现 `intelligent_ui`（active） |
| 工具注册 | 工具清单可见 `intelligent_ui`；真实调用返回 `Rendered … 11 statement(s), state: people, days, budget, pace, booked, bookedAll` |
| 页面渲染 | 两个真实调用各渲染 1 个 `.iui-root`：路线卡片 6 行表格 / 1 滑块 / 8 按钮 / 10 个 SVG 矩形；账单拆分器 4 行 16 格表格，0 个错误框与截断提示 |
| 交互重算 | 拖动滑块 \$180→\$400；点选 Pressable 0/5→1/5；数字输入 2→4 人；账单拆分器 3→6 人使「每人」\$494.67→\$247.33；`@Reset()` 恢复默认 |
| 重放稳定 | 刷新页面后两行界面**从会话日志重建**（仍为 2 个 `.iui-root`），无需重跑模型 |
| 数组模板 @Each + Table | 发布前该组合会退化成"每个单元格一行"；修复后实测 4 行 16 格（`Flights｜1｜$420｜$420` …） |
| 表单可达性 | 8 个控件全部具备唯一 `id`/`name`，且 8 个 `<label for>` 一一对应；页面上的相关审计计数由 46 降到 1（剩下 1 个属于宿主输入框） |
| 按钮对比度 | 修复两处叠加 bug：① `.iui-root button { color: inherit }`（特异性 0,1,1）压过所有 `.iui-btn-*` 变体（0,1,0）；② filled 变体上的 `color` 参数把标签涂成了填充色。修复前浅色主按钮文字/背景同为 `#0f1115`（1:1，完全不可见），深色同为 `#f9fafb`；修复后浅色 `#fff`/`#0f1115`、深色 `#151517`/`#f9fafb`，均远超 WCAG AA 的 4.5:1 |
| 深色主题 | 宿主的暗色由 `body[data-ds-dark-theme]` 切换（不是 `prefers-color-scheme`）；加上该选择器后，我们的 22 个 `--iui-c-*` 全部跟随切换（chart1 `#4f7df3→#7a9dfb`、brand-soft `#e8f0ff→#1b2740`、shadow 换深色），Badge 文本对比度 `1.10:1 → 14.24:1`（WCAG AA 需 4.5） |
| 移动端窄屏 | 390×844 模拟下：界面宽 263px、无横向溢出，表格与图表按宽度收缩，页面无横向滚动 |
| 控制台 | 本插件无报错；页面里唯一的 404 来自随 dsh 发布的 `ui-open-in-app` 插件，与本插件无关 |
| 浏览器外 | `node --test` 全绿（数量以命令输出为准；含 README 示例守护与发布/打包检查）、`probe-client` PASS（48/48 组件、73/73 函数）、真实 React 18 SSR 渲染 0 warning 与 0 key 警告 |
| 性能（2026-10-17 优化轮） | 300 行仪表盘（Table+2 Chart+每行 `@Format`）单次求值 **10.27 ms → 0.85 ms**（12×，Intl 格式化器缓存 + 稀疏行跳过空值）；5000 行表格 DOM 节点 **15,015 → 1,517**（数据组件按输出预算截断并给提示）；一次状态刷新重复打印的诊断 **30 条 → 1 条**；`client.js` **317,325 → 282,382 B**（−11%，产物去掉整行注释）。测量方式：`node --input-type=module` 直接对比 `HEAD` 与当前的 `src/lang`，以及 React 18 + jsdom 挂载真实产物后驱动滑块 |

## 当前的边界（v1）

- 未实现：`Markdown`、`Math`（KaTeX）、`SearchImage`（联网找图）、`Map`/`MapMarker`（MapLibre）、
  `YouTube`、`HtmlView`（沙箱 iframe）。程序里用到它们会渲染成「未知组件」提示框，
  系统提示也不会教这些名字。
- 界面在工具调用参数完整后出现（`start` 阶段），不是逐字流式；参数未到时显示骨架。
- 单个界面最多渲染 400 个组件节点、20 层嵌套，超出部分显示提示，避免失控程序卡住聊天。
- 不导出 `Config` schema：可调项通过 `cordis.patch.yml` 的行 `config` 传入，不做界面校验。

## 致谢

感谢 [Linux.do](https://linux.do) 社区对本项目的推广。

## 许可

MIT，见 [LICENSE](LICENSE)。图示为原创作品。openui-lang 的语言与组件**设计参考**了上游
[open-intelligent-ui](https://github.com/thesysdev/open-intelligent-ui)（独立项目，与本插件无隶属关系；
其仓库未附许可证文件，本项目为独立实现，未复制其代码）。

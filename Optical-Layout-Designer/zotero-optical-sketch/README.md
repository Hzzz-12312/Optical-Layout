# 光路手绘 · Optical Sketch（Zotero 插件）

在 Zotero 条目面板里为 PDF 附件手绘光路草图，草图按附件保存在本机，并可导出为
Optical Layout Designer 能读取的原理图 JSON。

## 安装

1. Zotero 7.0 及以上（已在 Zotero 10.0.8 上验证打包格式）。
2. 打开 **工具 → 插件**（Tools → Plugins）。
3. 点右上角的齿轮 → **Install Plugin From File…**，选择 `Optical-Sketch-0.1.1.xpi`
   （本地在仓库根目录，GitHub 上在 `Optical-Layout-Designer/Optical-Sketch-0.1.1.xpi`）。
4. 选中一个 PDF 附件条目，右侧条目面板会出现「光路手绘」分区。

也可用于调试：**工具 → 开发者 → Run JavaScript**，或把 `.xpi` 直接放进
`<profile>/extensions/optical-sketch@local.tools.xpi` 后重启 Zotero。

## 打包

插件源码在本目录，打包脚本只把运行期文件写进 XPI：

```
python zotero-optical-sketch/build.py
# 生成 Optical-Sketch-<version>.xpi 到仓库根目录
```

改了 `manifest.json` 的 `version` 后重新打包即可。

## Zotero 10 的插件清单要求（导入失败的常见原因）

Zotero 10 会拒绝缺少以下字段的插件，界面通常只提示“插件已损坏 / 无效”：

- `applications.zotero.id`
- `applications.zotero.update_url`
- `applications.zotero.strict_max_version`

`strict_min_version` 里不允许出现 `*`。`update_url` 指向 GitHub `main` 分支上的
本目录 `update.json`（推送后才会生效）：Zotero 检查更新时会去拉取，暂时拉不到不影响
插件安装和运行。

另外两个与版本相关的提示：

| 提示 | 含义 | 处理 |
|---|---|---|
| “…与 Zotero x.y 不兼容” | 当前 Zotero 版本不在 `strict_min_version`–`strict_max_version` 区间 | 调整 `manifest.json` 后重新打包 |
| “插件似乎已损坏 / 无法安装” | 清单缺字段、JSON 语法错误、XPI 结构不对 | 跑 `build.py`，它会在打包前校验清单 |

## 文件

| 文件 | 用途 |
|---|---|
| `manifest.json` | 插件清单（版本、ID、兼容范围、更新地址） |
| `bootstrap.js` | 生命周期入口，注册条目面板分区 |
| `editor.js` / `editor.css` | SVG 光路画布与交互 |
| `storage.js` | 按附件读写草图、导出 Designer JSON |
| `locale/{en-US,zh-CN}/optical-sketch.ftl` | 面板标题与提示文本 |
| `build.py` | 打包脚本（不进入 XPI） |
| `update.json` | `update_url` 指向的更新清单（不进入 XPI） |

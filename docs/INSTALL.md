# 安装指南 | Installation Guide

## 目录

- [系统要求](#系统要求)
- [安装方式一：手动安装](#安装方式一手动安装)
- [安装方式二：通过 BRAT 安装](#安装方式二通过-brat-安装)
- [安装方式三：从源码构建](#安装方式三从源码构建)
- [首次配置](#首次配置)
- [验证安装](#验证安装)
- [更新插件](#更新插件)
- [卸载插件](#卸载插件)
- [故障排除](#故障排除)

---

## 系统要求

| 要求 | 最低版本 |
|------|---------|
| Obsidian | ≥ 1.4.0（Desktop） |
| macOS | ≥ 12 (Monterey) |
| Windows | ≥ 10 |
| Linux | Ubuntu 22.04+ 或同等发行版 |
| 麦克风 | 系统默认/外接/蓝牙麦克风均可 |

> ⚠️ 当前版本仅支持桌面端（Desktop Only），移动端（iOS / Android）支持计划在后续版本中加入。

---

## 安装方式一：手动安装

这是最直接的安装方式，适合大多数用户。

### 步骤

1. **下载插件文件**

   前往 [GitHub Releases](https://github.com/your-repo/obsidian-meeting-assistant/releases) 页面，下载最新版本的以下文件：
   - `main.js`
   - `manifest.json`

2. **找到 Obsidian 插件目录**

   打开你的 Vault 所在文件夹，找到 `.obsidian/plugins/` 目录：

   | 操作系统 | 典型路径 |
   |---------|---------|
   | macOS | `~/Documents/MyVault/.obsidian/plugins/` |
   | Windows | `C:\Users\你的用户名\Documents\MyVault\.obsidian\plugins\` |
   | Linux | `~/Documents/MyVault/.obsidian/plugins/` |

   > 💡 如果 `plugins` 文件夹不存在，请手动创建。
   >
   > 💡 `.obsidian` 是隐藏文件夹。macOS 上按 `Cmd+Shift+.` 显示隐藏文件；Windows 上在文件资源管理器中开启「显示隐藏文件」。

3. **创建插件文件夹**

   在 `plugins/` 目录下创建名为 `obsidian-meeting-assistant` 的文件夹。

4. **复制文件**

   将下载的 `main.js` 和 `manifest.json` 复制到新创建的文件夹中：

   ```
   你的Vault/
   └── .obsidian/
       └── plugins/
           └── obsidian-meeting-assistant/
               ├── main.js
               └── manifest.json
   ```

5. **启用插件**

   - 重启 Obsidian（或按 `Ctrl/Cmd + R` 重新加载）
   - 进入 **设置 → 第三方插件**
   - 如果看到「安全模式」已开启，请关闭它
   - 在已安装插件列表中找到 **Meeting Assistant**，打开开关启用

---

## 安装方式二：通过 BRAT 安装

[BRAT](https://github.com/TfTHacker/obsidian42-brat)（Beta Reviewers Auto-update Tester）是一个 Obsidian 插件管理工具，支持安装 GitHub 上的 Beta 插件并自动更新。

### 步骤

1. **安装 BRAT 插件**

   - 设置 → 第三方插件 → 浏览 → 搜索 "BRAT"
   - 安装并启用 **Obsidian42 - BRAT**

2. **添加 Meeting Assistant**

   - 设置 → BRAT → 点击 **"Add Beta plugin"**
   - 在弹出的输入框中输入仓库地址：
     ```
     your-username/obsidian-meeting-assistant
     ```
   - 点击 **"Add Plugin"**

3. **启用插件**

   - 设置 → 第三方插件 → 找到 **Meeting Assistant** → 启用

### BRAT 自动更新

BRAT 会自动检查更新。你也可以手动检查：
- 设置 → BRAT → 点击 **"Check for updates"**

---

## 安装方式三：从源码构建

适合开发者或想要使用最新代码的用户。

### 前置要求

- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) ≥ 9
- [Git](https://git-scm.com/)

### 步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/your-repo/obsidian-meeting-assistant.git
   cd obsidian-meeting-assistant
   ```

2. **安装依赖**

   ```bash
   npm install
   ```

3. **构建插件**

   ```bash
   npm run build
   ```

   构建完成后，项目根目录会生成 `main.js` 文件。

4. **安装到 Vault**

   将 `main.js` 和 `manifest.json` 复制到你的 Vault 插件目录：

   ```bash
   # macOS / Linux 示例
   cp main.js manifest.json ~/Documents/MyVault/.obsidian/plugins/obsidian-meeting-assistant/

   # 或者用软链接（开发时推荐，修改即时生效）
   ln -s $(pwd)/main.js ~/Documents/MyVault/.obsidian/plugins/obsidian-meeting-assistant/main.js
   ln -s $(pwd)/manifest.json ~/Documents/MyVault/.obsidian/plugins/obsidian-meeting-assistant/manifest.json
   ```

5. **开发模式（可选）**

   如果你想在修改代码时自动重新构建：

   ```bash
   npm run dev
   ```

   这会启动 esbuild 的 watch 模式，源码变动时自动重建 `main.js`。

---

## 首次配置

安装并启用插件后，进入 **设置 → Meeting Assistant** 进行初始配置：

### 基本设置

1. **音频保存目录**（默认 `meeting-recordings`）
   - 录音文件将保存到 Vault 中的此目录
   - 目录会在首次录音时自动创建

2. **笔记保存目录**（默认 `meeting-notes`）
   - 会议笔记将保存到 Vault 中的此目录

3. **音频比特率**（默认 128 kbps）
   - 推荐大多数场景使用 128 kbps
   - 如果会议需要高保真音质，可选择 192 或 256 kbps

4. **自动创建笔记**（默认开启）
   - 录音完成后自动创建包含录音链接的会议笔记模板

### API 服务配置（即将推出的设置面板功能）

在完整版设置面板中，你还需要配置：

- **STT API Key** — OpenAI API Key 用于 Whisper 语音转文字
- **LLM 服务选择** — OpenAI / Claude / Ollama
- **LLM API Key** — 对应 LLM 服务的 API Key
- **自定义 Base URL** — 如使用代理服务

---

## 验证安装

安装完成后，进行以下检查：

1. ✅ 左侧工具栏出现 🎙️ 麦克风图标
2. ✅ 底部状态栏显示 "🎙️ 就绪"
3. ✅ `Ctrl/Cmd + P` 命令面板中搜索 "Meeting Assistant" 能看到相关命令
4. ✅ 设置面板中能看到 "会议助手设置" 页面
5. ✅ 点击录音按钮后系统弹出麦克风权限请求

---

## 更新插件

### 手动安装用户

1. 下载新版本的 `main.js` 和 `manifest.json`
2. 替换插件目录中的对应文件
3. 重启 Obsidian

### BRAT 用户

BRAT 会自动检测更新，也可手动：
- 设置 → BRAT → Check for updates

### 源码构建用户

```bash
git pull
npm install
npm run build
# 然后重新加载 Obsidian
```

---

## 卸载插件

1. 设置 → 第三方插件 → 关闭 Meeting Assistant 开关
2. 点击 Meeting Assistant 旁的删除按钮（垃圾桶图标）
3. 或手动删除 `.obsidian/plugins/obsidian-meeting-assistant/` 目录

> 💡 卸载插件不会删除你的录音文件和会议笔记，它们依然保留在 Vault 中。

---

## 故障排除

### 插件未出现在列表中

- 确认 `.obsidian/plugins/obsidian-meeting-assistant/` 目录下有 `main.js` 和 `manifest.json`
- 确认「安全模式」已关闭
- 尝试完全重启 Obsidian（不仅仅是重新加载）

### 录音按钮没有反应

- 检查浏览器/系统是否授予了麦克风权限
- macOS：系统偏好设置 → 安全性与隐私 → 隐私 → 麦克风
- Windows：设置 → 隐私 → 麦克风

### 录音文件没有保存

- 检查设置中的音频保存目录路径是否正确
- 确认 Vault 所在磁盘有足够的存储空间

### 控制台报错

打开开发者工具查看详细错误信息：
- macOS：`Cmd + Option + I`
- Windows/Linux：`Ctrl + Shift + I`

如果问题持续存在，请在 [GitHub Issues](https://github.com/your-repo/obsidian-meeting-assistant/issues) 中报告，并附上控制台错误信息。

---

*如有其他问题，欢迎在 GitHub 提交 Issue 或参与社区讨论。*

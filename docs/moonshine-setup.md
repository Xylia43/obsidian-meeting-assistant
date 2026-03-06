# Moonshine 语音识别集成指南

## 简介

Moonshine 是一个完全免费的本地语音识别模型，准确率超过 Whisper Large V3，支持多语言。

**优势：**
- 完全本地运行，无需 API Key
- 免费使用，无调用限制
- 隐私保护，数据不上传
- 支持中文、英文等多种语言

**项目地址：** https://github.com/moonshine-ai/moonshine

## 安装步骤

### 1. 安装 Python 依赖

进入插件目录下的 `moonshine-server` 文件夹：

```bash
cd moonshine-server
pip install -r requirements.txt
```

### 2. 下载 Moonshine 模型

下载英文模型：
```bash
python -m moonshine_voice.download --language en
```

下载中文模型：
```bash
python -m moonshine_voice.download --language zh
```

支持的语言：en, zh, ja, ko, es, fr, de 等

### 3. 启动服务

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
双击 `start.bat` 或在命令行运行：
```
start.bat
```

服务启动后会监听 `http://127.0.0.1:8765`

## 插件配置

1. 打开 Obsidian 设置 → 会议助手
2. 在 "语音转写 (STT)" 部分：
   - **STT 提供商**：选择 `Moonshine (本地)`
   - **STT Base URL**：保持默认 `http://localhost:8765`
   - **语言**：填写 `zh`（中文）或 `en`（英文）

3. 保存设置

## 使用流程

1. 确保 Moonshine 服务正在运行
2. 在 Obsidian 中开始录音
3. 录音完成后，插件会自动调用本地服务进行转写
4. 转写结果会保存到笔记中

## 故障排查

### 服务无法启动

**问题：** 提示模型未下载
**解决：** 运行 `python -m moonshine_voice.download --language en`

**问题：** 端口 8765 被占用
**解决：** 修改 `server.py` 中的端口号，同时更新插件设置中的 Base URL

### 转写失败

**问题：** 插件提示连接失败
**解决：** 
1. 检查 Moonshine 服务是否正在运行
2. 访问 http://localhost:8765/health 测试服务状态
3. 检查防火墙是否阻止了本地连接

**问题：** 转写结果为空
**解决：**
1. 确认音频文件格式正确（支持 wav, mp3, webm）
2. 检查语言设置是否匹配音频内容
3. 查看服务日志排查错误

### 性能问题

**问题：** 转写速度慢
**解决：**
- Moonshine 首次加载模型需要时间，后续会更快
- 确保系统有足够内存（建议 4GB+）
- 考虑使用 GPU 加速（需要配置 CUDA）

**问题：** 内存占用高
**解决：**
- Moonshine 模型需要约 2GB 内存
- 转写完成后可以关闭服务释放内存
- 按需启动服务即可

## 与 Whisper 对比

| 特性 | Moonshine | Whisper API |
|------|-----------|-------------|
| 费用 | 免费 | 按使用量付费 |
| 隐私 | 完全本地 | 数据上传到云端 |
| 速度 | 取决于本地硬件 | 通常较快 |
| 准确率 | 优秀 | 优秀 |
| 配置 | 需要安装 Python | 仅需 API Key |

## 高级配置

### 修改服务端口

编辑 `server.py`，修改最后一行：
```python
uvicorn.run(app, host="127.0.0.1", port=8765)  # 改为其他端口
```

### 多语言支持

服务启动后会根据请求动态加载对应语言模型，首次使用某语言时会有延迟。

### 后台运行

**Linux/macOS:**
```bash
nohup python3 server.py > moonshine.log 2>&1 &
```

**Windows:**
使用任务计划程序或第三方工具（如 NSSM）将服务注册为系统服务。

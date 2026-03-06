# Moonshine 集成方案

## 📋 Moonshine 概述

- **项目**: https://github.com/moonshine-ai/moonshine (7000+ stars)
- **特点**: 
  - 完全免费，本地运行，无需 API Key
  - 专为实时语音优化，低延迟
  - 准确率超过 Whisper Large V3
  - 支持多语言（英语、中文、日语等）
  - 模型小巧（最小 26MB）
  - Python 库：`pip install moonshine-voice`

## 🎯 集成方案

### 方案 A：Python 服务桥接（推荐）

**架构**：
```
Obsidian 插件 → HTTP 请求 → Python 本地服务 → Moonshine → 返回转写结果
```

**优点**：
- 实现简单，插件只需调用 HTTP API
- Python 生态成熟，易于调试
- 可以复用现有的 STT Provider 架构

**步骤**：
1. 创建 Python Flask/FastAPI 服务，封装 Moonshine API
2. 插件添加 `MoonshineProvider` 类
3. 用户本地启动 Python 服务（一键脚本）
4. 插件配置 `baseUrl: http://localhost:8765`

### 方案 B：WASM 集成（未来）

**架构**：
```
Obsidian 插件 → WASM 模块 → Moonshine C 核心 → 返回结果
```

**优点**：
- 无需额外服务，纯浏览器运行
- 用户体验最佳

**缺点**：
- 需要将 Moonshine C 核心编译为 WASM
- 开发复杂度高
- 首次加载模型较慢

## 📝 实施计划（方案 A）

### 第 1 步：创建 Moonshine 本地服务

创建 `moonshine-server/` 目录，包含：
- `server.py` — FastAPI 服务
- `requirements.txt` — 依赖列表
- `start.sh` / `start.bat` — 启动脚本
- `README.md` — 使用说明

API 端点：
```
POST /transcribe
Content-Type: multipart/form-data
Body: file (音频文件), language (可选)

Response:
{
  "text": "完整转写文本",
  "segments": [...],
  "language": "zh",
  "duration": 120.5
}
```

### 第 2 步：插件添加 MoonshineProvider

在 `src/services/stt-service.ts` 中：
- 添加 `'moonshine'` 到 `STTProviderType`
- 实现 `MoonshineProvider` 类
- 调用本地服务 API

### 第 3 步：更新设置

在 `src/types/index.ts` 中：
- `sttProvider` 添加 `'moonshine'` 选项
- 默认 `sttBaseUrl: 'http://localhost:8765'`

### 第 4 步：文档和脚本

- 编写安装指南
- 提供一键启动脚本
- 添加故障排查文档

## 🚀 下一步行动

壳主确认方案后，我可以：
1. 创建 Python 服务代码
2. 实现 MoonshineProvider
3. 更新插件配置
4. 编写完整文档

预计开发时间：1-2 小时

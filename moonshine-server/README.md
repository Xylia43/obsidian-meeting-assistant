# Moonshine STT Server

本地语音识别服务，使用 Moonshine 模型。

## 安装

1. 安装 Python 依赖：
```bash
pip install -r requirements.txt
```

2. 下载 Moonshine 模型：
```bash
python -m moonshine_voice.download --language en
```

支持的语言：en, zh, ja, ko 等

## 启动服务

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```
start.bat
```

服务将在 `http://127.0.0.1:8765` 启动

## API

### POST /transcribe
上传音频文件进行转写

参数：
- `file`: 音频文件（支持 wav, mp3, webm 等）
- `language`: 语言代码（默认 en）

返回：
```json
{
  "text": "完整转写文本",
  "segments": [
    {"text": "片段文本", "start": 0.0, "end": 2.5}
  ],
  "language": "en",
  "duration": 10.5
}
```

### GET /health
健康检查

## 故障排查

**模型未下载：**
运行 `python -m moonshine_voice.download --language en`

**端口占用：**
修改 `server.py` 中的端口号（默认 8765）

**内存不足：**
Moonshine 需要约 2GB 内存

# 安全评估报告 (Security Audit Report)

**项目名称**: Obsidian Meeting Assistant  
**评估日期**: 2026-03-12  
**评估人员**: 安全工程师  
**项目版本**: 0.1.0  

---

## 📊 执行摘要 (Executive Summary)

本次安全评估对 Obsidian Meeting Assistant 插件进行了全面的安全审查，涵盖 API Key 存储、数据隐私、依赖包漏洞、代码安全隐患和第三方 API 调用安全性。

**总体风险等级**: 🟡 **中等风险 (MEDIUM)**

**关键发现**:
- ✅ 无高危漏洞
- ⚠️ 1 个中等风险依赖包漏洞
- ⚠️ API Key 存储机制存在潜在风险
- ✅ 代码质量良好，无明显注入漏洞
- ⚠️ 缺少部分安全最佳实践

---

## 🔍 详细评估结果

### 1. API Key 存储安全性

#### 🟡 风险等级: **中等 (MEDIUM)**

#### 发现的问题:

**1.1 API Key 明文存储**
- **位置**: `src/main.ts` - `loadSettings()` / `saveSettings()`
- **问题描述**: 
  - API Key 通过 Obsidian 的 `loadData()` / `saveData()` 存储在 `.obsidian/plugins/obsidian-meeting-assistant/data.json`
  - 该文件以明文 JSON 格式存储，包含 `sttApiKey` 和 `llmApiKey`
  - 如果用户的 Vault 同步到云端（如 iCloud、Dropbox、Git），API Key 会以明文形式暴露

**1.2 无 API Key 验证机制**
- **位置**: `src/services/stt-service.ts`, `src/services/llm-service.ts`
- **问题描述**:
  - 虽然提供了 `validateConfig()` 方法，但仅在用户主动调用时执行
  - 插件启动时不会自动验证 API Key 有效性
  - 无效的 API Key 只有在实际使用时才会报错

**1.3 API Key 在内存中明文存储**
- **位置**: `src/services/stt-service.ts:L88`, `src/services/llm-service.ts:L52`
- **问题描述**:
  - API Key 作为类的私有属性 `private readonly apiKey: string` 存储
  - 虽然是 `private`，但在内存中仍为明文，理论上可通过调试器或内存转储获取

#### 修复建议:

**高优先级**:
1. **加密存储 API Key**
   ```typescript
   // 使用 Obsidian 的加密 API（如果可用）或实现简单的加密层
   import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
   
   class SecureStorage {
     private encryptionKey: Buffer;
     
     constructor() {
       // 从用户密码派生密钥（或使用设备特定密钥）
       this.encryptionKey = this.deriveKey();
     }
     
     encrypt(plaintext: string): string {
       const iv = randomBytes(16);
       const cipher = createCipheriv('aes-256-cbc', this.encryptionKey, iv);
       const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
       return iv.toString('hex') + ':' + encrypted.toString('hex');
     }
     
     decrypt(ciphertext: string): string {
       const [ivHex, encryptedHex] = ciphertext.split(':');
       const iv = Buffer.from(ivHex, 'hex');
       const encrypted = Buffer.from(encryptedHex, 'hex');
       const decipher = createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
       return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
     }
   }
   ```

2. **添加 API Key 掩码显示**
   ```typescript
   // 在设置面板中显示掩码后的 API Key
   private maskApiKey(key: string): string {
     if (!key || key.length < 8) return '****';
     return key.slice(0, 4) + '****' + key.slice(-4);
   }
   ```

3. **添加 .gitignore 保护**
   - ✅ 已存在 `.env` 和 `.env.local` 的忽略规则
   - ⚠️ 建议添加 `data.json` 到 `.gitignore`（如果用户使用 Git 同步 Vault）

**中优先级**:
4. **实现 API Key 轮换机制**
   - 提供 UI 按钮让用户定期更换 API Key
   - 记录 API Key 创建时间，提醒用户定期更换

5. **添加启动时 API Key 验证**
   ```typescript
   async onload(): Promise<void> {
     await this.loadSettings();
     
     // 验证 API Key（静默失败，仅记录日志）
     if (this.settings.sttApiKey) {
       const sttProvider = createSTTProvider({...});
       const isValid = await sttProvider.validateConfig();
       if (!isValid) {
         console.warn('[Security] STT API Key validation failed');
       }
     }
   }
   ```

---

### 2. 数据隐私合规性

#### 🟢 风险等级: **低 (LOW)**

#### 评估结果:

**2.1 录音文件存储** ✅
- **位置**: `src/core/file-manager.ts:L35-L60`
- **评估**: 
  - 录音文件存储在本地 Vault 的 `meeting-recordings/` 目录
  - 使用 Obsidian 的 `vault.createBinary()` API，数据不会离开本地
  - 文件名包含时间戳，但不包含敏感信息
  - ✅ **符合本地优先原则**

**2.2 转写文本存储** ✅
- **位置**: `src/core/file-manager.ts:L68-L95`
- **评估**:
  - 转写文本存储在本地 Vault 的 `meeting-notes/` 目录
  - 使用 Markdown 格式，便于用户审查和编辑
  - ✅ **符合数据透明原则**

**2.3 数据传输安全** ⚠️
- **位置**: `src/services/stt-service.ts`, `src/services/llm-service.ts`
- **评估**:
  - 使用 Obsidian 的 `requestUrl()` API 发送 HTTPS 请求
  - ⚠️ **问题**: 代码中允许用户自定义 `baseUrl`，可能配置为 HTTP（非加密）
  - ⚠️ **问题**: 未强制验证 SSL 证书

**2.4 第三方 API 数据处理**
- **OpenAI Whisper API**: 
  - 音频文件上传到 OpenAI 服务器进行转写
  - ⚠️ 根据 OpenAI 政策，API 数据不会用于训练，但会短期存储
- **Anthropic Claude API**:
  - 转写文本发送到 Anthropic 服务器生成纪要
  - ⚠️ 根据 Anthropic 政策，API 数据不会用于训练
- **Ollama (本地)**:
  - ✅ 完全本地处理，无数据泄漏风险

#### 修复建议:

**高优先级**:
1. **强制 HTTPS 验证**
   ```typescript
   constructor(config: STTServiceConfig) {
     this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
     
     // 验证 URL 必须是 HTTPS（除非是 localhost）
     if (!this.baseUrl.startsWith('https://') && !this.baseUrl.includes('localhost')) {
       throw new ServiceError(
         'Base URL must use HTTPS for security',
         ServiceErrorCode.INVALID_CONFIG
       );
     }
   }
   ```

2. **添加隐私声明**
   - 在设置面板中添加明确的隐私提示：
     ```
     ⚠️ 隐私提示：
     - 使用云端 STT/LLM 服务时，音频和文本会上传到第三方服务器
     - OpenAI 和 Anthropic 承诺不使用 API 数据训练模型
     - 如需完全本地处理，请使用 Moonshine (STT) + Ollama (LLM)
     ```

**中优先级**:
3. **实现数据最小化**
   - 在发送到 API 前，提供选项让用户审查和编辑内容
   - 添加"敏感信息过滤"功能（如自动移除电话号码、邮箱等）

4. **添加数据保留策略**
   - 提供自动清理旧录音文件的选项
   - 记录每个文件的创建时间，定期提醒用户清理

---

### 3. 依赖包漏洞扫描

#### 🟡 风险等级: **中等 (MEDIUM)**

#### npm audit 结果:

```json
{
  "vulnerabilities": {
    "esbuild": {
      "severity": "moderate",
      "via": [
        {
          "source": 1102341,
          "title": "esbuild enables any website to send any requests to the development server and read the response",
          "url": "https://github.com/advisories/GHSA-67mh-4wv8-2f99",
          "severity": "moderate",
          "cwe": ["CWE-346"],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N"
          },
          "range": "<=0.24.2"
        }
      ],
      "fixAvailable": {
        "name": "esbuild",
        "version": "0.27.3"
      }
    }
  },
  "metadata": {
    "vulnerabilities": {
      "moderate": 1,
      "total": 1
    }
  }
}
```

#### 详细分析:

**3.1 esbuild 漏洞 (GHSA-67mh-4wv8-2f99)**
- **当前版本**: 0.20.0
- **受影响版本**: <=0.24.2
- **严重程度**: 中等 (CVSS 5.3)
- **漏洞描述**: 
  - esbuild 开发服务器允许任意网站发送请求并读取响应
  - 可能导致本地文件泄漏（仅在开发模式下）
- **影响范围**: 
  - ⚠️ 仅影响开发环境（`npm run dev`）
  - ✅ 不影响生产构建（`npm run build`）
  - ✅ 不影响最终用户

#### 修复建议:

**高优先级**:
1. **升级 esbuild**
   ```bash
   npm install esbuild@^0.27.3 --save-dev
   ```

2. **验证构建流程**
   ```bash
   npm run build
   # 确保构建成功且无警告
   ```

**低优先级**:
3. **添加依赖审计到 CI/CD**
   ```yaml
   # .github/workflows/security.yml
   name: Security Audit
   on: [push, pull_request]
   jobs:
     audit:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - run: npm audit --audit-level=moderate
   ```

---

### 4. 代码安全隐患

#### 🟢 风险等级: **低 (LOW)**

#### 评估结果:

**4.1 SQL 注入** ✅
- **评估**: 项目不使用数据库，无 SQL 注入风险

**4.2 XSS (跨站脚本攻击)** ✅
- **评估**: 
  - 未发现 `innerHTML`、`dangerouslySetInnerHTML` 或 `eval()` 的使用
  - 所有用户输入通过 Obsidian API 处理，自动转义
  - Markdown 渲染由 Obsidian 核心处理，已有安全防护

**4.3 路径遍历攻击** ✅
- **位置**: `src/core/file-manager.ts:L35-L60`
- **评估**:
  - 使用 Obsidian 的 `normalizePath()` API 规范化路径
  - 文件名通过 `sanitizeFileName()` 清理非法字符
  - ✅ **已实现路径安全防护**

**4.4 敏感信息泄漏** ⚠️
- **位置**: `src/services/stt-service.ts:L167`, `src/services/llm-service.ts:L78`
- **问题描述**:
  - API Key 在 HTTP 请求头中以明文传输（虽然是 HTTPS）
  - 错误日志可能包含 API Key 片段
  ```typescript
  headers: { Authorization: `Bearer ${this.apiKey}` }
  ```
- **风险**: 如果用户启用详细日志，API Key 可能泄漏到控制台

**4.5 输入验证** ✅
- **位置**: `src/core/file-manager.ts:L155-L163`
- **评估**:
  - 文件名清理函数 `sanitizeFileName()` 正确移除非法字符
  - 限制文件名长度为 100 字符
  - ✅ **输入验证充分**

#### 修复建议:

**中优先级**:
1. **改进错误日志**
   ```typescript
   private handleAPIError(status: number, body: string): ServiceError {
     // 不要在错误消息中包含完整的 API Key
     const safeBody = body.replace(/sk-[a-zA-Z0-9]{32,}/g, 'sk-****');
     
     if (status === 401) {
       return new ServiceError(
         'Invalid API key (check your settings)',
         ServiceErrorCode.API_KEY_INVALID,
         { statusCode: 401, retryable: false }
       );
     }
     // ...
   }
   ```

2. **添加请求日志过滤**
   ```typescript
   // 在开发模式下记录请求，但过滤敏感信息
   if (process.env.NODE_ENV === 'development') {
     const safeHeaders = { ...headers };
     if (safeHeaders.Authorization) {
       safeHeaders.Authorization = 'Bearer ****';
     }
     console.debug('[API Request]', { url, method, headers: safeHeaders });
   }
   ```

---

### 5. 第三方 API 调用安全性

#### 🟢 风险等级: **低 (LOW)**

#### 评估结果:

**5.1 OpenAI API**
- **位置**: `src/services/stt-service.ts:L88-L200`
- **评估**:
  - ✅ 使用官方 API 端点 `https://api.openai.com/v1`
  - ✅ 使用 Bearer Token 认证
  - ✅ 实现了指数退避重试机制
  - ✅ 正确处理 401/429/500 错误
  - ⚠️ 未实现请求超时（依赖 Obsidian 的默认超时）

**5.2 Anthropic Claude API**
- **位置**: `src/services/llm-service.ts:L125-L220`
- **评估**:
  - ✅ 使用官方 API 端点 `https://api.anthropic.com/v1`
  - ✅ 使用 `x-api-key` 头认证
  - ✅ 正确设置 `anthropic-version` 头
  - ✅ 实现了重试机制
  - ⚠️ 未实现请求超时

**5.3 Ollama (本地)**
- **位置**: `src/services/llm-service.ts:L225-L310`
- **评估**:
  - ✅ 默认使用 `http://localhost:11434`（本地服务）
  - ✅ 无需 API Key
  - ✅ 数据不离开本地
  - ⚠️ 未验证 Ollama 服务是否可信（如果用户配置远程 URL）

**5.4 Moonshine (本地 STT)**
- **位置**: `src/services/stt-service.ts:L450-L520`
- **评估**:
  - ✅ 默认使用 `http://localhost:8765`（本地服务）
  - ✅ 无需 API Key
  - ✅ 数据不离开本地
  - ⚠️ 未验证服务端点是否可信

#### 修复建议:

**中优先级**:
1. **添加请求超时**
   ```typescript
   const response = await requestUrl({
     url: `${this.baseUrl}/audio/transcriptions`,
     method: 'POST',
     headers: { ... },
     body,
     timeout: 60000, // 60 秒超时
   });
   ```

2. **验证本地服务端点**
   ```typescript
   constructor(config: LLMServiceConfig) {
     this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
     
     // 如果不是 localhost，警告用户
     if (!this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1')) {
       console.warn('[Security] Using remote Ollama endpoint:', this.baseUrl);
       // 可选：要求用户确认
     }
   }
   ```

3. **实现速率限制**
   ```typescript
   class RateLimiter {
     private requests: number[] = [];
     private readonly maxRequests = 10;
     private readonly windowMs = 60000; // 1 分钟
     
     async checkLimit(): Promise<void> {
       const now = Date.now();
       this.requests = this.requests.filter(t => now - t < this.windowMs);
       
       if (this.requests.length >= this.maxRequests) {
         throw new ServiceError(
           'Rate limit exceeded (client-side)',
           ServiceErrorCode.RATE_LIMITED
         );
       }
       
       this.requests.push(now);
     }
   }
   ```

---

## ✅ 合规性检查清单

### GDPR (通用数据保护条例) 合规性

| 要求 | 状态 | 说明 |
|------|------|------|
| 数据最小化 | ⚠️ 部分符合 | 仅收集必要数据，但可改进敏感信息过滤 |
| 用户同意 | ❌ 不符合 | 缺少明确的隐私政策和用户同意流程 |
| 数据可携带性 | ✅ 符合 | 所有数据以标准格式（Markdown/WebM）存储 |
| 被遗忘权 | ✅ 符合 | 用户可随时删除本地文件 |
| 数据安全 | ⚠️ 部分符合 | 本地存储安全，但 API Key 未加密 |
| 透明度 | ⚠️ 部分符合 | 需要添加隐私政策和数据处理说明 |

### CCPA (加州消费者隐私法案) 合规性

| 要求 | 状态 | 说明 |
|------|------|------|
| 隐私通知 | ❌ 不符合 | 缺少隐私通知 |
| 访问权 | ✅ 符合 | 用户可访问所有本地数据 |
| 删除权 | ✅ 符合 | 用户可删除所有数据 |
| 选择退出 | ✅ 符合 | 用户可选择不使用云端服务（使用本地模型） |

### 行业最佳实践

| 实践 | 状态 | 说明 |
|------|------|------|
| 最小权限原则 | ✅ 符合 | 插件仅请求必要的 Obsidian API 权限 |
| 安全编码 | ✅ 符合 | 无明显注入漏洞 |
| 依赖管理 | ⚠️ 部分符合 | 存在 1 个中等风险依赖漏洞 |
| 错误处理 | ✅ 符合 | 完善的错误处理和用户提示 |
| 日志安全 | ⚠️ 部分符合 | 需要过滤敏感信息 |
| 加密存储 | ❌ 不符合 | API Key 未加密存储 |

---

## 🎯 优先级修复路线图

### 🔴 高优先级 (1-2 周内完成)

1. **升级 esbuild 到 0.27.3+**
   - 修复已知的中等风险漏洞
   - 预计工作量: 1 小时

2. **实现 API Key 加密存储**
   - 使用 AES-256-CBC 加密
   - 预计工作量: 4-6 小时

3. **强制 HTTPS 验证**
   - 拒绝非 HTTPS 的 Base URL（除 localhost）
   - 预计工作量: 1 小时

4. **添加隐私声明**
   - 在设置面板添加明确的隐私提示
   - 创建 `docs/PRIVACY.md`
   - 预计工作量: 2 小时

### 🟡 中优先级 (1 个月内完成)

5. **改进错误日志**
   - 过滤 API Key 和敏感信息
   - 预计工作量: 2 小时

6. **添加请求超时**
   - 为所有 API 请求设置合理的超时时间
   - 预计工作量: 1 小时

7. **实现 API Key 掩码显示**
   - 在设置面板中显示 `sk-****1234` 格式
   - 预计工作量: 1 小时

8. **添加数据最小化功能**
   - 敏感信息过滤（电话、邮箱等）
   - 预计工作量: 4 小时

### 🟢 低优先级 (长期改进)

9. **实现 API Key 轮换机制**
   - 提醒用户定期更换 API Key
   - 预计工作量: 3 小时

10. **添加依赖审计到 CI/CD**
    - 自动化安全扫描
    - 预计工作量: 2 小时

11. **实现客户端速率限制**
    - 防止意外的 API 滥用
    - 预计工作量: 3 小时

---

## 📝 总结与建议

### 优势

1. ✅ **代码质量高**: 无明显的注入漏洞，输入验证充分
2. ✅ **本地优先**: 数据存储在本地 Vault，用户拥有完全控制权
3. ✅ **错误处理完善**: 提供清晰的错误提示和帮助信息
4. ✅ **支持本地模型**: 提供 Moonshine + Ollama 完全本地方案

### 主要风险

1. ⚠️ **API Key 明文存储**: 如果 Vault 同步到云端，API Key 可能泄漏
2. ⚠️ **依赖包漏洞**: esbuild 存在中等风险漏洞（仅影响开发环境）
3. ⚠️ **缺少隐私政策**: 未明确告知用户数据处理方式

### 最终建议

**对于开发者**:
- 优先实现 API Key 加密存储（高优先级 #2）
- 升级 esbuild 依赖（高优先级 #1）
- 添加隐私声明和用户同意流程（高优先级 #4）

**对于用户**:
- ✅ 如果关注隐私，使用 Moonshine + Ollama 本地方案
- ⚠️ 如果使用云端服务，避免将 Vault 同步到公共 Git 仓库
- ⚠️ 定期更换 API Key，避免长期使用同一密钥
- ✅ 定期清理旧录音文件，减少数据暴露风险

---

## 📚 参考资料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Obsidian Plugin Security Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [OpenAI API Security Best Practices](https://platform.openai.com/docs/guides/safety-best-practices)
- [GDPR Compliance Checklist](https://gdpr.eu/checklist/)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)

---

**报告生成时间**: 2026-03-12 16:00 CST  
**下次审计建议**: 2026-06-12 (3 个月后)

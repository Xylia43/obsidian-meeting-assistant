# Release Process

## 发布新版本

### 1. 准备发布

确保所有更改已提交并通过 CI：

```bash
git status
npm run lint
npm test
npm run build
```

### 2. 更新版本号

使用 npm version 命令自动更新版本：

```bash
# 补丁版本 (0.1.0 -> 0.1.1)
npm version patch

# 次版本 (0.1.0 -> 0.2.0)
npm version minor

# 主版本 (0.1.0 -> 1.0.0)
npm version major
```

这会自动：
- 更新 package.json
- 更新 manifest.json
- 更新 versions.json
- 创建 git commit

### 3. 推送并打 tag

```bash
git push
git push --tags
```

### 4. 自动发布

推送 tag 后，GitHub Actions 会自动：
- 运行测试和 lint
- 构建插件
- 创建 GitHub Release
- 上传 main.js、manifest.json、styles.css

### 5. 验证发布

访问 https://github.com/Xylia43/obsidian-meeting-assistant/releases 确认发布成功。

## 版本规范

遵循 [Semantic Versioning](https://semver.org/)：

- **MAJOR**: 不兼容的 API 变更
- **MINOR**: 向后兼容的功能新增
- **PATCH**: 向后兼容的问题修复

## Commit Message 规范

使用 Conventional Commits：

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试相关
chore: 构建/工具链
```

示例：
```
feat: 添加实时转写功能
fix: 修复录音停止时的崩溃问题
docs: 更新 README 安装说明
```

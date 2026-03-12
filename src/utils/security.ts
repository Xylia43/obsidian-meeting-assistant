/**
 * 安全工具类
 */

/**
 * 验证 URL 是否使用 HTTPS（localhost 除外）
 */
export function validateSecureUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    // localhost 和 127.0.0.1 允许 HTTP
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return { valid: true };
    }
    
    // 其他地址必须使用 HTTPS
    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: '出于安全考虑，远程服务必须使用 HTTPS 协议'
      };
    }
    
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: 'URL 格式无效'
    };
  }
}

/**
 * 掩码显示 API Key
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) {
    return '****';
  }
  return key.slice(0, 4) + '****' + key.slice(-4);
}

/**
 * 验证 API Key 格式（基本检查）
 */
export function validateApiKeyFormat(key: string): boolean {
  if (!key || key.trim().length === 0) {
    return false;
  }
  
  // 基本长度检查（大多数 API Key 至少 20 字符）
  if (key.length < 20) {
    return false;
  }
  
  // 不应包含空格
  if (key.includes(' ')) {
    return false;
  }
  
  return true;
}

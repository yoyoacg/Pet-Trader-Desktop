export async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const response = await window.desktop.request<T>(method, route, body);
  if (!response.ok) throw new Error(response.body?.error || `请求失败（HTTP ${response.status}）`);
  return response.body;
}

// 剥离 Electron IPC 包装与技术前缀，将底层网络报错转为清晰的中文提示。
export function formatError(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason ?? '发生未知错误');
  const cleaned = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^(?:[A-Za-z]*Error:\s*)+/, '')
    .trim();
  if (!cleaned) return '操作失败，请稍后重试';
  if (/^(?:fetch failed|failed to fetch|networkerror)/i.test(cleaned)) {
    return '网络连接失败，请检查网络或服务状态后重试';
  }
  if (/(?:aborterror|timeouterror|timed out|timeout)/i.test(cleaned)) {
    return '请求超时，请稍后重试';
  }
  return cleaned;
}

export const money = (cents: number) => (cents / 100).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});

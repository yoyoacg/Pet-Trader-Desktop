export async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const response = await window.desktop.request<T>(method, route, body);
  if (!response.ok) throw new Error(`${method} ${route}：${response.body.error}（HTTP ${response.status}）`);
  return response.body;
}

export const money = (cents: number) => (cents / 100).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});

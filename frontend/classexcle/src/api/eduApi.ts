import axios from 'axios';
import type { InitResponse, LoginRequest, ApiResponse, ScheduleEntry } from './type';

const BACKEND_BASE = 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: BACKEND_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// 初始化会话
export async function initSession(): Promise<string> {
  const res = await apiClient.get<InitResponse>('/api/init');
  return res.data.sessionId;
}

// 获取验证码图片的 URL（需要动态拼接 sessionId 和时间戳）
export function getCaptchaUrl(sessionId: string): string {
  return `${BACKEND_BASE}/api/captcha?sessionId=${sessionId}&_=${Math.random()}`;
}

// 登录并获取课表
export async function login(
  sessionId: string,
  username: string,
  password: string,
  captcha: string
): Promise<{ success: boolean; schedule?: ScheduleEntry[]; error?: string }> {
  const payload: LoginRequest = { sessionId, username, password, captcha };
  const res = await apiClient.post<ApiResponse<ScheduleEntry[]>>('/api/login', payload);
  if (res.data.success) {
    return { success: true, schedule: res.data.schedule };
  } else {
    return { success: false, error: res.data.error || '登录失败' };
  }
}
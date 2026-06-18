// 后端返回的通用响应格式
export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  schedule?: T;
}

export interface InitResponse {
  sessionId: string;
}

// 课表的一行（单元格数组）
export type CourseRow = string[];

// 登录请求体
export interface LoginRequest {
  sessionId: string;
  username: string;
  password: string;
  captcha: string;
}

export interface CourseData {
  weekday: string;
  period: string;
  courseName: string;
  teacher: string;
  weeks: number[];
  classroom: string;
}

export interface PracticeData {
  type: 'practice';
  content: string;
}

export type ScheduleEntry = CourseData | PracticeData;
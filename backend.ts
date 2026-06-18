import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import qs from 'qs';
import * as cheerio from 'cheerio';
import { createWorker, PSM, Worker } from 'tesseract.js';

const app = express();
app.use(cors());
app.use(express.json());

// ---------- 全局会话存储 ----------
interface SessionData {
  client: AxiosInstance;
  createdAt: number;
}

const sessionStore = new Map<string, SessionData>();

// 清理过期会话（可选，每30分钟）
setInterval(() => {
  const now = Date.now();
  for (const [sid, { createdAt }] of sessionStore.entries()) {
    if (now - createdAt > 30 * 60 * 1000) sessionStore.delete(sid);
  }
}, 30 * 60 * 1000);

// ---------- OCR 引擎 ----------
let ocrWorker: Worker | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorker) {
    ocrWorker = await createWorker('eng');
    await ocrWorker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
    console.log('OCR worker initialized');
  }
  return ocrWorker;
}

// ---------- 辅助函数 ----------
function createClient(): AxiosInstance {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    baseURL: 'http://newjwxt.bjfu.edu.cn',
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  }));
  return client;
}

// 加密算法（完全复现前端）
function encodeCredentials(userAccount: string, password: string, scode: string, sxh: string): string {
  const code = `${userAccount}%%%${password}`;
  let encoded = '';
  let remainingScode = scode;
  const sxhStr = sxh;
  for (let i = 0; i < code.length; i++) {
    if (i < 20 && i < sxhStr.length) {
      const insertLen = parseInt(sxhStr.charAt(i));
      if (insertLen > 0 && remainingScode.length >= insertLen) {
        const insertChars = remainingScode.substring(0, insertLen);
        remainingScode = remainingScode.substring(insertLen);
        encoded += code.charAt(i) + insertChars;
      } else {
        encoded += code.charAt(i);
      }
    } else {
      encoded += code.substring(i);
      break;
    }
  }
  return encoded;
}

interface ScodeSxhResult {
  scode: string;
  sxh: string;
}

// 获取 scode / sxh
async function getScodeAndSxh(client: AxiosInstance): Promise<ScodeSxhResult> {
  const url = '/Logon.do?method=logon&flag=sess';
  const res = await client.post(url);
  const text = String(res.data).trim();
  if (text === 'no') throw new Error('获取 scode/sxh 失败');
  const [scode, sxh] = text.split('#');
  if (!scode || !sxh) throw new Error(`返回格式异常: ${text}`);
  return { scode, sxh };
}

interface LoginResult {
  success: boolean;
  error?: string;
}

// 执行登录（核心）
async function doLogin(client: AxiosInstance, username: string, password: string, captcha: string): Promise<LoginResult> {
  const { scode, sxh } = await getScodeAndSxh(client);
  const encoded = encodeCredentials(username, password, scode, sxh);
  const postData = {
    useDogCode: '',
    encoded,
    RANDOMCODE: captcha,
  };
  const loginRes = await client.post('/Logon.do?method=logon', qs.stringify(postData), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const axiosRequest = loginRes.request as { res?: { responseUrl?: string } } | undefined;
  const finalUrl = axiosRequest?.res?.responseUrl || loginRes.config.url || '';
  if (finalUrl.includes('xsMain.jsp') || String(loginRes.data).includes('xsMain')) {
    return { success: true };
  } else {
    const dataStr = String(loginRes.data);
    const errorMatch = dataStr.match(/验证码无效|用户名或密码错误|alert\('([^']+)'\)/);
    const errorMsg = errorMatch ? (errorMatch[1] || errorMatch[0]) : '登录失败';
    return { success: false, error: errorMsg };
  }
}

interface CourseData {
  weekday: string;
  period: string;
  courseName: string;
  teacher: string;
  weeks: number[];
  classroom: string;
}

interface PracticeData {
  type: 'practice';
  content: string;
}

type ScheduleEntry = CourseData | PracticeData;

// 获取课表（解析为 JSON）
async function fetchScheduleJSON(client: AxiosInstance): Promise<ScheduleEntry[]> {
  const res = await client.get('/jsxsd/xskb/xskb_list.do', {
    params: { Ves632DSdyV: 'NEW_XSD_PYGL' }
  });
  return extractScheduleFromHtml(String(res.data));
}

/**
 * 从课表 HTML 中提取结构化课程数据
 */
function extractScheduleFromHtml(html: string): ScheduleEntry[] {
  const $ = cheerio.load(html);
  const table = $('#kbtable');
  if (!table.length) return [];

  const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  const periods = ['12节', '34节', '5节', '67节', '89节', '1011节', '12节'];
  const periodLabels = ['1-2节', '3-4节', '5节', '6-7节', '8-9节', '10-11节', '12节'];
  let periodCount = 0;
  const schedule: ScheduleEntry[] = [];

  table.find('tr').each((rowIdx, row) => {
    const $row = $(row);
    const periodTh = $row.find('th').first();
    let periodText = periodTh.text().trim();

    // 实验实习安排
    if (periodText.includes('实验实习安排')) {
      const practiceTd = $row.find('td').first();
      if (practiceTd.length) {
        schedule.push({
          type: 'practice',
          content: practiceTd.text().trim()
        });
      }
      return;
    }

    if (!periods.includes(periodText)) return;

    const currentPeriod = periodLabels[periodCount] || periodText;
    periodCount++;

    const $cells = $row.find('td');
    if ($cells.length < 7) return;

    $cells.each((colIdx, cell) => {
      const $cell = $(cell);
      let $detail = $cell.find('.kbcontent').first();
      if (!$detail.length) $detail = $cell.find('.kbcontent1').first();
      if (!$detail.length) return;

      const rawHtml = $detail.html();
      if (!rawHtml || rawHtml.trim() === '&nbsp;') return;

      const courseBlocks = rawHtml.split(/-{10,}\s*<br\s*\/?\s*>/i);
      courseBlocks.forEach(block => {
        if (!block.trim()) return;

        const $block = cheerio.load(block);
        let courseName = '';
        const firstBr = block.indexOf('<br');
        if (firstBr !== -1) {
          courseName = block.substring(0, firstBr).trim();
        } else {
          courseName = $block.root().text().trim().split('\n')[0];
        }
        if (!courseName) return;

        const teacher = $block('font[title="老师"]').text().trim();
        const weeks:number[] = $block('font[title="周次(节次)"]').text().trim()
        .replace("(周)", "")
        .split(",")
        .map((day) => {
          if (day.includes("-")) {
            const StartAndEnd:number[] = day.split("-").map((str) => parseInt(str));
            const DetailedDate:number[] = [];
            for (let i = StartAndEnd[0]; i <= StartAndEnd[1]; i++) {
              DetailedDate.push(i);
            }
            return DetailedDate;
          } else {
            return day;
          }
        })
        .flat()
        .map((e) => {
          if (typeof e === 'string') {
            return parseInt(e);
          }

          return e;
        });

        const classroom = $block('font[title="教室"]').text().trim();

        schedule.push({
          weekday: weekdays[colIdx],
          period: currentPeriod,
          courseName,
          teacher,
          weeks,
          classroom
        });
      });
    });
  });

  console.log(schedule);

  return schedule;
}

// ---------- API 路由 ----------
// 1. 初始化会话
app.get('/api/init', async (_req: Request, res: Response) => {
  const sessionId = uuidv4();
  const client = createClient();
  await client.get('/');
  sessionStore.set(sessionId, { client, createdAt: Date.now() });
  res.json({ sessionId });
});

// 2. 获取验证码图片
app.get('/api/captcha', async (req: Request, res: Response) => {
  const { sessionId } = req.query;
  if (!sessionId || !sessionStore.has(String(sessionId))) {
    res.status(400).json({ error: '无效或已过期的 sessionId' });
    return;
  }
  const session = sessionStore.get(String(sessionId))!;
  try {
    const captchaRes = await session.client.get(`/verifycode.servlet?t=${Math.random()}`, {
      responseType: 'arraybuffer'
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(captchaRes.data);
  } catch {
    res.status(500).json({ error: '获取验证码失败' });
  }
});

// 3. 登录并返回课表
app.post('/api/login', async (req: Request, res: Response) => {
  const { sessionId, username, password, captcha } = req.body;
  if (!sessionId || !sessionStore.has(sessionId)) {
    res.status(400).json({ error: '无效或已过期的 sessionId' });
    return;
  }
  const session = sessionStore.get(sessionId)!;
  try {
    const loginResult = await doLogin(session.client, username, password, captcha);
    if (!loginResult.success) {
      res.status(401).json({ success: false, error: loginResult.error });
      return;
    }
    const schedule = await fetchScheduleJSON(session.client);
    res.json({ success: true, schedule });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 4. OCR 识别验证码
app.post('/api/recognize', async (req: Request, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) {
      res.status(400).json({ error: '缺少图片数据' });
      return;
    }
    const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const worker = await getOcrWorker();
    const { data: { text } } = await worker.recognize(buffer);
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '');
    res.json({ text: cleaned });
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ error: 'OCR识别失败' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`后端服务运行在 http://localhost:${PORT}`));

const axios = require('axios');
const qs = require('qs');
const fs = require('fs');
const readline = require('readline');

// ========== 配置 ==========
const USERNAME = '241002309';
const PASSWORD = 'A1s2d3f4!';
const BASE_URL = 'http://newjwxt.bjfu.edu.cn';
// ==========================

const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const jar = new CookieJar();
const client = wrapper(axios.create({
  baseURL: BASE_URL,
  jar: jar,          // 关键：使用 cookie jar
  withCredentials: true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }
}));

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

// ----------------- 加密算法（完全复现前端） -----------------
function encodeCredentials(userAccount, password, scode, sxh) {
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

// ----------------- 获取加密参数 scode/sxh -----------------
async function getScodeAndSxh() {
  const url = '/Logon.do?method=logon&flag=sess';
  const cookieString = await jar.getCookieString(BASE_URL);
  console.log('当前 Cookie:', cookieString);
  const res = await client.post(url);
  const text = res.data.trim();
  if (text === 'no') throw new Error('获取 scode/sxh 失败');
  const [scode, sxh] = text.split('#');
  if (!scode || !sxh) throw new Error(`返回格式异常: ${text}`);
  console.log(`[加密] scode 长度 ${scode.length}, sxh = ${sxh}`);
  return { scode, sxh };
}

// ----------------- 获取验证码（手动输入） -----------------
async function getCaptcha() {
  // 重要：先访问一次登录页建立会话（获取 JSESSIONID）
  await client.get('/');
  const cookieString = await jar.getCookieString(BASE_URL);
  console.log('当前 Cookie:', cookieString);
  const captchaUrl = `/verifycode.servlet?t=${Math.random()}`;
  const res = await client.get(captchaUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync('./captcha.png', Buffer.from(res.data, 'binary'));
  console.log('验证码图片已保存为 captcha.png');
  const code = await askQuestion('请输入验证码: ');
  return code.trim();
}

// ----------------- 执行登录（只提交三个字段） -----------------
async function login() {
  // 1. 建立会话并获取验证码
  console.log('[1] 获取验证码...');
  const captcha = await getCaptcha();

  // 2. 获取加密参数
  console.log('[2] 获取加密参数 scode/sxh...');
  const { scode, sxh } = await getScodeAndSxh();

  // 3. 生成 encoded
  const encoded = encodeCredentials(USERNAME, PASSWORD, scode, sxh);
  console.log(`[3] 生成 encoded: ${encoded.substring(0, 50)}...`);

  // 4. 构造 POST 数据（只提交三个字段，与 HAR 完全一致）
  const postData = {
    useDogCode: '',          // 空字符串
    encoded: encoded,
    RANDOMCODE: captcha,
  };

  // 5. 提交登录
  const loginUrl = '/Logon.do?method=logon';
  console.log('[4] 提交登录...');
  const loginRes = await client.post(loginUrl, qs.stringify(postData), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  // 6. 检查是否登录成功（302 重定向到带 ticket 的 URL 或 xsMain.jsp）
  const finalUrl = loginRes.request.res.responseUrl || loginRes.config.url;
  console.log(`[5] 最终地址: ${finalUrl}`);
  if (finalUrl.includes('xsMain.jsp') || loginRes.data.includes('xsMain')) {
    console.log('[✓] 登录成功！');
    return true;
  } else {
    // 提取错误信息（可能返回登录页并显示错误）
    const errorMatch = loginRes.data.match(/验证码无效|用户名或密码错误|alert\('([^']+)'\)/);
    const errorMsg = errorMatch ? errorMatch[1] || errorMatch[0] : '未知错误';
    console.error(`[✗] 登录失败: ${errorMsg}`);
    fs.writeFileSync('./login_fail.html', loginRes.data);
    console.log('失败页面已保存为 login_fail.html');
    return false;
  }
}

// ----------------- 抓取课表（可选） -----------------
async function fetchSchedule() {
  console.log('[6] 获取课表...');
  const res = await client.get('/jsxsd/xskb/xskb_list.do', {
    params: { Ves632DSdyV: 'NEW_XSD_PYGL' }
  });
  fs.writeFileSync('./schedule.html', res.data);
  console.log('课表页面已保存为 schedule.html');
  // 简单解析（需要安装 cheerio）
  try {
    const cheerio = require('cheerio');
    const $ = cheerio.load(res.data);
    const table = $('table.kbcontent').first();
    if (table.length) {
      console.log('\n====== 课表预览 ======');
      table.find('tr').each((i, row) => {
        const cells = $(row).find('td, th').map((_, cell) => $(cell).text().trim()).get();
        if (cells.length) console.log(cells.join(' | '));
      });
    } else {
      console.log('未找到课表表格，请检查 schedule.html');
    }
  } catch (e) {
    console.log('需安装 cheerio 以解析课表: npm install cheerio');
  }
}

// ----------------- 主函数 -----------------
(async () => {
  try {
    const success = await login();
    if (success) {
      await fetchSchedule();
    }
  } catch (err) {
    console.error('发生错误:', err.message);
    if (err.response) console.error('状态码:', err.response.status);
  }
})();
<script setup lang="ts">
import { inject, ref, computed, onMounted, type Ref } from 'vue';
import type { ScheduleEntry, CourseData, PracticeData } from '../../api/type';
import { initSession, getCaptchaUrl, login } from '../../api/eduApi';
import { useRouter } from 'vue-router';

const router = useRouter();
const excleRef = inject<Ref<ScheduleEntry[]>>('classexcle', ref([]));

const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const periods = ['1-2节', '3-4节', '5节', '6-7节', '8-9节', '10-11节', '12节'];

const currentWeek = ref(1);
const WeekToChange = ref(1);
const refreshing = ref(false);
const refreshMsg = ref('');

function changeWeek(e?: Event) {
  e?.preventDefault();
  const val = Number(WeekToChange.value);
  if (val > 0 && val <= 20 && val % 1 === 0) {
      currentWeek.value = val;
  } else {
    alert("请输入1-20之间的整数")
  }
}

async function tryAutoRefresh() {
  let credRaw: string | null = null;
  try { credRaw = localStorage.getItem('bjfu_credentials'); } catch {}
  if (!credRaw) return;
  let cred: { username?: string; password?: string } = {};
  try { cred = JSON.parse(credRaw); } catch { return; }
  if (!cred.username || !cred.password) return;

  refreshing.value = true;
  refreshMsg.value = '正在自动刷新课表...';

  try {
    refreshMsg.value = '初始化会话...';
    const sid = await initSession();

    refreshMsg.value = '获取验证码...';
    const captchaUrl = getCaptchaUrl(sid);
    const imgResp = await fetch(captchaUrl);
    const blob = await imgResp.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    refreshMsg.value = '识别验证码...';
    const ocrResp = await fetch('http://localhost:3000/api/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
    });
    const ocrData = await ocrResp.json();
    const captcha = ocrData.text || '';
    if (!captcha) {
      refreshMsg.value = '验证码识别失败，请手动登录刷新';
      return;
    }

    refreshMsg.value = '登录中...';
    const loginResp = await login(sid, cred.username, cred.password, captcha);
    if (!loginResp.success || !loginResp.schedule) {
      refreshMsg.value = '自动登录失败，请手动登录刷新';
      return;
    }

    excleRef.value = loginResp.schedule;
    localStorage.setItem('bjfu_schedule', JSON.stringify(loginResp.schedule));
    refreshMsg.value = '课表已更新';
    setTimeout(() => { refreshMsg.value = ''; }, 2000);
  } catch (err: any) {
    console.error('Auto refresh failed:', err);
    refreshMsg.value = '自动刷新失败，请手动登录';
  } finally {
    refreshing.value = false;
  }
}

onMounted(() => {
  tryAutoRefresh();
});

const totalWeeks = computed(() => {
  let max = 0;
  for (const e of excleRef.value) {
    if (!('type' in e && e.type === 'practice')) {
      for (const w of e.weeks) {
        if (w > max) max = w;
      }
    }
  }
  return Math.max(max, 20);
});

const courses = computed<CourseData[]>(() =>
  excleRef.value.filter((e): e is CourseData => !('type' in e && e.type === 'practice'))
);

const practices = computed<PracticeData[]>(() =>
  excleRef.value.filter((e): e is PracticeData => 'type' in e && e.type === 'practice')
);

const grid = computed(() => {
  const map: Record<string, Record<string, CourseData[]>> = {};
  for (const p of periods) {
    map[p] = {};
    for (const w of weekdays) {
      map[p][w] = [];
    }
  }
  for (const c of courses.value) {
    if (c.weeks.includes(currentWeek.value) && map[c.period]?.[c.weekday]) {
      map[c.period][c.weekday].push(c);
    }
  }
  return map;
});
</script>

<template>
  <div class="schedule-container">
    <div class="header-row">
      <h2>课程表</h2>
      <div class="header-actions">
        <span v-if="refreshMsg" class="refresh-msg" :class="{ error: refreshMsg.includes('失败') }">{{ refreshMsg }}</span>
        <button class="refresh-btn" :disabled="refreshing" @click="tryAutoRefresh">
          {{ refreshing ? '刷新中...' : '🔄 刷新课表' }}
        </button>
        <button class="login-btn" @click="router.push('/')">登录页</button>
      </div>
    </div>

    <!-- 实践/实验安排 -->
    <div v-if="practices.length" class="practice-section">
      <h3>实验实习安排</h3>
      <div v-for="(p, i) in practices" :key="i" class="practice-item">
        {{ p.content }}
      </div>
    </div>

    <!-- 课表表格 -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="period-col"></th>
            <th v-for="w in weekdays" :key="w">{{ w }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in periods" :key="p">
            <td class="period-label">{{ p }}</td>
            <td
              v-for="w in weekdays"
              :key="w"
              class="cell"
            >
              <div
                v-for="(c, idx) in grid[p][w]"
                :key="idx"
                class="course-block"
              >
                <div class="course-name">{{ c.courseName }}</div>
                <div class="course-info">{{ c.teacher }}</div>
                <div class="course-info">{{ c.classroom }}</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="courses.length === 0" class="empty-tip">
      暂无课表数据，请先登录获取。
    </div>

    <div class="fixed-spacer"></div>

    <div class="week-input-form">
      <div class="week-nav">
        <button @click="currentWeek = Math.max(1, currentWeek - 1)">◀</button>
        <span class="week-label">第 {{ currentWeek }} 周</span>
        <button @click="currentWeek = Math.min(totalWeeks, currentWeek + 1)">▶</button>
      </div>
      <form @submit.prevent="changeWeek">
        <input v-model.number="WeekToChange" placeholder="跳转..." type="number">
        <button type="submit">GO</button>
      </form>
    </div>


  </div>
</template>

<style scoped>
.schedule-container {
  padding: 12px;
  width: 100%;
  box-sizing: border-box;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.refresh-msg {
  font-size: 12px;
  color: #2e7d32;
}
.refresh-msg.error {
  color: #c62828;
}

.refresh-btn, .login-btn {
  padding: 4px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.refresh-btn:hover, .login-btn:hover {
  background: #e3f2fd;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

h2 {
  margin: 0;
  font-size: 18px;
  color: #333;
  white-space: nowrap;
}

.week-selector {
  display: none;
}

.week-input-form {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 12px 8px;
  background: #fff;
  border-top: 1px solid #eee;
  z-index: 100;
}

.week-input-form form {
  display: flex;
  align-items: center;
  gap: 4px;
}

.week-input-form form input {
  width: 48px;
  padding: 4px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}

.week-input-form form button {
  background: #1976d2;
  color: #fff;
  border-color: #1976d2;
  font-size: 12px;
  padding: 4px 8px;
}

.week-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.week-nav button {
  padding: 5px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  min-width: 32px;
}

.week-label {
  font-size: 14px;
  font-weight: 600;
  min-width: 70px;
  text-align: center;
}

.week-selector button {
  padding: 6px 14px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  min-width: 36px;
}

.week-selector button:hover {
  background: #e3f2fd;
}

.week-selector span {
  font-size: 15px;
  font-weight: 600;
  min-width: 70px;
  text-align: center;
}

.practice-section {
  margin-bottom: 16px;
  padding: 10px 12px;
  background: #fff3e0;
  border-radius: 6px;
}

.practice-section h3 {
  margin: 0 0 6px;
  font-size: 13px;
  color: #e65100;
}

.practice-item {
  font-size: 12px;
  color: #555;
  line-height: 1.5;
}

.table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

table {
  table-layout: fixed;
  border-collapse: collapse;
  width: 100%;
}

th, td {
  border: 1px solid #ddd;
  padding: 4px 2px;
  text-align: center;
  vertical-align: top;
}

th {
  background: #f5f5f5;
  font-weight: 600;
  font-size: 12px;
  color: #444;
}

.period-col {
  width: 5vw;
}

.period-label {
  background: #f5f5f5;
  font-weight: 600;
  font-size: 10px;
  color: #666;
  width: 5vw;
}

  .cell {
    height: 10vh;
  }

.course-block {
  background: #e3f2fd;
  border-radius: 3px;
  padding: 2px 3px;
  margin-bottom: 2px;
  font-size: 10px;
  line-height: 1.3;
  overflow: hidden;
  height: 100%;
}

.course-block:last-child {
  margin-bottom: 0;
}

.course-name {
  font-weight: 600;
  color: #1565c0;
  word-break: break-all;
}

.course-info {
  color: #555;
  word-break: break-all;
}

.course-info {
  color: #555;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}

.empty-tip {
  text-align: center;
  color: #999;
  margin-top: 40px;
  font-size: 14px;
}

.fixed-spacer {
  height: 80px;
}

.week-input-form {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 0;
  background: #fff;
  border-top: 1px solid #eee;
  z-index: 100;
}

.week-input-form input {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  text-align: center;
}

.week-input-form button {
  padding: 6px 14px;
  border: 1px solid #1976d2;
  border-radius: 4px;
  background: #1976d2;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}

@media (max-width: 600px) {
  .table-wrapper {
    max-width: 100vw;
  }

  .schedule-container {
    padding: 8px;
  }

  .header-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .header-actions {
    margin-left: 0;
    width: 100%;
    flex-wrap: wrap;
  }

  h2 {
    font-size: 16px;
  }

  th, td {
    padding: 2px 1px;
    width: 5%;
  }

  th {
    font-size: 9px;
  }

  .period-col {
    width: 2%;
  }

  .period-label {
    font-size: 9px;
    width: 26px;
    height: 12vh;
  }

  .cell {
    width: 10%;
  }

  .course-block {
    padding: 1px 2px;
    font-size: 8px;
    line-height: 1.2;
  }

  .refresh-msg {
    font-size: 11px;
  }

  .refresh-btn, .login-btn {
    font-size: 11px;
    padding: 4px 8px;
  }
}
</style>

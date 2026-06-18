<script setup lang="ts">
import { inject, ref, computed, type Ref } from 'vue';
import type { ScheduleEntry, CourseData, PracticeData } from '../../api/type';

const excleRef = inject<Ref<ScheduleEntry[]>>('classexcle', ref([]));

const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const periods = ['1-2节', '3-4节', '5节', '6-7节', '8-9节', '10-11节', '12节'];

const currentWeek = ref(1);
const WeekToChange = ref(1);

function changeWeek(e?: Event) {
  e?.preventDefault();
  const val = Number(WeekToChange.value);
  if (val > 0 && val <= 20 && val % 1 === 0) {
      currentWeek.value = val;
  } else {
    alert("请输入1-20之间的整数")
  }
}

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
    <h2>课程表</h2>

    <!-- 周次选择器 -->
    <div class="week-selector">
      <button @click="currentWeek = Math.max(1, currentWeek - 1)">◀</button>
      <span>第 {{ currentWeek }} 周</span>
      <button @click="currentWeek = Math.min(totalWeeks, currentWeek + 1)">▶</button>
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

    <form @submit.prevent="changeWeek">
      <input v-model.number="WeekToChange" placeholder="输入周数..." type="number">
      <button type="submit">确认</button>
    </form>
  </div>
</template>

<style scoped>
.schedule-container {
  padding: 16px;
}

h2 {
  margin-bottom: 12px;
  color: #333;
}

.week-selector {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.week-selector button {
  padding: 4px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}

.week-selector button:hover {
  background: #e3f2fd;
}

.week-selector span {
  font-size: 16px;
  font-weight: 600;
  min-width: 80px;
  text-align: center;
}

.practice-section {
  margin-bottom: 20px;
  padding: 12px;
  background: #fff3e0;
  border-radius: 6px;
}

.practice-section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #e65100;
}

.practice-item {
  font-size: 13px;
  color: #555;
  line-height: 1.6;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  border-collapse: collapse;
  width: 100%;
  min-width: 900px;
}

th, td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
  vertical-align: top;
}

th {
  background: #f5f5f5;
  font-weight: 600;
  font-size: 13px;
  color: #444;
}

.period-col {
  width: 10cqw;
}

.period-label {
  background: #f5f5f5;
  font-weight: 600;
  font-size: 13px;
  color: #666;
  width: 60px;
}

.cell {
  min-width: 120px;
  min-height: 60px;
}

.course-block {
  background: #e3f2fd;
  border-radius: 4px;
  padding: 4px 6px;
  margin-bottom: 4px;
  font-size: 12px;
  line-height: 1.5;
}

.course-block:last-child {
  margin-bottom: 0;
}

.course-name {
  font-weight: 600;
  color: #1565c0;
}

.course-info {
  color: #555;
}

.empty-tip {
  text-align: center;
  color: #999;
  margin-top: 40px;
  font-size: 14px;
}
</style>

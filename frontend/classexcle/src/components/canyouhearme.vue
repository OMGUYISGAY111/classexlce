<template>
  <div class="login-container">
    <h2>教务系统登录</h2>
    <form @submit.prevent="handleLogin">
      <div class="form-group">
        <label>学号</label>
        <input type="text" v-model="username" placeholder="请输入学号" />
      </div>
      <div class="form-group">
        <label>密码</label>
        <div style="display: flex; gap: 8px;">
            <input :type="showPassword ? 'text' : 'password'" v-model="password" placeholder="请输入密码" />
            <button type="button" @click="showPassword = !showPassword">
            {{ showPassword ? '隐藏' : '显示' }}
            </button>
        </div>
      </div>
      <div class="form-group">
        <label>验证码</label>
        <div class="captcha-row">
          <input type="text" v-model="captcha" placeholder="请输入验证码" />
          <img ref="captchaImgRef" :src="captchaUrl" alt="验证码" @click="refreshCaptcha" class="captcha-img" />
          <button type="button" class="ocr-btn" @click="recognizeCaptcha" :disabled="ocrLoading">
            {{ ocrLoading ? '识别中...' : 'OCR识别' }}
          </button>
        </div>
      </div>
      <button type="submit" :disabled="loading">
        {{ loading ? '登录中...' : '登录' }}
      </button>
      <div class="remember-row">
        <input type="checkbox" id="remember" v-model="remember" style="width: auto;" />
        <label for="remember" style="display: inline; font-weight: normal;">记住学号和密码</label>
      </div>
    </form>

    <div v-if="result" class="result">
      <pre>{{ result }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, type Ref, inject } from 'vue';
import { initSession, getCaptchaUrl, login } from '../api/eduApi';
import type { CourseRow, ScheduleEntry } from '../api/type';
import { useRouter } from 'vue-router';

const username = ref('');
const password = ref('');
const captcha = ref('');
const sessionId = ref<string | null>(null);
const captchaUrl = ref('');
const loading = ref(false);
const result = ref('');
const remember = ref(true);
const ocrLoading = ref(false);
const captchaImgRef = ref<HTMLImageElement | null>(null);
const captchaBlob = ref<Blob | null>(null);
const excleRef = inject<Ref<ScheduleEntry[]>>('classexcle', ref([]));

function loadSavedCredentials() {
  try {
    const raw = localStorage.getItem('bjfu_credentials');
    if (raw) {
      const cred = JSON.parse(raw);
      if (cred.username) username.value = cred.username;
      if (cred.password) password.value = cred.password;
      return true;
    }
  } catch {}
  return false;
}

function saveCredentials() {
  if (remember.value && username.value && password.value) {
    localStorage.setItem('bjfu_credentials', JSON.stringify({
      username: username.value,
      password: password.value
    }));
  }
}

let showPassword:Ref<boolean> = ref(true);

const router = useRouter();

async function recognizeCaptcha() {
  if (!captchaBlob.value) {
    alert('请先加载验证码');
    return;
  }
  ocrLoading.value = true;
  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(captchaBlob.value!);
    });

    const resp = await fetch('http://localhost:3000/api/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
    });
    const data = await resp.json();
    if (data.text) {
      captcha.value = data.text;
    } else {
      alert('验证码识别失败，请手动输入');
    }
  } catch (err: any) {
    console.error('OCR failed:', err);
    alert('OCR识别出错，请手动输入验证码');
  } finally {
    ocrLoading.value = false;
  }
}

const jumpToExcle = () => {
  router.push('/excle');
}

// 刷新验证码
const refreshCaptcha = async () => {
  if (!sessionId.value) {
    await initSessionId();
    return;
  }
  const url = getCaptchaUrl(sessionId.value);
  try {
    const resp = await fetch(url);
    captchaBlob.value = await resp.blob();
    if (captchaUrl.value && captchaUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(captchaUrl.value);
    }
    captchaUrl.value = URL.createObjectURL(captchaBlob.value);
  } catch {
    captchaUrl.value = url;
  }
};

// 初始化会话
const initSessionId = async () => {
  try {
    const sid = await initSession();
    sessionId.value = sid;
    await refreshCaptcha();
  } catch (err) {
    console.error('初始化会话失败', err);
    result.value = '初始化失败，请刷新页面重试';
  }
};

// 登录逻辑
const handleLogin = async () => {
  if (!sessionId.value) {
    result.value = '会话未初始化，请刷新页面';
    return;
  }
  if (!username.value || !password.value || !captcha.value) {
    result.value = '请完整填写信息';
    return;
  }

  loading.value = true;
  result.value = '';
  try {
    const resp = await login(
      sessionId.value,
      username.value,
      password.value,
      captcha.value
    );
    if (resp.success && resp.schedule) {
      saveCredentials();
      const formatted = resp.schedule;
      excleRef.value = resp.schedule;
      localStorage.setItem('bjfu_schedule', JSON.stringify(resp.schedule));
      result.value = `登录成功！课表数据：\n${formatted}`;
      console.log(formatted);
      jumpToExcle();
    } else {
      result.value = `登录失败：${resp.error || '未知错误'}`;
      await refreshCaptcha();
      captcha.value = '';
    }
  } catch (err: any) {
    result.value = `请求失败：${err.message}`;
  } finally {
    loading.value = false;
  }
};

// 组件挂载时初始化
onMounted(() => {
  loadSavedCredentials();
  initSessionId();
});
</script>

<style scoped>
.login-container {
  max-width: 400px;
  margin: 2rem auto;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
}
.form-group {
  margin-bottom: 1rem;
}
label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: bold;
}
input {
  width: 100%;
  padding: 0.5rem;
  box-sizing: border-box;
}
.captcha-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.captcha-img {
  height: 40px;
  cursor: pointer;
  border: 1px solid #ccc;
}
.ocr-btn {
  width: auto !important;
  padding: 0.25rem 0.75rem !important;
  font-size: 0.85rem;
  white-space: nowrap;
  background-color: #4caf50 !important;
}
button {
  width: 100%;
  padding: 0.5rem;
  background-color: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
button:disabled {
  background-color: #aaa;
}
.result {
  margin-top: 1rem;
  background: #f5f5f5;
  padding: 0.5rem;
  border-radius: 4px;
  white-space: pre-wrap;
  font-size: 0.9rem;
}
.remember-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0.5rem;
}
</style>
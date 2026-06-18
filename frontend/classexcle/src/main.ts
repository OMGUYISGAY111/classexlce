import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import route from './components/routers/indexs/index.ts';

const app = createApp(App);
app.use(route);
app.mount('#app');

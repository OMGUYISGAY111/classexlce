import { createRouter, createWebHashHistory } from "vue-router";
import Canyouhearme from "../../canyouhearme.vue";


const route = createRouter({
    history: createWebHashHistory(),
    routes: [
        {path: '/', component: Canyouhearme},
        {path: '/excle', component: () => import('../../excle/excle.vue')}
    ]
})

export default route;
<script setup lang="ts">
import { provide, ref } from 'vue';
import type { ScheduleEntry } from './api/type.ts';

const STORAGE_KEY = 'bjfu_schedule';

function loadFromStorage(): ScheduleEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

const ClassEntryDatas = ref<ScheduleEntry[]>(loadFromStorage());
provide("classexcle", ClassEntryDatas);

</script>

<template>
  <RouterView></RouterView>
</template>

<style>
* {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
</style>
<script setup>
import TopNav from './components/TopNav.vue';
</script>

<template>
  <TopNav />
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

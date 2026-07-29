<script setup lang="ts">
import { ref } from 'vue';
import InterestZones from './components/InterestZones.vue';
import CaliforniaTrades from './components/CaliforniaTrades.vue';

const activeTab = ref<'interest' | 'trades'>('interest');
</script>

<template>
  <div class="app-container">
    <!-- Floating Pill Tab Navigation -->
    <nav class="floating-tabs-nav">
      <button class="tab-pill-btn" :class="{ active: activeTab === 'interest' }" @click="activeTab = 'interest'">
        📍 Interest Points & Zones
      </button>
      <button class="tab-pill-btn" :class="{ active: activeTab === 'trades' }" @click="activeTab = 'trades'">
        🚢 California Trades
      </button>
    </nav>

    <!-- Active Tab Component (v-if manages fresh clean mounts and unmounts to prevent Leaflet conflicts) -->
    <div class="tab-content-container">
      <InterestZones v-if="activeTab === 'interest'" />
      <CaliforniaTrades v-else />
    </div>
  </div>
</template>

<style>
@import "./App.css";

.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.tab-content-container {
  width: 100%;
  height: 100%;
}
</style>

<script setup lang="ts">
import { ref } from 'vue';
import CaliforniaTrades from './components/CaliforniaTrades.vue';

const activeTab = ref<'sources' | 'uses'>('sources');
</script>

<template>
  <div class="app-container">
    <!-- Floating Pill Tab Navigation -->
    <nav class="floating-tabs-nav">
      <button class="tab-pill-btn" :class="{ active: activeTab === 'sources' }" @click="activeTab = 'sources'">
        ⚡ Energy Sources
      </button>
      <button class="tab-pill-btn" :class="{ active: activeTab === 'uses' }" @click="activeTab = 'uses'">
        🏭 Energy Uses
      </button>
    </nav>

    <!-- Active Tab Component -->
    <div class="tab-content-container">
      <CaliforniaTrades 
        v-if="activeTab === 'sources'" 
        key="sources"
        dataSource="https://docs.google.com/spreadsheets/d/1oJoqz6jeqosqrdmpV-xmdahXt7c33hF3JygEKmF1uNA/export?format=xlsx"
        title="Energy Sources"
      />
      <CaliforniaTrades 
        v-else 
        key="uses"
        dataSource="https://docs.google.com/spreadsheets/d/1rYqMxqs9HRAnR76y_7wgg37UDHAlLTCB7wxeUm1m4uU/export?format=xlsx"
        title="Energy Uses"
      />
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

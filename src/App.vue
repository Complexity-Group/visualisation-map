<script setup lang="ts">
/**
 * App.vue - Root Container Component for Map Visualisation Application
 * 
 * Manages top-level state for switching between the two primary trade/energy datasets:
 * - "Energy Sources" (Imports into California)
 * - "Energy Uses" (Exports from California)
 */

import { ref } from 'vue';
import CaliforniaTrades from './components/CaliforniaTrades.vue';

// Active dataset view tab selection ('sources' | 'sources-no-food' | 'uses')
const activeTab = ref<'sources' | 'sources-no-food' | 'uses'>('sources');
</script>

<template>
  <div class="app-container">
    <!-- Active Tab Component Container -->
    <div class="tab-content-container">
      <!-- 1. Energy Sources Tab -->
      <CaliforniaTrades 
        v-if="activeTab === 'sources'" 
        key="sources"
        activeTab="sources"
        dataSource="https://docs.google.com/spreadsheets/d/1oJoqz6jeqosqrdmpV-xmdahXt7c33hF3JygEKmF1uNA/export?format=xlsx"
        title="Energy Sources"
        @switchTab="(tab) => activeTab = tab"
      />
      <!-- 2. Energy Sources w/out Food Tab -->
      <CaliforniaTrades 
        v-else-if="activeTab === 'sources-no-food'" 
        key="sources-no-food"
        activeTab="sources-no-food"
        dataSource="https://docs.google.com/spreadsheets/d/11ZViEDH8fEWB5QSJ4gkBNP7hBuBHTpBEYF6DclZurWE/export?format=xlsx"
        title="Energy Sources w/out Food"
        @switchTab="(tab) => activeTab = tab"
      />
      <!-- 3. Energy Uses Tab -->
      <CaliforniaTrades 
        v-else-if="activeTab === 'uses'" 
        key="uses"
        activeTab="uses"
        dataSource="https://docs.google.com/spreadsheets/d/1rYqMxqs9HRAnR76y_7wgg37UDHAlLTCB7wxeUm1m4uU/export?format=xlsx"
        title="Energy Uses"
        @switchTab="(tab) => activeTab = tab"
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


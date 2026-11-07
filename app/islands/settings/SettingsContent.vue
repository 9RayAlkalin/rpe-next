<script setup lang="ts">
import type { RpenSettingsField } from '../../bridge';

defineProps<{ fields: RpenSettingsField[] }>();
</script>

<template>
  <label v-for="field in fields" :key="field[0]" class="field" :data-rpen-field="field[0]">
    {{ field[1] }}
    <select v-if="field[2] === 'select'" :id="field[0]" :value="field[3]" :aria-label="field[1]" :data-rpen-field="field[0]">
      <option v-for="[value, label] in field[7]" :key="value" :value="value">{{ label }}</option>
    </select>
    <input v-else :id="field[0]" :type="field[2]" :data-rpen-field="field[0]" :aria-label="field[1]" :value="field[2] === 'checkbox' ? undefined : field[3]" :checked="field[2] === 'checkbox' ? Boolean(field[3]) : undefined" :min="field[4]" :max="field[5]" :step="field[6]">
  </label>
</template>

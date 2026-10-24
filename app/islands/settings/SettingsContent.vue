<script setup lang="ts">
import { ref } from 'vue';
import { DISPLAY_KEYS, SETTINGS_GROUPS, type SettingsField, type SettingsGroup } from './fields';

defineProps<{ close: () => void }>();

const fpsLimit = ref<HTMLInputElement | null>(null);
const fpsUnlimited = ref<HTMLInputElement | null>(null);
const fpsError = ref<HTMLParagraphElement | null>(null);

const FPS_ERROR = '帧率上限必须是大于 10 的有限数字';

function commitDisplay(key: string, event: Event) {
  const control = event.target as HTMLInputElement | null;
  if (control) window.rpenSettingsBridge?.setDisplayField(key, control);
}

function handleInput(field: SettingsField, event: Event) {
  const key = DISPLAY_KEYS[field[0]];
  if (key && field[2] !== 'number') commitDisplay(key, event);
}

function handleChange(field: SettingsField, event: Event) {
  const key = DISPLAY_KEYS[field[0]];
  if (key && field[2] === 'number') commitDisplay(key, event);
}

function commitFps() {
  const input = fpsLimit.value;
  if (!input) return;
  const unlimited = fpsUnlimited.value?.checked ?? true;
  input.disabled = unlimited;
  const outcome = window.rpenSettingsBridge?.validateFpsLimit(input.value, unlimited) ?? { valid: false, value: Number.NaN };
  input.setCustomValidity(outcome.valid ? '' : FPS_ERROR);
  if (fpsError.value) fpsError.value.hidden = outcome.valid;
  if (outcome.valid) window.rpenSettingsBridge?.commitFpsLimit(outcome.value);
}

function resetField(field: SettingsField) {
  const input = document.getElementById(field[0]) as HTMLInputElement | null;
  if (!input) return;
  if (input.type === 'checkbox') input.checked = Boolean(field[3]); else input.value = String(field[3]);
  input.dispatchEvent(new Event(input.type === 'number' ? 'change' : 'input', { bubbles: true }));
}

function restore(group: SettingsGroup) {
  if (!confirm(`确定将“${group.heading}”中的设置恢复为默认值吗？`)) return;
  for (const field of group.fields) resetField(field);
}

function restoreFps() {
  if (!confirm('确定将“帧率”中的设置恢复为默认值吗？')) return;
  if (fpsUnlimited.value) fpsUnlimited.value.checked = false;
  if (fpsLimit.value) fpsLimit.value.value = '120';
  commitFps();
}
</script>

<template>
  <h2>设置</h2>
  <div class="settings-body">
    <section id="editor-skin-settings"></section>
    <section id="note-skin-settings"></section>
    <section>
      <div class="settings-group-heading">
        <h3>帧率</h3>
        <button type="button" class="settings-reset" aria-label="恢复“帧率”默认设置" @click="restoreFps">恢复默认</button>
      </div>
      <label class="field" data-rpen-field="fps-unlimited">无上限<input id="fps-unlimited" ref="fpsUnlimited" type="checkbox" checked data-rpen-field="fps-unlimited" aria-label="无上限" @change="commitFps"></label>
      <label class="field" data-rpen-field="fps-limit">帧率上限（FPS，大于 10）<input id="fps-limit" ref="fpsLimit" type="number" disabled min="10" step="any" value="120" data-rpen-field="fps-limit" aria-label="帧率上限（FPS，大于 10）" @input="commitFps"></label>
      <p id="fps-limit-error" ref="fpsError" class="hint" hidden role="status">请输入大于 10 的有限数字；无上限请勾选上方选项。</p>
      <p class="hint">实时生效并保存在本机。无上限表示编辑器不额外限帧；实际帧率仍受屏幕刷新率、浏览器、系统节能及性能影响。底栏显示实际绘制帧率，静止时按需绘制。</p>
    </section>
    <component :is="group.details ? 'details' : 'section'" v-for="group in SETTINGS_GROUPS" :key="group.heading" :id="group.id" :class="{ 'settings-group': !group.details }">
      <summary v-if="group.details">{{ group.heading }}</summary>
      <div v-else class="settings-group-heading">
        <h3>{{ group.heading }}</h3>
        <button type="button" class="settings-reset" :aria-label="`恢复“${group.heading}”默认设置`" @click="restore(group)">恢复默认</button>
      </div>
      <label v-for="field in group.fields" :key="field[0]" class="field" :data-rpen-field="field[0]">{{ field[1] }}<input :id="field[0]" :type="field[2]" :data-rpen-field="field[0]" :aria-label="field[1]" :value="field[2] === 'checkbox' ? undefined : field[3]" :checked="field[2] === 'checkbox' ? Boolean(field[3]) : undefined" :min="field[4]" :max="field[5]" :step="field[6]" @input="handleInput(field, $event)" @change="handleChange(field, $event)"></label>
      <p v-for="(hint, index) in group.hints" :key="index" class="hint">{{ hint }}</p>
      <button v-if="group.details" type="button" class="settings-reset settings-reset-detail" :aria-label="`恢复“${group.heading}”默认设置`" @click.stop.prevent="restore(group)">恢复默认</button>
    </component>
  </div>
  <div class="modal-actions">
    <button id="advanced-preferences">快捷键设置</button>
    <button @click="close()">完成</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { RpenModManagerDetail, RpenModManagerPayload, RpenModManagerSetting, RpenModManagerState } from '../../bridge';

const props = defineProps<{ payload: RpenModManagerPayload }>();

const banner = ref('模组可更改编辑器行为与谱面结构；启用前请保存谱面。');
const message = ref('内置模组和导入模组均需手动启用。启用状态与参数保存在本机。');
const cards = ref<RpenModManagerState['cards']>([]);
const detail = ref<RpenModManagerDetail | null>(null);
const protocol = ref(false);

const protocolExample = JSON.stringify({protocol:'rpen-mod',api:1,id:'example-mod',name:'示例',version:'1.0.0',author:'作者',description:'说明',entry:'main.mjs'},null,2)+'\n\nexport function activate(api) {\n  api.commands.register({ id: "hello", title: "问好", shortcut: "F7", run: () => api.notify("Hello") });\n  return () => {};\n}';
const docs: Array<[string, string]> = [
  ['下载完整协议', 'protocols/MOD-PROTOCOL.zh-CN.md'],
  ['下载全局事件协议', 'protocols/GLOBAL-EVENTS-PROTOCOL.zh-CN.md'],
  ['下载 API 声明', 'schemas/mod-api-v1.d.ts'],
  ['下载清单 Schema', 'schemas/mod-v1.schema.json'],
];

function render(state: RpenModManagerState) {
  cards.value = state.cards;
  detail.value = state.detail;
  protocol.value = false;
}
function setBanner(text: string) { banner.value = text; }
function setMessage(text: string) { message.value = text; }

async function save(setting: RpenModManagerSetting, value: unknown, control: HTMLInputElement | HTMLSelectElement) {
  if (!detail.value) return;
  const error = await props.payload.actions.saveSetting(detail.value.id, setting.key, value);
  control.setCustomValidity(error ?? '');
}

function shortcutKey(setting: RpenModManagerSetting, event: KeyboardEvent, control: HTMLInputElement) {
  event.preventDefault();
  event.stopPropagation();
  const value = event.key === 'Backspace' ? '' : props.payload.helpers.shortcutFromEvent(event);
  if (value === null) return;
  void save(setting, value, control);
  control.value = props.payload.helpers.formatShortcut(value);
}

defineExpose({ render, setBanner, setMessage });
</script>

<template>
  <div class="mod-manager-heading"><h2>模组管理器</h2><button type="button" @click="payload.actions.close()">关闭</button></div>
  <div class="mod-manager-toolbar">
    <button type="button" @click="payload.actions.pickPackage()">导入模组包</button>
    <button type="button" @click="payload.actions.pickDirectory()">导入文件夹</button>
    <button type="button" @click="payload.actions.disableAll()">禁用全部模组</button>
    <button type="button" @click="protocol = true">协议与 API</button>
  </div>
  <p class="hint">{{ banner }}</p>
  <div class="mod-manager-body">
    <div class="mod-manager-list" aria-label="已安装模组">
      <button v-for="record in cards" :key="record.id" type="button" class="mod-card" :data-mod-id="record.id" :aria-pressed="record.selected" @click="payload.actions.select(record.id)">
        <strong>{{ record.name }}</strong><span>{{ record.span }}</span><small>{{ record.status }}</small>
      </button>
    </div>
    <div class="mod-manager-details">
      <template v-if="protocol">
        <h3>模组协议 API 1</h3>
        <p>每个包包含 mod.json 和入口 ES 模块，入口导出 activate(api)。支持 package 内多文件导入、完整编辑器对象、提交谱面、事件钩子、界面挂载、预览叠加、快捷键与自动清理。</p>
        <p>模组运行于编辑器页面，没有权限沙箱。无法保证任意直接改写都可卸载还原；优先使用 api.patch / api.dispose，异常时禁用并重新载入。</p>
        <pre class="mod-source">{{ protocolExample }}</pre>
        <p class="hint">完整协议：protocols/MOD-PROTOCOL.zh-CN.md · API：window.rpenMods.editor · 恢复启动：?mods=off</p>
        <div class="mod-manager-toolbar">
          <button v-for="doc in docs" :key="doc[1]" type="button" @click="payload.actions.downloadDoc(doc[1])">{{ doc[0] }}</button>
        </div>
      </template>
      <template v-else-if="detail">
        <h3>{{ detail.name }}</h3>
        <p>{{ detail.description }}</p>
        <p class="hint">{{ detail.label }}</p>
        <div class="mod-manager-toolbar">
          <button type="button" :class="{ primary: !detail.active }" :disabled="detail.busy" @click="payload.actions.toggle(detail.id)">{{ detail.active ? '禁用模组' : '启用模组' }}</button>
          <button type="button" @click="payload.actions.export(detail.id)">导出模组</button>
          <button v-if="!detail.builtin" type="button" @click="payload.actions.remove(detail.id)">删除模组</button>
        </div>
        <pre v-if="detail.error" class="mod-error">{{ detail.error }}</pre>
        <p v-if="detail.dependencies" class="hint">{{ detail.dependencies }}</p>
        <p v-if="detail.conflicts" class="hint">{{ detail.conflicts }}</p>
        <button v-if="detail.settings.length" type="button" @click="payload.actions.resetSettings(detail.id)">恢复默认参数</button>
        <template v-for="setting in detail.settings" :key="setting.key">
          <label class="field">
            <span>{{ setting.label }}</span>
            <select v-if="setting.type === 'select'" :value="String(setting.value ?? '')" :data-mod-setting="setting.key" :aria-label="setting.label" @change="save(setting, ($event.target as HTMLSelectElement).value, $event.target as HTMLSelectElement)">
              <option v-for="option in setting.options" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <input v-else-if="setting.shortcut" type="text" readOnly :value="String(setting.value ?? '')" :data-mod-setting="setting.key" :aria-label="setting.label" title="点击后按下组合键，Backspace 清除" @keydown="shortcutKey(setting, $event as KeyboardEvent, $event.target as HTMLInputElement)" />
            <input v-else-if="setting.type === 'boolean'" type="checkbox" :checked="Boolean(setting.value)" :data-mod-setting="setting.key" :aria-label="setting.label" @change="save(setting, ($event.target as HTMLInputElement).checked, $event.target as HTMLInputElement)" />
            <input v-else :type="setting.type === 'number' ? 'number' : 'text'" :value="String(setting.value ?? '')" :min="setting.type === 'number' ? setting.min ?? undefined : undefined" :max="setting.type === 'number' ? setting.max ?? undefined : undefined" :step="setting.type === 'number' ? setting.step ?? 'any' : undefined" :data-mod-setting="setting.key" :aria-label="setting.label" @change="save(setting, setting.type === 'number' ? Number(($event.target as HTMLInputElement).value) : ($event.target as HTMLInputElement).value, $event.target as HTMLInputElement)" />
          </label>
          <p v-if="setting.description" class="hint">{{ setting.description }}</p>
        </template>
        <template v-if="detail.running">
          <template v-if="detail.commands.length">
            <h4>操作</h4>
            <button v-for="command in detail.commands" :key="command.id" type="button" @click="payload.actions.runCommand(detail.id, command.id)">{{ command.title }}</button>
          </template>
          <p class="hint">{{ detail.running }}</p>
        </template>
        <details><summary>包内文件与源码</summary><pre class="mod-source">{{ detail.source }}</pre></details>
      </template>
      <p v-else>尚无模组</p>
    </div>
  </div>
  <p class="hint" role="status">{{ message }}</p>
</template>

export type SettingsField = [
  id: string,
  text: string,
  type: 'range' | 'checkbox' | 'number' | 'color',
  value: number | boolean | string,
  minimum?: number,
  maximum?: number,
  step?: number | string,
];

export interface SettingsGroup {
  heading: string;
  fields: SettingsField[];
  hints?: string[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    heading: '显示与网格',
    fields: [
      ['bar-width', '节拍线宽度', 'range', 3, 0.5, 10, 0.1],
      ['bar-alpha', '节拍线亮度', 'range', 1, 0.1, 2, 0.05],
      ['judgement-offset', '底部判定线高度', 'range', 92, 42, 240, 1],
      ['event-value-size', '事件数值字号', 'range', 13, 8, 28, 1],
      ['event-value-threshold', '事件数值最小宽度', 'range', 30, 10, 180, 1],
      ['draw-event-curves', '绘制事件曲线', 'checkbox', true],
      ['event-curve-threshold', '事件曲线最小宽度', 'range', 24, 8, 180, 1],
      ['event-opacity', '事件条不透明度', 'range', 0.25, 0.05, 1, 0.05],
      ['event-bar-width', '事件条宽度比例', 'range', 0.82, 0.35, 1, 0.01],
      ['highlight-notes', '同时音符高亮', 'checkbox', true],
      ['seamless-events', '连续事件无接缝', 'checkbox', true],
      ['background-blur', '背景高斯模糊', 'range', 10.5, 0, 30, 0.5],
    ],
  },
  {
    heading: '音频与播放',
    fields: [
      ['volume', '音乐音量', 'range', 0.75, 0, 1, 0.01],
      ['hit-volume', '打击音效音量', 'range', 0.3, 0, 1, 0.01],
      ['hit-enabled', '启用打击音效', 'checkbox', true],
      ['autoplay-view', '进入预览自动播放', 'checkbox', true],
      ['scroll-speed', '滚轮时间调整速度', 'range', 5, 0.1, 100, 0.1],
      ['wheel-limit-audio-start', '滚轮调时不早于音频开头', 'checkbox', true],
    ],
    hints: ['默认最多退到音频 0 秒；谱面延迟可能使此处为负拍数。关闭限制后可继续向前调时。'],
  },
  {
    heading: '实时预览判定线',
    fields: [
      ['line-numbers', '显示判定线编号', 'checkbox', true],
      ['line-arrows', '显示方向箭头', 'checkbox', true],
      ['line-tint', '当前判定线染色', 'checkbox', true],
      ['merge-line-numbers', '合并相近且同向的编号', 'checkbox', true],
      ['pick-preview-lines', '点击预览判定线切换编辑线', 'checkbox', true],
    ],
  },
  {
    heading: '提示与通知',
    fields: [
      ['tips-enabled', '显示右下角 Tips', 'checkbox', true],
      ['success-notifications', '显示绿色完成通知', 'checkbox', true],
      ['note-source-hover', '悬停音符显示来源线', 'checkbox', true],
    ],
  },
  {
    heading: '噪域预览',
    fields: [
      ['pick-preview-noise-areas', '点击预览噪域进入编辑（优先于音符和判定线）', 'checkbox', true],
      ['seamless-noise-areas', '融合连贯噪域，隐藏内部接缝', 'checkbox', true],
      ['force-simple-noise', '忽略皮肤，使用简易渲染', 'checkbox', false],
    ],
  },
  {
    heading: '事件编辑',
    fields: [
      ['event-cut-density', '事件切割密度（每横线间隔的段数）', 'number', 4, 0.1, 128, 0.1],
      ['event-drag-sensitivity', '拖动属性名称灵敏度（倍率，越大越快）', 'range', 1, 0.1, 8, 0.1],
      ['sample-auto-fit', '取样时自动扩大视野（结束后恢复）', 'checkbox', true],
    ],
    hints: ['灵敏度以 1 为基准：每像素对应各事件类型的默认步长，调低更精细、调高更快。Shift 粗调（×10 并吸附 10）与 Alt 微调（×0.1）在其上叠加，吸附步长不受灵敏度影响。'],
  },
  {
    heading: '文本输入',
    fields: [['text-selection-drag', '允许拖拽文本框中已选中的文字', 'checkbox', false]],
  },
  {
    heading: '判定线切换',
    fields: [['line-switcher-enabled', 'Ctrl+滚轮切线时显示附近线缩略图', 'checkbox', true]],
  },
  {
    heading: '剪贴板',
    fields: [['clipboard-history-enabled', '启用剪贴板历史（长按 Ctrl+V）', 'checkbox', true]],
    hints: ['历史仅保存在本机浏览器。固定项不会被新记录挤出；关闭功能暂停记录，保留已有历史。'],
  },
  {
    heading: '默认判定线外观',
    fields: [['default-line-thickness', '默认判定线宽度（粗细倍数）', 'number', 1.5, 0.1, 10, 0.1]],
    hints: ['实时生效，仅调整默认 line.png 的粗细，不改变长度、自定义贴图或谱面事件。1 为此前粗细，默认 1.5。'],
  },
  {
    heading: '自动保存',
    fields: [
      ['autosave-enabled', '启用自动保存', 'checkbox', true],
      ['autosave-seconds', '自动保存间隔（秒）', 'number', 60, 1, 3600, 1],
      ['autosave-limit', '每谱保留备份数', 'number', 10, 1, 100, 1],
    ],
    hints: ['按固定间隔保存包含媒体的恢复副本，持续编辑不会推迟保存；手动保存更新谱面库。Y 缩放为绝对像素/秒，不随 BPM 或预览比例变化。'],
  },
  {
    heading: '编辑区域判定线',
    fields: [['judgement-color', '底部判定线颜色', 'color', '#ffffff']],
  },
];

export const DISPLAY_KEYS: Record<string, string> = {
  'text-selection-drag': 'textSelectionDrag',
  'event-cut-density': 'cutDensity',
  'event-drag-sensitivity': 'dragSensitivity',
  'sample-auto-fit': 'sampleAutoFit',
  'wheel-limit-audio-start': 'wheelStopAtAudioStart',
  'draw-event-curves': 'drawEventCurves',
  'pick-preview-noise-areas': 'pickPreviewNoiseAreas',
  'seamless-noise-areas': 'seamlessNoiseAreas',
  'force-simple-noise': 'forceSimpleNoise',
  'judgement-offset': 'judgementOffset',
  'judgement-color': 'judgementColor',
  'default-line-thickness': 'lineScale',
  'line-switcher-enabled': 'lineSwitcher',
  'clipboard-history-enabled': 'clipboardHistory',
  'bar-width': 'barWidth',
  'bar-alpha': 'barAlpha',
  'event-value-size': 'eventValueSize',
  'event-value-threshold': 'eventValueThreshold',
  'event-curve-threshold': 'eventCurveThreshold',
  'event-opacity': 'eventOpacity',
  'event-bar-width': 'eventBarWidth',
  'seamless-events': 'seamlessEvents',
  'background-blur': 'backgroundBlur',
  'scroll-speed': 'scrollSpeed',
  'tips-enabled': 'tipsEnabled',
  'success-notifications': 'successNotifications',
  'line-numbers': 'lineNumbers',
  'line-arrows': 'lineArrows',
  'line-tint': 'lineTint',
  'merge-line-numbers': 'mergeLineNumbers',
  'pick-preview-lines': 'pickPreviewLines',
  'note-source-hover': 'noteSourceHover',
  'autoplay-view': 'autoplayView',
  'highlight-notes': 'highlight',
  'autosave-enabled': 'autoSave',
  'autosave-seconds': 'autoSaveSeconds',
  'autosave-limit': 'autoSaveLimit',
};

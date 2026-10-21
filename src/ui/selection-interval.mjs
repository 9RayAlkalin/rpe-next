import { validSelectionInterval } from '../core/selection-interval.mjs';

export class SelectionIntervalPanel {
  constructor(setting, read, write) {
    this.read = read; this.write = write;
    this.panel = document.createElement('div'); this.panel.className = 'selection-interval-panel'; this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-label', '间隔多选');
    const heading = document.createElement('div'); heading.className = 'selection-interval-heading';
    const title = document.createElement('strong'); title.textContent = '间隔多选';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '关闭间隔多选'); close.onclick = () => this.hide();
    heading.append(title, close);
    const label = document.createElement('label'); label.className = 'field'; label.append('选择间隔');
    const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = String(Number.MAX_SAFE_INTEGER); input.step = '1'; input.setAttribute('aria-label', '选择间隔');
    input.dataset.rpenField = 'selection-interval'; label.append(input);
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '1 为连续选择；2 为每两个选一个。';
    this.panel.append(heading, label, hint); document.body.append(this.panel);
    this.inputs = [setting, input];
    for (const control of this.inputs) {
      const update = () => {
        const value = Number(control.value); const valid = control.value.trim() !== '' && validSelectionInterval(value);
        control.setCustomValidity(valid ? '' : '请输入大于等于 1 的正整数');
        if (!valid) return;
        if (value !== this.read()) this.write(value);
        this.sync(control);
      };
      control.addEventListener('input', update); control.addEventListener('change', update);
    }
    window.addEventListener('pointerdown', event => { if (!this.panel.hidden && !this.panel.contains(event.target)) this.hide(); }, true);
    window.addEventListener('keydown', event => {
      if (!this.panel.hidden && event.key === 'Escape') { this.hide(); event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    window.addEventListener('resize', () => this.hide());
    this.sync();
  }
  sync(source) {
    for (const input of this.inputs) if (input !== source) { input.value = String(this.read()); input.setCustomValidity(''); }
  }
  open(horizontal, vertical) {
    this.sync(); this.panel.hidden = false;
    const bounds = this.panel.getBoundingClientRect();
    this.panel.style.left = `${Math.max(4, Math.min(innerWidth - bounds.width - 4, horizontal))}px`;
    this.panel.style.top = `${Math.max(4, Math.min(innerHeight - bounds.height - 4, vertical))}px`;
    this.inputs[1].focus({ preventScroll: true }); this.inputs[1].select();
  }
  hide() { this.panel.hidden = true; }
}

import { localPreferences } from '../platform/local-preferences.mjs';
import { MOD_API_VERSION,parseModPackage,modSettingValue } from '../core/mod-package.mjs';
import { ModRuntime,shortcutFromEvent,formatShortcut } from './mod-runtime.mjs';
import { builtinMods,readMods,storeMod,deleteMod,importMod,exportMod } from '../platform/mods.mjs';
import { download } from '../platform/files.mjs';
import { installModApi } from './mod-api.mjs';
import { localizedValue, t } from '../i18n.mjs';

const ENABLED='rpe-next-mod-enabled-v1',OPTIONS='rpe-next-mod-options-v1',BOOT='rpe-next-mod-boot-v1';
const read=(key,fallback)=>{try{return JSON.parse(localPreferences.getItem(key))??fallback;}catch{return fallback;}};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(tag,value,className='')=>{const node=document.createElement(tag);node.textContent=value;node.className=className;return node;};
const button=(value,run)=>{const node=document.createElement('button');node.type='button';node.textContent=value;node.onclick=run;return node;};
const shimText=(apply,initial='')=>{let value=initial;return{get textContent(){return value;},set textContent(next){value=next;apply(next);}};};
export class ModManager {
  declare notify: any;
  declare invalidate: any;



  [key: string]: any;
  declare banner: any;
  declare busy: any;
  declare desired: any;
  declare details: any;
  declare dialog: any;
  declare directory: any;
  declare errors: any;
  declare file: any;
  declare island: any;
  declare list: any;
  declare message: any;
  declare options: any;
  declare ready: any;
  declare records: any;
  declare runtime: any;
  declare safe: any;
  declare selected: any;
  declare warning: any;
  declare warningResolve: any;

  constructor(editor,{notify,invalidate}){
    Object.assign(this,{editor,notify,invalidate});this.records=new Map<any, any>();this.errors=new Map<any, any>();const options=read(OPTIONS,{});this.options=Object.assign(Object.create(null),object(options)?options:{});this.desired=new Set<any>(Array.isArray(read(ENABLED,[]))?read(ENABLED,[]):[]);this.selected=null;this.busy=false;
    this.runtime=new ModRuntime({editor,notify,invalidate,changed:()=>this.updateStatus()});this.runtime.emergency=()=>this.disableAll(true);this.runtime.installInput();
    const factory=globalThis.rpenIslands?.mods?.createModManagerDialog;
    if(typeof factory==='function')this.island=factory({helpers:{formatShortcut,shortcutFromEvent},actions:{select:id=>{this.selected=id;this.renderList();},toggle:id=>this.toggle(id),export:id=>download(exportMod(this.records.get(id)),id+'.rpenmod'),remove:id=>this.remove(id),close:()=>this.dialog.close(),saveSetting:(id,key,value)=>this.saveSetting(id,key,value),resetSettings:id=>this.resetSettings(id),runCommand:(id,key)=>{const command=[...this.runtime.commands.values()].find(entry=>entry.owner===id&&entry.id===key);this.dialog.close();command?.run();},disableAll:()=>this.disableAll(),pickPackage:()=>this.file.click(),pickDirectory:()=>this.directory.click(),downloadDoc:path=>this.downloadDoc(path)}});
    this.render();document.querySelector('#mods-open').onclick=()=>this.open();document.querySelector('#mods-status').onclick=()=>this.open();
    window.rpenMods={apiVersion:MOD_API_VERSION,editor,runtime:this.runtime,manager:this,resolveModule:(...args)=>this.runtime.resolveModule(...args),disableAll:()=>this.disableAll(true)};installModApi(window.rpenMods);this.ready=this.load();
  }
  async load(){
    this.runtime.events.addEventListener('mod:unloaded',event=>{const {id,reason,error}=event.detail;if(reason==='error'){this.errors.set(id,error);this.desired.delete(id);this.persist();this.notify(t('mod-manager.s86b2076')+id+t('mod-manager.s2112669'),'warning');if(this.dialog.open)this.renderList();}const loaded=[...this.runtime.loaded.values()].filter(state=>state.record.manifest.dependencies.includes(id));for(const state of loaded)this.disable(state.id).catch(error=>this.notify(error.message,'error'));});
    try{
      for(const record of await builtinMods())this.records.set(record.manifest.id,record);
      for(const stored of await readMods())try{const record=parseModPackage(new Map<any, any>(stored.files));if(!this.records.has(record.manifest.id))this.records.set(record.manifest.id,record);}catch(error){this.errors.set(stored.id,error.message);}
      const safe=new URL(location.href).searchParams.get('mods')==='off';const interrupted=read(BOOT,null);
      if(safe||interrupted){this.safe=true;this.banner.textContent=safe?t('mod-manager.se5ac3ae'):t('mod-manager.s7363c83');this.notify(this.banner.textContent,'warning');localPreferences.removeItem(BOOT);}
      else {for(const id of [...this.desired])if(this.records.has(id))try{await this.enable(id,false);}catch(error){this.desired.delete(id);this.errors.set(id,error.message);this.notify(t('mod-manager.s10851d3', { p0: id, p1: error.message }),'error');}else this.desired.delete(id);this.persist();}
      this.updateStatus();this.renderList();
    }catch(error){this.banner.textContent=t('mod-manager.s39621fa')+error.message;this.notify(this.banner.textContent,'warning');}
  }
  render(){
    if(this.island)this.dialog=this.island.dialog;
    else{this.dialog=document.createElement('dialog');this.dialog.id='mod-manager';this.dialog.className='mod-manager';this.dialog.dataset.modInteractive='true';}
    if(this.island){this.banner=shimText(value=>this.island.setBanner(value),'模组可更改编辑器行为与谱面结构；启用前请保存谱面。');this.message=shimText(value=>this.island.setMessage(value),'内置模组和导入模组均需手动启用。启用状态与参数保存在本机。');}
    else{
      const heading=document.createElement('div');heading.className='mod-manager-heading';heading.append(text('h2','模组管理器'),button('关闭',()=>this.dialog.close()));
      const actions=document.createElement('div');actions.className='mod-manager-toolbar';
      actions.append(button('导入模组包',()=>this.file.click()),button('导入文件夹',()=>this.directory.click()),button('禁用全部模组',()=>this.disableAll()),button('协议与 API',()=>this.showProtocol()));
      this.banner=text('p','模组可更改编辑器行为与谱面结构；启用前请保存谱面。','hint');
      const body=document.createElement('div');body.className='mod-manager-body';this.list=document.createElement('div');this.list.className='mod-manager-list';this.list.setAttribute('aria-label','已安装模组');this.details=document.createElement('div');this.details.className='mod-manager-details';body.append(this.list,this.details);
      this.message=text('p','内置模组和导入模组均需手动启用。启用状态与参数保存在本机。','hint');this.message.setAttribute('role','status');
      this.dialog.append(heading,actions,this.banner,body,this.message);document.body.append(this.dialog);
    }
    this.file=document.createElement('input');this.file.type='file';this.file.accept='.rpenmod,.zip';this.file.hidden=true;this.file.setAttribute('aria-label','导入模组包');this.file.onchange=()=>this.importFiles(this.file.files);
    this.directory=document.createElement('input');this.directory.type='file';this.directory.webkitdirectory=true;this.directory.multiple=true;this.directory.hidden=true;this.directory.setAttribute('aria-label','导入模组目录');this.directory.onchange=()=>this.importFiles(this.directory.files,true);
    this.dialog.append(this.file,this.directory);
    this.dialog.addEventListener('cancel',event=>{if(event.target===this.dialog){event.preventDefault();this.dialog.close();}});
    this.dialog.addEventListener('dragover',event=>event.preventDefault());this.dialog.addEventListener('drop',event=>{event.preventDefault();this.importFiles(event.dataTransfer.files);});
    this.warning=document.createElement('dialog');this.warning.id='mod-import-warning';this.warning.dataset.modInteractive='true';this.warning.className='mod-import-warning';document.body.append(this.warning);
    this.warning.addEventListener('cancel',event=>{if(event.target===this.warning){event.preventDefault();this.finishWarning(false);}});
  }
  async open(){await this.ready;this.renderList();if(!this.dialog.open)this.dialog.showModal();}
  renderList(){
    if(!this.selected||!this.records.has(this.selected))this.selected=this.records.keys().next().value;
    if(this.island){this.island.render(this.viewState());return;}
    this.list.replaceChildren();for(const [id,record]of this.records){const active=this.runtime.loaded.has(id);const node=button('',()=>{this.selected=id;this.renderList();});node.className='mod-card';node.dataset.modId=id;node.setAttribute('aria-pressed',String(this.selected===id));node.append(text('strong',record.manifest.name),text('span',`${record.builtin?'内置':'导入'} · ${record.manifest.version} · ${record.manifest.author}`),text('small',active?'已装载':this.errors.has(id)?'装载失败':'已禁用'));this.list.append(node);}
    this.renderDetails();
  }
  renderDetails(){
    if(this.island){this.island.render(this.viewState());return;}
    this.details.replaceChildren();const record=this.records.get(this.selected);if(!record){this.details.append(text('p','尚无模组'));return;}const {manifest}=record;const active=this.runtime.loaded.get(manifest.id);
    this.details.append(text('h3',manifest.name),text('p',manifest.description),text('p',`${manifest.id} · v${manifest.version} · API ${manifest.api} · ${manifest.author}`,'hint'));
    const actions=document.createElement('div');actions.className='mod-manager-toolbar';const toggle=button(active?'禁用模组':'启用模组',()=>this.toggle(manifest.id));toggle.className=active?'':'primary';toggle.disabled=this.busy;actions.append(toggle,button('导出模组',()=>download(exportMod(record),manifest.id+'.rpenmod')));
    if(!record.builtin)actions.append(button('删除模组',()=>this.remove(manifest.id)));this.details.append(actions);
    if(this.errors.has(manifest.id))this.details.append(text('pre',this.errors.get(manifest.id),'mod-error'));
    if(manifest.dependencies.length)this.details.append(text('p','依赖：'+manifest.dependencies.join('、'),'hint'));if(manifest.conflicts.length)this.details.append(text('p','冲突：'+manifest.conflicts.join('、'),'hint'));
    const settings=this.settingsFor(record);
    if(Object.keys(manifest.settings).length)this.details.append(button('恢复默认参数',()=>this.resetSettings(manifest.id)));
    for(const [key,definition]of Object.entries<any>(manifest.settings)){
      const row=document.createElement('label');row.className='field';row.append(text('span',definition.label));let control;
      if(definition.type==='select'){control=document.createElement('select');for(const [value,label]of Object.entries<any>(definition.options))control.append(new Option(label,value));control.value=settings[key];}
      else{control=document.createElement('input');control.type=definition.type==='boolean'?'checkbox':definition.type==='shortcut'?'text':definition.type;control.value=settings[key];if(definition.type==='boolean')control.checked=settings[key];if(definition.type==='number'){control.min=definition.min;control.max=definition.max;control.step=definition.step??'any';}}
      control.dataset.modSetting=key;control.setAttribute('aria-label',definition.label);row.append(control);this.details.append(row);
      const save=async value=>{try{await this.setSetting(manifest.id,key,value);control.setCustomValidity('');this.message.textContent='模组设置已保存。';}catch(error){control.setCustomValidity(error.message);this.message.textContent=error.message;}};
      if(definition.type==='shortcut'){control.readOnly=true;control.value=formatShortcut(settings[key]);control.title='点击后按下组合键，Backspace 清除';control.onkeydown=event=>{event.preventDefault();event.stopPropagation();const value=event.key==='Backspace'?'':shortcutFromEvent(event);if(value!==null){save(value);control.value=formatShortcut(value);}};}
      else control.onchange=()=>save(control.type==='checkbox'?control.checked:control.type==='number'?Number(control.value):control.value);
      if(definition.description)this.details.append(text('p',definition.description,'hint'));
    }
    if(active){const commands=[...this.runtime.commands.values()].filter(command=>command.owner===manifest.id);if(commands.length){this.details.append(text('h4','操作'));for(const command of commands)this.details.append(button(command.title??command.id,()=>{this.dialog.close();command.run();}));}this.details.append(text('p',`运行中 · 错误 ${active.errors} 次`,'hint'));}
    const source=document.createElement('details');source.append(text('summary','包内文件与源码'));const code=document.createElement('pre');code.className='mod-source';code.textContent=[...record.files].filter(([name])=>/\.(json|m?js|css|md)$/.test(name)).map(([name,bytes])=>`— ${name} —\n${new TextDecoder().decode(bytes).slice(0,100000)}`).join('\n\n');source.append(code);this.details.append(source);
  }
  settingsFor(record){const id=record.manifest.id;if(!Object.hasOwn(this.options,id)||!object(this.options[id]))this.options[id]=Object.create(null);const values=this.options[id];for(const [key,definition]of Object.entries(record.manifest.settings)){try{if(!Object.hasOwn(values,key))throw Error();modSettingValue(definition,values[key],key);}catch{values[key]=structuredClone((definition as any).default);}}return values;}
  async setSetting(id,key,value){const record=this.records.get(id);if(!record)throw Error(t('mod-manager.s9898e8d'));modSettingValue(Object.hasOwn(record.manifest.settings,key)?record.manifest.settings[key]:null,value,key);this.settingsFor(record)[key]=value;localPreferences.setItem(OPTIONS,JSON.stringify(this.options));const state=this.runtime.loaded.get(id);if(state){state.settings=this.options[id];this.runtime.emit('settings:'+id,{key,value});}}
  persist(){localPreferences.setItem(ENABLED,JSON.stringify([...this.desired]));localPreferences.setItem(OPTIONS,JSON.stringify(this.options));}
  async enable(id,persist=true,chain=new Set()){
    if(this.runtime.loaded.has(id)){await this.runtime.loaded.get(id).promise;return;}if(chain.has(id))throw Error(t('mod-manager.se372ea7')+[...chain,id].join(' → '));const record=this.records.get(id);if(!record)throw Error(t('mod-manager.s274b62e')+id);chain.add(id);
    const checkConflicts=()=>{for(const conflict of record.manifest.conflicts)if(this.runtime.loaded.has(conflict))throw Error(t('mod-manager.s08f0345')+conflict);for(const state of this.runtime.loaded.values())if(state.record.manifest.conflicts.includes(id))throw Error(t('mod-manager.s08f0345')+state.id);};checkConflicts();
    for(const dependency of record.manifest.dependencies)await this.enable(dependency,persist,new Set(chain));
    checkConflicts();
    localPreferences.setItem(BOOT,JSON.stringify({id,time:Date.now()}));
    try{const state=await this.runtime.load(record,this.settingsFor(record),(key,value)=>this.setSetting(id,key,value));if(state?.status==='loaded'&&this.runtime.loaded.get(id)===state){this.errors.delete(id);this.desired.add(id);if(persist)this.persist();}}
    finally{localPreferences.removeItem(BOOT);}this.updateStatus();
  }
  async disable(id){for(const state of [...this.runtime.loaded.values()])if(state.record.manifest.dependencies.includes(id))await this.disable(state.id);await this.runtime.unload(id);this.desired.delete(id);this.persist();this.updateStatus();}
  async toggle(id){if(this.busy)return;this.busy=true;try{if(this.runtime.loaded.has(id))await this.disable(id);else await this.enable(id);this.message.textContent=this.runtime.loaded.has(id)?t('mod-manager.s5bb376d'):t('mod-manager.sbc2295f');}catch(error){this.errors.set(id,error.stack??error.message);this.notify(error.message,'error');}finally{this.busy=false;this.renderList();}}
  async disableAll(emergency=false){this.desired.clear();this.persist();for(const id of [...this.runtime.loaded.keys()].reverse())await this.runtime.unload(id);localPreferences.removeItem(BOOT);this.updateStatus();if(this.dialog.open)this.renderList();if(emergency)this.notify(t('mod-manager.sb66f83f'),'warning');}
  updateStatus(){const count=[...this.runtime.loaded.values()].filter(state=>state.status==='loaded').length;const node=document.querySelector('#mods-status');node.hidden=count===0;node.textContent=t('mod-manager.s0e1a497', { p0: count });node.title=t('mod-manager.sc43bb7d');this.invalidate();}
  async review(record){
    this.warning.replaceChildren(text('h2',t('mod-manager.se2ecae2')),text('p',`${localizedValue(record.manifest.name)} · ${record.manifest.version} · ${localizedValue(record.manifest.author)}`),text('p',t('mod-manager.s8d616da')),text('p',t('mod-manager.sc2a5ae9')));
    const label=document.createElement('label');label.className='mod-consent';const consent=document.createElement('input');consent.type='checkbox';label.append(consent,t('mod-manager.sc56c250'));this.warning.append(label);
    const source=document.createElement('details');source.append(text('summary',t('mod-manager.s22ecfdc')));const pre=text('pre',[...record.files].filter(([path])=>/\.(m?js|json)$/.test(path)).map(([path,bytes])=>path+'\n'+new TextDecoder().decode(bytes).slice(0,100000)).join('\n\n'),'mod-source');source.append(pre);this.warning.append(source);
    const actions=document.createElement('div');actions.className='modal-actions';const accept=button(t('mod-manager.s056e307'),()=>this.finishWarning(true));accept.disabled=true;consent.onchange=()=>accept.disabled=!consent.checked;actions.append(button(t('mod-manager.s4d0b468'),()=>this.finishWarning(false)),accept);this.warning.append(actions);this.warning.showModal();return new Promise(resolve=>{this.warningResolve=resolve;});
  }
  finishWarning(accepted){this.warning.close();this.warningResolve?.(accepted);this.warningResolve=null;}
  async importFiles(files,directory=false){if(!files?.length||this.busy)return;this.busy=true;try{const record=await importMod(files,directory);if(this.records.get(record.manifest.id)?.builtin)throw Error(t('mod-manager.se2a7877'));if(!await this.review(record))return;if(this.records.has(record.manifest.id)&&!confirm(t('mod-manager.s0f1d758')))return;await this.disable(record.manifest.id);await storeMod(record);this.records.set(record.manifest.id,record);this.selected=record.manifest.id;this.message.textContent=t('mod-manager.sc774273');this.renderList();}catch(error){this.notify(error.message,'error');this.message.textContent=error.message;}finally{this.file.value='';this.directory.value='';this.busy=false;this.renderList();}}
  async remove(id){if(!confirm(t('mod-manager.s667ec6f')))return;await this.disable(id);await deleteMod(id);delete this.options[id];localPreferences.removeItem('rpe-next-mod-data:'+id);this.records.delete(id);this.persist();this.renderList();}
  showProtocol(){this.details.replaceChildren(text('h3',t('mod-manager.s6ebce19')),text('p',t('mod-manager.s656efc8')),text('p',t('mod-manager.s1b4dfbd')));
    const pre=text('pre',JSON.stringify({protocol:'rpen-mod',api:1,id:'example-mod',name:t('mod-manager.s30fd4ed'),version:'1.0.0',author:t('mod-manager.s698bea5'),description:t('mod-manager.s26670dd'),entry:'main.mjs'},null,2)+t('mod-manager.s33e5ce9'),'mod-source');this.details.append(pre,text('p',t('mod-manager.scda426f'),'hint'));
    const actions=document.createElement('div');actions.className='mod-manager-toolbar';for(const [label,path]of [[t('mod-manager.sc854009'),'protocols/MOD-PROTOCOL.zh-CN.md'],[t('mod-manager.s956acaa'),'protocols/GLOBAL-EVENTS-PROTOCOL.zh-CN.md'],[t('mod-manager.sdd30be1'),'schemas/mod-api-v1.d.ts'],[t('mod-manager.s2ae69ce'),'schemas/mod-v1.schema.json']])actions.append(button(label,async()=>{try{const response=await fetch(new URL('../../'+path,import.meta.url));if(!response.ok)throw Error(t('mod-manager.s896431a'));download(await response.blob(),path.split('/').at(-1));}catch(error){this.notify(error.message,'error');}}));this.details.append(actions);
  }
  async downloadDoc(path){try{const response=await fetch(new URL('../../'+path,import.meta.url));if(!response.ok)throw Error('文档读取失败');download(await response.blob(),path.split('/').at(-1));}catch(error){this.notify(error.message,'error');}}

  async resetSettings(id){const record=this.records.get(id);if(!record)return;for(const [key,definition]of Object.entries<any>(record.manifest.settings))await this.setSetting(id,key,structuredClone(definition.default));this.renderDetails();}

  async saveSetting(id,key,value){
    try{await this.setSetting(id,key,value);this.message.textContent='模组设置已保存。';return null;}
    catch(error){this.message.textContent=error.message;return error.message;}
  }

  viewState(){
    const cards=[];for(const [id,record]of this.records){const active=this.runtime.loaded.has(id);cards.push({id,name:record.manifest.name,active,selected:this.selected===id,span:`${record.builtin?'内置':'导入'} · ${record.manifest.version} · ${record.manifest.author}`,status:active?'已装载':this.errors.has(id)?'装载失败':'已禁用'});}
    const record=this.records.get(this.selected);let detail=null;
    if(record){const {manifest}=record;const active=this.runtime.loaded.get(manifest.id);const settings=this.settingsFor(record);
      detail={id:manifest.id,name:manifest.name,description:manifest.description,label:`${manifest.id} · v${manifest.version} · API ${manifest.api} · ${manifest.author}`,builtin:record.builtin,active:Boolean(active),busy:this.busy,error:this.errors.has(manifest.id)?this.errors.get(manifest.id):'',
        dependencies:manifest.dependencies.length?'依赖：'+manifest.dependencies.join('、'):'',conflicts:manifest.conflicts.length?'冲突：'+manifest.conflicts.join('、'):'',
        settings:Object.entries<any>(manifest.settings).map(([key,definition])=>({key,type:definition.type,label:definition.label,description:definition.description??'',value:definition.type==='shortcut'?formatShortcut(settings[key]):settings[key],options:definition.type==='select'?Object.entries<any>(definition.options).map(([value,label])=>({value,label})):[],min:definition.min??null,max:definition.max??null,step:definition.step??null,shortcut:definition.type==='shortcut'})),
        commands:active?[...this.runtime.commands.values()].filter(command=>command.owner===manifest.id).map(command=>({id:command.id,title:command.title??command.id})):[],
        running:active?`运行中 · 错误 ${active.errors} 次`:'',
        source:[...record.files].filter(([name])=>/\.(json|m?js|css|md)$/.test(name)).map(([name,bytes])=>`— ${name} —\n${new TextDecoder().decode(bytes).slice(0,100000)}`).join('\n\n')};
    }
    return {cards,detail};
  }

}

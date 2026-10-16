import { readZip,writeZip } from './archive.mjs';
import { MOD_LIMITS,parseModPackage } from '../core/mod-package.mjs';
import { assetUrl } from '../core/asset-url.mjs';

async function access(mode,action){const database=await new Promise((resolve,reject)=>{const request=indexedDB.open('rpe-next-mods',1);request.onupgradeneeded=()=>request.result.createObjectStore('packages',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return new Promise((resolve,reject)=>{const transaction=database.transaction('packages',mode);let request;try{request=action(transaction.objectStore('packages'));}catch(error){database.close();reject(error);return;}transaction.oncomplete=()=>{database.close();resolve(request.result);};transaction.onabort=transaction.onerror=()=>{database.close();reject(transaction.error??new Error('模组存储失败'));};});}
export const readMods=()=>access('readonly',store=>store.getAll());
export const storeMod=record=>access('readwrite',store=>store.put({id:record.manifest.id,files:[...record.files],imported:Date.now()}));
export const deleteMod=id=>access('readwrite',store=>store.delete(id));
export const exportMod=record=>writeZip(record.files);
export async function importMod(files,directory=false){
  let entries;if(directory){const list=[...files];if(list.length>MOD_LIMITS.files||list.some(file=>file.size>MOD_LIMITS.fileBytes)||list.reduce((sum,file)=>sum+file.size,0)>MOD_LIMITS.bytes)throw Error('模组文件数量或大小超限');entries=new Map(await Promise.all(list.map(async file=>[file.webkitRelativePath||file.name,new Uint8Array(await file.arrayBuffer())])));}
  else {const file=files[0];if(!file||file.size>MOD_LIMITS.bytes+1024*1024)throw Error('模组包过大');entries=await readZip(await file.arrayBuffer(),{maxFiles:MOD_LIMITS.files,maxBytes:MOD_LIMITS.bytes,maxFileBytes:MOD_LIMITS.fileBytes});}
  return parseModPackage(entries);
}
export async function builtinMods(){
  const response=await fetch(assetUrl('mods/index.json'));if(!response.ok)throw Error('内置模组目录读取失败');const list=await response.json();
  if(!Array.isArray(list))throw Error('内置模组目录无效');
  return Promise.all(list.map(async entry=>{if(!entry||!/^[a-z][a-z0-9-]*$/.test(entry.directory)||!Array.isArray(entry.files))throw Error('内置模组条目无效');const files=new Map(await Promise.all(entry.files.map(async path=>{if(typeof path!=='string'||path.includes('..')||path.startsWith('/'))throw Error('内置模组路径无效');const result=await fetch(assetUrl(`mods/${entry.directory}/${path}`));if(!result.ok)throw Error('内置模组文件缺失');return[path,new Uint8Array(await result.arrayBuffer())];})));return {...parseModPackage(files),builtin:true};}));
}

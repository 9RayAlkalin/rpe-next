import test from 'node:test';
import assert from 'node:assert/strict';
import { noiseLayers, noiseLayerId, withNoiseLayers, validateNoiseLayers, parseNoiseSkin, skinParameters, skinTextures, skinPath, skinSize, maskWord } from '../src/core/noise-skin.mjs';
import { createChart, parseChart, serializeChart } from '../src/core/chart.mjs';
import { createNoiseArea } from '../src/core/noise-areas.mjs';
import { packageEntries, legacyChart } from '../src/platform/files.mjs';
import { normalizeEditorPreferences } from '../src/platform/editor-preferences.mjs';

const main = 'precision highp float; varying highp vec2 uv; uniform float touchReleaseDuration; // %0.1% 0..1\nuniform vec4 tint; // %1,0,0,1% 0..1\nvoid main(){gl_FragColor=tint;}';
const files = config => new Map([['main.glsl', main], ...(config ? [['config.json', JSON.stringify(config)]] : [])]);

test('旧谱面隐式默认层和显式层数据往返', () => {
  const chart = createChart(); chart.blockAreaList = [createNoiseArea()];
  assert.equal(noiseLayers(chart)[0].id, noiseLayerId(chart.blockAreaList[0]));
  chart.noiseAreaLayers = [{ id: 'default', name: '默认层', skin: 'shader/Test', parameters: { tint: [0,1,0,1] }, channel: 'low' }];
  assert.equal(withNoiseLayers(chart,chart.noiseAreaLayers).META.RPEVersion,230);
  const result = parseChart(serializeChart(chart));
  assert.equal(result.META.RPEVersion, 230); assert.deepEqual(result.noiseAreaLayers, chart.noiseAreaLayers);
  assert.throws(() => validateNoiseLayers({ ...chart, noiseAreaLayers: [] }), /至少/);
  assert.throws(() => validateNoiseLayers({ ...chart, blockAreaList: [{ ...chart.blockAreaList[0], layerId: 'missing' }] }), /不存在/);
  assert.throws(() => validateNoiseLayers({ ...chart, noiseAreaLayers: [{ id:'default', name:'X', channel:'other' }] }), /通道/);
  assert.throws(() => validateNoiseLayers({ ...chart, noiseAreaLayers: [{ id:'default', name:'X', parameters:{touchReleaseDuration:-1} }] }), /负数/);
});

test('皮肤参数声明、范围与必需参数校验', () => {
  assert.equal(skinParameters(main).length, 2);
  assert.throws(() => skinParameters(main.replace('%0.1%', '%-1%')), /范围|非负/);
  assert.throws(() => skinParameters(main.replace('0..1', '2..1')), /范围/);
  assert.throws(() => skinParameters('void main(){}'), /touchReleaseDuration/);
  assert.throws(() => skinParameters(main+'\nuniform float time; // %0%'), /保留/);
});

test('皮肤路径严格按相对路径解析，纹理选项独立', () => {
  for (const path of ['/a','../a','a/../b','a\\b','C:/a','a//b','a?b']) assert.throws(() => skinPath(path));
  const images = skinTextures('uniform sampler2D foam;\n// @texture tex/Foam.png wrap=mirror filter=nearest colorspace=srgb alphaMode=premult', 'effects/main.glsl');
  assert.deepEqual(images[0], { name:'foam',path:'effects/tex/Foam.png',wrap:'mirror',filter:'nearest',colorspace:'srgb',alphaMode:'premult' });
  assert.throws(() => skinTextures('uniform sampler2D image; // @texture a.png wrap=bad', 'main.glsl'), /选项/);
});

test('分辨率必须向下取整，允许放大，不允许空纹理', () => {
  assert.deepEqual(skinSize(1366,768,{scaleX:.125,scaleY:.125}), [170,96]);
  assert.deepEqual(skinSize(1366,768,{scaleX:.25,scaleY:.25}), [341,192]);
  assert.deepEqual(skinSize(10,20,{scaleX:2,scaleY:3}), [20,60]);
  assert.throws(() => skinSize(3,3,{scaleX:.1})); assert.throws(() => skinSize(100,100,{},64));
});

test('六位掩码统计恰好一次反转，Ready 同时计入合并集合', () => {
  assert.equal(maskWord([0,0,0],[0,0,0]),0);
  assert.equal(maskWord([1,0,0],[1,0,0]),3);
  assert.equal(maskWord([0,0,0],[2,0,0]),0);
  assert.equal(maskWord([0,0,0],[3,0,0]),0);
  assert.equal(maskWord([0,1,1],[0,0,0]),20);
  assert.equal(maskWord([0,0,0],[0,1,1]),40);
  assert.equal(maskWord([0,0,0],[0,2,1]),32);
});

test('默认单 Pass 和低性能通道不继承普通配置', () => {
  const simple = parseNoiseSkin(files()); assert.equal(simple.normal.passes.length,1); assert.equal(simple.normal.passes[0].output,'$screen');
  const skin = parseNoiseSkin(files({version:1,blockMask:{scaleX:.125},targets:{normal:{format:'r8'}},passes:[{shader:'main.glsl',output:'normal'}],lowPerformance:{passes:[{shader:'main.glsl',output:'$screen'}]}}));
  assert.deepEqual(skin.low.targets,{}); assert.deepEqual(skin.low.blockMask,{});
});

test('多 Pass 读取时序、历史自读和通道输出校验', () => {
  const source = 'uniform sampler2D historyRT; void main(){gl_FragColor=vec4(1.);}';
  const configured = (target,passes) => { const data=files({version:1,targets:{history:target},passes});data.set('step.glsl',source);return data; };
  const pass={shader:'step.glsl',output:'history.g',inputs:{historyRT:'history'}};
  assert.doesNotThrow(()=>parseNoiseSkin(configured({format:'rg8',noClear:true},[pass])));
  assert.throws(()=>parseNoiseSkin(configured({format:'rg8'},[pass])),/写入前/);
  assert.throws(()=>parseNoiseSkin(configured({format:'r8',noClear:true},[pass])),/输出/);
  assert.throws(()=>parseNoiseSkin(configured({},[{shader:'main.glsl',output:'missing.g'}])),/输出/);
  assert.throws(()=>parseNoiseSkin(files({version:2,targets:{},passes:[]})),/version/);
  const reserved = files(); reserved.set('main.glsl',main+'\nuniform sampler2D data;\nuniform float dataSize; // %0%'); reserved.set('config.json',JSON.stringify({version:1,targets:{history:{noClear:true}},passes:[{shader:'main.glsl',output:'$screen',inputs:{data:'history'}}]}));
  assert.throws(()=>parseNoiseSkin(reserved),/冲突|类型/);
});

test('PEZ 保留完整皮肤路径和内容，兼容导出不残留层元数据', () => {
  const chart=createChart();chart.noiseAreaLayers=[{id:'default',name:'默认层',skin:'shader/Test'}];
  const bytes=new TextEncoder().encode(main);const assets=new Map([['shader/Test/main.glsl',bytes]]);
  assert.deepEqual(packageEntries(chart,assets,'chart.json').get('shader/Test/main.glsl'),bytes);
  assert.equal(legacyChart(chart).noiseAreaLayers,undefined);
  assert.deepEqual(normalizeEditorPreferences({forceSimpleNoise:true}),{forceSimpleNoise:true});
});

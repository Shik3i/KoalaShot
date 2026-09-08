// Regression tests for the pre-store audit findings. Reuses the existing isolated Chrome harness, with its
// expanded TEST permissions. Does not modify the release manifest or sources.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { runWorkflowRegressions } from './workflow-regressions.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const output = resolve(process.env.KOALASHOT_AUDIT_OUTPUT || join(root, '.cache/regressions'));
mkdirSync(output, { recursive: true });
process.env.KOALASHOT_BROWSER = 'chrome';
const { ChromeBrowser } = await import('./extension-flow.test.mjs');
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + '\\') && !file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = join(tmpdir(), `koalashot-audit-${Date.now()}`);
mkdirSync(join(profile, 'downloads'), { recursive: true });
const browser = new ChromeBrowser(base, profile, join(profile, 'downloads'));
const results = {};
try {
  await browser.start();
  results.browser = (await browser.socket.request('Browser.getVersion')).result;
  const fixture = await browser.open(`${base}/tests/fixtures/basic-long-page.html`, false);
  await browser.setViewport(fixture, 1200, 800, 1);
  const popup = await browser.open(`chrome-extension://${browser.extensionId}/popup/popup.html`, false);
  await browser.activate(fixture);
  await browser.evaluate(fixture, `(() => {
    document.body.innerHTML = '<div style="height:3000px;background:linear-gradient(red,blue)"><div id="inner" style="width:900px;height:400px;overflow:auto"><div style="height:2000px">Inner scroll</div></div></div>';
    window.scrollTo(0, 0);
  })()`);
  results.mixedScroll = await browser.evaluate(popup, `(async () => {
    const api = chrome;
    const [tab] = await api.tabs.query({active:true,currentWindow:true});
    await api.scripting.executeScript({target:{tabId:tab.id},files:['content/capture-page.js']});
    const sessionId = crypto.randomUUID();
    const port = api.tabs.connect(tab.id,{name:'koalashot-capture:'+sessionId});
    const request = (message) => new Promise(resolve => { const listener = response => {port.onMessage.removeListener(listener);resolve(response)};port.onMessage.addListener(listener);port.postMessage({...message,sessionId}); });
    const ready = await request({type:'start',target:'page'});
    const scrolled = await request({type:'scroll',requestedY:800,sectionIndex:1,sectionCount:4,isFinal:false});
    const [position] = await api.scripting.executeScript({target:{tabId:tab.id},func:()=>({pageY:scrollY,innerY:document.querySelector('#inner').scrollTop})});
    await request({type:'restore'});port.disconnect();
    return {readyHeight:ready.documentHeight,reportedY:scrolled.actualY,actual:position.result,error:position.error};
  })()`);
  assert.ok(results.mixedScroll.actual, JSON.stringify(results.mixedScroll));
  assert.equal(results.mixedScroll.actual.pageY, 800);
  assert.equal(results.mixedScroll.actual.innerY, 0);

  await browser.evaluate(fixture, `document.body.innerHTML='<div style="height:800px;background:white">Audit single viewport</div>'`);
  results.lateCancel = await browser.evaluate(popup, `(async()=>{
    const {captureScreenshot}=await import('./capture-controller.js');
    const controller=new AbortController();const original=HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob=function(cb,...args){original.call(this,blob=>{controller.abort();cb(blob)},...args)};
    try{const result=await captureScreenshot({signal:controller.signal});return {aborted:controller.signal.aborted,outcome:'resolved',bytes:result.blob.size};}
    catch(e){return {aborted:controller.signal.aborted,outcome:e.code};}
    finally{HTMLCanvasElement.prototype.toBlob=original}
  })()`);
  assert.equal(results.lateCancel.outcome,'cancelled');

  await browser.evaluate(fixture, `document.body.innerHTML='<div style="height:2400px"><div style="height:1000px"></div><div id="late-sticky" style="position:sticky;top:0;height:50px;background:red">This heading must appear</div></div>'`);
  results.lateSticky = await browser.evaluate(popup, `(async()=>{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const sessionId=crypto.randomUUID(),port=chrome.tabs.connect(tab.id,{name:'koalashot-capture:'+sessionId});
    const request=m=>new Promise(r=>{const fn=x=>{port.onMessage.removeListener(fn);r(x)};port.onMessage.addListener(fn);port.postMessage({...m,sessionId})});
    await request({type:'start',target:'page'});await request({type:'scroll',requestedY:800,sectionIndex:1,sectionCount:3,isFinal:false});
    const [state]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{const e=document.querySelector('#late-sticky');return {visibility:getComputedStyle(e).visibility,top:e.getBoundingClientRect().top}}});
    await request({type:'restore'});port.disconnect();return state.result;
  })()`);
  assert.equal(results.lateSticky.visibility,'visible');

  await browser.evaluate(fixture, `document.body.innerHTML='<div id="valid" style="width:800px;height:400px;overflow:auto"><div style="height:1500px">Visible candidate</div></div><div id="offscreen" style="position:absolute;top:2000px;width:900px;height:400px;overflow:auto"><div style="height:4000px">Larger offscreen candidate</div></div>'`);
  results.internalCandidate = await browser.evaluate(popup, `(async()=>{
    const {captureScreenshot}=await import('./capture-controller.js');
    try{await captureScreenshot({target:'internal'});return 'resolved'}catch(e){return e.message}
  })()`);
  assert.equal(results.internalCandidate,'resolved');

  results.effectOverRedaction = await browser.evaluate(popup, `(async () => {
    const {renderEditorResultBlob} = await import('../editor/editor-export.js');
    const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,100,100);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
    const capture={blob,width:100,height:100};
    const rect={id:'redact-0001',type:'redact',x:10,y:10,width:80,height:80,color:'#000000'};
    const sample=async (annotations)=>{const b=await renderEditorResultBlob(capture,annotations);const im=await createImageBitmap(b);ctx.clearRect(0,0,100,100);ctx.drawImage(im,0,0);im.close();return [...ctx.getImageData(50,50,1,1).data];};
    return {redactOnly:await sample([rect]),redactThenPixelate:await sample([rect,{...rect,id:'pixelate-001',type:'pixelate'}]),redactThenBlur:await sample([rect,{...rect,id:'blur-000001',type:'blur'}])};
  })()`);
  assert.deepEqual(results.effectOverRedaction.redactOnly, [0,0,0,255]);
  assert.deepEqual(results.effectOverRedaction.redactThenPixelate, [0,0,0,255]);
  assert.deepEqual(results.effectOverRedaction.redactThenBlur, [0,0,0,255]);
  results.fractionalRedactionCrop = await browser.evaluate(popup, `(async()=>{
    const {renderEditorResultBlob}=await import('../editor/editor-export.js');
    const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
    const context=canvas.getContext('2d');context.fillStyle='#ff0000';context.fillRect(0,0,100,100);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
    const redact={id:'fractional-redact',type:'redact',color:'#000000',x:10.3,y:10.3,width:20.4,height:20.4};
    const output=await renderEditorResultBlob({blob,width:100,height:100,crop:{x:5,y:5,width:50,height:50}},[redact,{...redact,id:'fractional-effect',type:'pixelate'}]);
    const bitmap=await createImageBitmap(output);context.clearRect(0,0,100,100);context.drawImage(bitmap,0,0);
    const result={width:bitmap.width,height:bitmap.height,pixels:[[5,5],[25,25],[4,4]].map(([x,y])=>[...context.getImageData(x,y,1,1).data])};
    bitmap.close();return result;
  })()`);
  assert.deepEqual(results.fractionalRedactionCrop,{width:50,height:50,pixels:[[0,0,0,255],[0,0,0,255],[255,0,0,255]]});

  await browser.evaluate(popup, `(async()=>{
    const c=document.createElement('canvas');c.width=800;c.height=1200;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,800,1200);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    const {openEditorForCapture}=await import('./capture-controller.js');
    await openEditorForCapture({blob,width:800,height:1200,sourceUrl:'https://example.test/',filename:'audit.png',sourceTitle:'Audit synthetic capture'});
  })()`);
  const editor = await browser.findEditor();
  await browser.wait(editor, 'document.querySelector("#capture-image").naturalWidth === 800');
  await browser.setViewport(editor, 1280, 900, 1);
  await browser.evaluate(editor, `(() => {
    window.auditEncodes=0;window.auditReleases=[];const original=HTMLCanvasElement.prototype.toBlob;window.auditOriginalToBlob=original;
    HTMLCanvasElement.prototype.toBlob=function(cb,...args){window.auditEncodes++;original.call(this,blob=>{window.auditReleases.push(()=>cb(blob))},...args)};
    document.querySelector('#save-button').click();
  })()`);
  await browser.wait(editor, 'window.auditReleases.length === 1');
  await browser.draw(editor, 'redact', [100,100], [250,200]);
  results.exportRace = await browser.evaluate(editor, `({annotationsDuringExport:document.querySelector('#annotation-list').options.length-1,saveDisabled:document.querySelector('#save-button').disabled})`);
  await browser.evaluate(editor, 'window.auditReleases.shift()()');
  await browser.wait(editor, '!document.querySelector("#save-button").disabled');
  await browser.evaluate(editor, 'document.querySelector("#save-button").click()');
  await browser.wait(editor, 'window.auditEncodes === 2 && window.auditReleases.length === 1');
  await browser.evaluate(editor, 'window.auditReleases.shift()()');
  await browser.wait(editor, '!document.querySelector("#save-button").disabled');
  results.exportRace.encodesAfterTwoSaves = await browser.evaluate(editor, 'window.auditEncodes');
  assert.equal(results.exportRace.annotationsDuringExport, 1);
  assert.equal(results.exportRace.encodesAfterTwoSaves, 2);
  await browser.evaluate(editor,'HTMLCanvasElement.prototype.toBlob=window.auditOriginalToBlob');
  results.keyboardSpace = await browser.evaluate(editor, `(() => {
    const button=document.querySelector('#save-button');button.focus();
    const event=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});
    button.dispatchEvent(event);return {defaultPrevented:event.defaultPrevented};
  })()`);
  await browser.evaluate(editor,`window.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true}))`);

  const editorUrl=await browser.evaluate(editor,'location.href');
  // Let the editor finish its real debounced write before replacing the fixture draft.
  await browser.wait(editor, `(async()=>{
    const id=new URLSearchParams(location.search).get('capture');
    const {getCapture}=await import('../common/capture-store.js');
    const record=await getCapture(id);
    return record.annotations.length===1 && sessionStorage.getItem('koalashot-editor-draft:'+id)===null;
  })()`);
  await browser.evaluate(editor, `(async()=>{
    const {saveCaptureDraft,getCapture}=await import('../common/capture-store.js');
    const annotations=Array.from({length:5000},(_,i)=>({id:'limit-annotation-'+i,type:'redact',color:'#000000',x:10,y:10,width:5,height:5}));
    const id=new URLSearchParams(location.search).get('capture'); await saveCaptureDraft(id,annotations,null,(await getCapture(id)).revision);
  })()`);
  await browser.navigate(editor,editorUrl);
  await browser.wait(editor,'document.querySelector("#annotation-list").options.length === 5001');
  results.selectionAtLimit=await browser.evaluate(editor,`(() => {
    document.querySelector('[data-tool="select"]').click();
    const canvas=document.querySelector('#interaction-canvas');canvas.focus();
    canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    return document.querySelector('#annotation-list').value;
  })()`);
  assert.equal(results.selectionAtLimit,'limit-annotation-0');
  const duplicate=await browser.open(editorUrl,false);
  await browser.wait(duplicate,'document.querySelector("#capture-image").naturalWidth === 800');
  await browser.evaluate(editor,`(async()=>{const {deleteCapture}=await import('../common/capture-store.js');await deleteCapture(new URLSearchParams(location.search).get('capture'))})()`);
  await browser.wait(duplicate,'document.querySelector("#save-button").disabled');
  results.orphanDraft = await browser.evaluate(editor,`(async()=>{
    const store=await import('../common/capture-store.js');
    let rejected=false;
    try {await store.saveCaptureDraft(new URLSearchParams(location.search).get('capture'),[],null)}catch(e){rejected=e.code==='capture-unavailable'}
    await store.pruneExpiredCaptures();
    return new Promise(resolve=>{const r=indexedDB.open('koalashot-captures',2);r.onsuccess=()=>{const db=r.result,t=db.transaction(['captures','drafts']);const c=t.objectStore('captures').count(),d=t.objectStore('drafts').count();t.oncomplete=()=>{resolve({captures:c.result,drafts:d.result,rejected});db.close()}}});
  })()`);
  assert.deepEqual(results.orphanDraft,{captures:0,drafts:0,rejected:true});
  assert.equal(results.keyboardSpace.defaultPrevented,false);

  // Check stitched pixels across every stripe, including the final overlap,
  // with Chrome's physical viewport instead of CDP capture emulation.
  await browser.socket.request('Emulation.clearDeviceMetricsOverride',{},fixture.sessionId);
  await browser.activate(fixture);
  await browser.evaluate(fixture, `(() => {
    document.head.innerHTML='<title>Pixel stripe fixture</title>';
    document.body.style.cssText='margin:0;padding:0';
    document.body.innerHTML=Array.from({length:24},(_,i)=>'<div style="height:100px;background:rgb('+((i*31)%256)+','+((i*67)%256)+','+((i*97)%256)+')"></div>').join('');
    window.scrollTo(0,0);
  })()`);
  results.stitchedPixels = await browser.evaluate(popup, `(async()=>{
    const {captureScreenshot}=await import('./capture-controller.js');
    const result=await captureScreenshot({target:'page'}), bitmap=await createImageBitmap(result.blob);
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
    const pixels=Array.from({length:24},(_,i)=>[...context.getImageData(30,Math.floor((i*100+50)*result.height/2400),1,1).data]);
    return {width:result.width,height:result.height,pixels};
  })()`);
  results.stitchedPixels.pixels.forEach((pixel,i)=>assert.deepEqual(pixel,[(i*31)%256,(i*67)%256,(i*97)%256,255]));

  const landing = await browser.open(`${base}/dist/landing/index.html`, false);
  await browser.wait(landing, `document.querySelector("[data-app-version]").textContent === ${JSON.stringify('v'+version)} && !document.querySelector("[data-app-version]").hidden`);
  results.landing = [];
  for (const width of [320,390,768,1440]) {
    for (const theme of ['light','dark']) {
      await browser.setViewport(landing,width,900,1);
      await browser.socket.request('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]},landing.sessionId);
      await browser.evaluate(landing, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      results.landing.push(await browser.evaluate(landing, `(() => {
        const button=document.querySelector('.button-primary:not([hidden])'),s=getComputedStyle(button);
        const lum=rgb=>{const c=rgb.match(/[\\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
        const a=lum(s.color),b=lum(s.backgroundColor);
        return {width:innerWidth,theme:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',scrollWidth:document.documentElement.scrollWidth,foreground:s.color,background:s.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),heroLeft:document.querySelector('.hero').getBoundingClientRect().left,firstTextLeft:document.querySelector('h1').getBoundingClientRect().left,resources:performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').pop(),bytes:r.decodedBodySize}))};
      })()`));
      if (width===390 || width===1440) {
        await browser.captureScreenshot(landing,join(output,`landing-${width}-${theme}.png`));
        await browser.evaluate(landing, 'window.scrollTo(0,document.documentElement.scrollHeight)');
        await browser.captureScreenshot(landing,join(output,`landing-footer-${width}-${theme}.png`));
        await browser.evaluate(landing, 'window.scrollTo(0,0)');
      }
    }
  }
  results.workflows = await runWorkflowRegressions(browser, fixture, popup, output);
  writeFileSync(join(output,'browser-results.json'),JSON.stringify(results,null,2));
  for (const row of results.landing) { assert.ok(row.contrast >= 4.5, JSON.stringify(row)); assert.ok(row.firstTextLeft > 0); assert.ok(row.scrollWidth <= row.width); }
  console.log(JSON.stringify(results,null,2));
} finally {
  await browser.stop();
  await new Promise(r=>server.close(r));
}

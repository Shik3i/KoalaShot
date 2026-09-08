// Diagnostic audit: assertions document observed defects, not acceptance criteria.
// Uses the existing isolated Chrome harness with expanded TEST permissions.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = join(root, '.cache/audit-2026-09-08');
mkdirSync(output, { recursive: true });
process.env.KOALASHOT_BROWSER = 'chrome';
const { ChromeBrowser } = await import('../../../tests/browser/extension-flow.test.mjs');
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + path + (path.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' })[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = join(tmpdir(), `koalashot-workflow-audit-${Date.now()}`);
mkdirSync(join(profile, 'downloads'), { recursive: true });
const browser = new ChromeBrowser(base, profile, join(profile, 'downloads'));
const results = {};
const record = (name, value) => { results[name] = value; console.log(name, JSON.stringify(value)); writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2)); };
try {
  await browser.start();
  record('browser', (await browser.socket.request('Browser.getVersion')).result);
  const fixture = await browser.open(`${base}/tests/fixtures/basic-long-page.html`, false);
  const popupUrl = `chrome-extension://${browser.extensionId}/popup/popup.html`;
  const popup = await browser.open(popupUrl, false);
  await browser.wait(popup, 'document.documentElement.dataset.koalashotReady === "true"');
  await browser.setViewport(popup, 360, 600, 1);
  await browser.captureScreenshot(popup, join(output, 'popup-ready.png'));
  record('popupReadyLayout', await browser.evaluate(popup, `({height:document.body.scrollHeight,footer:document.querySelector('.privacy-note').getBoundingClientRect().toJSON(),links:document.querySelector('.help-links').getBoundingClientRect().toJSON()})`));
  await browser.evaluate(fixture, `document.body.innerHTML='<div style="height:900px;background:white">Synthetic capture audit</div>';document.body.style.margin='0'`);
  await browser.evaluate(popup, `(() => {
    window.effects=[];window.failCopy=false;
    window.originalCreate=chrome.tabs.create;
    chrome.tabs.create=function(props,callback){effects.push('editor');callback?.({id:999});return Promise.resolve({id:999})};
    navigator.clipboard.write=async()=>{effects.push('copy');if(window.failCopy)throw Error('Synthetic clipboard denied')};
    HTMLAnchorElement.prototype.click=function(){effects.push('download')};
  })()`);
  for (const [mode, checked, fail] of [['copy',false,false],['copy',true,false],['edit',false,false],['save',false,false],['save',true,false],['copy',true,true]]) {
    if (process.env.KOALASHOT_AUDIT_BURST !== '1') await new Promise(r=>setTimeout(r,1100));
    await browser.activate(fixture);
    await browser.evaluate(popup, `effects=[];failCopy=${fail};document.querySelector('#open-editor').checked=${checked};document.querySelector('#${mode}-button').click()`);
    await browser.wait(popup, '!document.querySelector("#copy-button").disabled');
    record(`action_${mode}_${checked}_${fail}`, await browser.evaluate(popup, `({effects,status:document.querySelector('#status').textContent,height:document.body.scrollHeight,copyResultBottom:document.querySelector('#copy-result-button').getBoundingClientRect().bottom})`));
  }
  await browser.activate(popup);
  await browser.captureScreenshot(popup, join(output, 'popup-result.png'));
  assert.deepEqual(results.action_copy_true_false.effects, ['copy','editor']);
  assert.equal(results.action_copy_true_true.status, 'Editor opened with the original PNG.');
  const priorPreview=await browser.evaluate(popup,'!document.querySelector("#capture-preview").hidden');
  await browser.activate(fixture);
  await browser.evaluate(popup,`document.querySelector('#capture-target').value='internal';document.querySelector('#save-button').click()`);
  await browser.wait(popup,'!document.querySelector("#save-button").disabled');
  record('failedRecaptureDiscardsResult',await browser.evaluate(popup,`({priorPreview:${priorPreview},previewHidden:document.querySelector('#capture-preview').hidden,resultHidden:document.querySelector('#save-result-button').hidden,status:document.querySelector('#status').textContent})`));
  await browser.evaluate(popup, 'chrome.tabs.create=window.originalCreate');
  const id = await browser.evaluate(popup, `(async()=>{
    const c=document.createElement('canvas');c.width=800;c.height=2400;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    const {saveCapture,makeCaptureId}=await import('../common/capture-store.js');const id=makeCaptureId();
    await saveCapture({id,blob,createdAt:Date.now(),width:800,height:2400,filename:'synthetic.png',sourceUrl:'https://example.test',sourceTitle:'Synthetic audit'});return id;
  })()`);
  const editorUrl = `chrome-extension://${browser.extensionId}/editor/editor.html?capture=${id}`;
  const editor = await browser.open(editorUrl, false);
  await browser.wait(editor, '!document.querySelector("#save-button").disabled && document.querySelector("#capture-image").naturalWidth===800');
  await browser.setViewport(editor, 1280, 900, 1);
  // Record exports without creating files; sample actual rendered PNG pixels/dimensions.
  await browser.evaluate(editor, `window.exports=[];HTMLAnchorElement.prototype.click=async function(){const b=await(await fetch(this.href)).blob();const im=await createImageBitmap(b);const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);window.exports.push({width:im.width,height:im.height,pixel:[...c.getContext('2d').getImageData(150,150,1,1).data]});im.close()}`);
  await browser.draw(editor, 'crop', [100,100], [300,300]);
  await browser.evaluate(editor, `document.querySelector('#save-button').click()`);
  await browser.wait(editor, 'window.exports.length===1');
  record('unappliedCropExport', await browser.evaluate(editor, `({output:exports[0],applyEnabled:!document.querySelector('#apply-crop-button').disabled,status:document.querySelector('#status').textContent})`));
  assert.equal(results.unappliedCropExport.output.height,2400);
  await browser.evaluate(editor, `document.querySelector('#apply-crop-button').click()`);
  await browser.draw(editor, 'crop', [400,400], [600,600]);
  await browser.evaluate(editor, `document.querySelector('#undo-button').click()`);
  record('cropUndoPending', await browser.evaluate(editor, `({metadata:document.querySelector('#capture-meta').textContent,applyEnabled:!document.querySelector('#apply-crop-button').disabled,resetEnabled:!document.querySelector('#reset-crop-button').disabled})`));
  await browser.evaluate(editor, `document.querySelector('#reset-crop-button').click()`);
  await browser.draw(editor, 'text', [150,150], [150,150]);
  await browser.evaluate(editor, `document.querySelector('#text-input').value='UNAPPLIED TEXT';document.querySelector('#save-button').click()`);
  await browser.wait(editor, 'window.exports.length===2');
  record('unappliedTextExport', await browser.evaluate(editor, `({output:exports[1],textOpen:!document.querySelector('#text-editor').hidden,annotations:document.querySelector('#annotation-list').options.length-1,status:document.querySelector('#status').textContent})`));
  assert.equal(results.unappliedTextExport.annotations,0);
  await browser.evaluate(editor, `document.querySelector('#cancel-text-button').click()`);
  await browser.draw(editor, 'rectangle', [100,100], [300,300]);
  await browser.evaluate(editor, `document.querySelector('[data-tool="pen"]').click();document.querySelector('[data-color="#e53935"]').click()`);
  await browser.wait(editor, '!sessionStorage.length');
  record('toolStyleChangesPrevious', await browser.evaluate(editor, `(async()=>{const {getCapture}=await import('../common/capture-store.js');const c=await getCapture('${id}');return {tool:document.querySelector('#active-tool-name').textContent,annotations:c.annotations}})()`));
  assert.equal(results.toolStyleChangesPrevious.annotations[0].color,'#e53935');
  await browser.evaluate(editor, `document.querySelector('[data-tool="pan"]').click();document.querySelector('#interaction-canvas').focus();document.querySelector('#interaction-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
  await browser.wait(editor, '!sessionStorage.length');
  record('panArrowMovesAnnotation', await browser.evaluate(editor, `(async()=>{const {getCapture}=await import('../common/capture-store.js');return {tool:document.querySelector('#active-tool-name').textContent,annotation:(await getCapture('${id}')).annotations[0],status:document.querySelector('#status').textContent}})()`));
  record('undoFromToolbarFocus', await browser.evaluate(editor, `(()=>{const b=document.querySelector('[data-tool="pen"]');b.focus();const before=document.querySelector('#annotation-list').options.length;b.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));return {before,after:document.querySelector('#annotation-list').options.length,undoAvailable:!document.querySelector('#undo-button').disabled,focus:document.activeElement.dataset.tool}})()`));
  await new Promise(r=>setTimeout(r,400));
  record('undoFromToolbarStoredState',await browser.evaluate(editor,`(async()=>{const {getCapture}=await import('../common/capture-store.js');return (await getCapture('${id}')).annotations[0]})()`));
  assert.deepEqual(results.undoFromToolbarStoredState,results.panArrowMovesAnnotation.annotation);
  // Two independent documents loaded from one capture: second editor overwrites first.
  const editor2 = await browser.open(editorUrl, false);
  await browser.wait(editor2, '!document.querySelector("#save-button").disabled');
  await browser.draw(editor, 'redact', [350,100], [500,250]);
  await browser.wait(editor, '!sessionStorage.length');
  record('twoTabFirstWrite',await browser.evaluate(editor,`(async()=>{const {getCapture}=await import('../common/capture-store.js');return (await getCapture('${id}')).annotations.map(a=>a.type)})()`));
  assert.ok(results.twoTabFirstWrite.includes('redact'));
  await browser.draw(editor2, 'marker', [200,400], [200,400]);
  await browser.wait(editor2, '!sessionStorage.length');
  record('twoTabDraftOverwrite', await browser.evaluate(editor2, `(async()=>{const {getCapture}=await import('../common/capture-store.js');return {stored:(await getCapture('${id}')).annotations.map(a=>a.type),status:document.querySelector('#status').textContent}})()`));
  assert.ok(!results.twoTabDraftOverwrite.stored.includes('redact'));
  await browser.captureScreenshot(editor, join(output, 'editor-desktop.png'));
  const layouts=[];
  for(const width of [1120,1000,960,901]) {
    await browser.setViewport(editor,width,600,1);
    layouts.push(await browser.evaluate(editor,`({width:innerWidth,height:innerHeight,header:document.querySelector('.editor-header').getBoundingClientRect().height,helpBottom:document.querySelector('#editor-keyboard-help').getBoundingClientRect().bottom,bodyOverflow:getComputedStyle(document.body).overflow})`));
  }
  record('editorMidWidthLayout',layouts);
  await browser.setViewport(editor, 390, 800, 1);
  await browser.captureScreenshot(editor, join(output, 'editor-390.png'));
  record('editorNarrow', await browser.evaluate(editor, `({viewport:innerWidth,actions:{client:document.querySelector('.top-actions').clientWidth,scroll:document.querySelector('.top-actions').scrollWidth},save:document.querySelector('#save-button').getBoundingClientRect().toJSON(),hint:{client:document.querySelector('.editor-hint').clientWidth,scroll:document.querySelector('.editor-hint').scrollWidth},height:document.body.scrollHeight})`));
  await browser.evaluate(editor2, `document.querySelector('.brand').click()`);
  await browser.wait(editor2, '!document.querySelector("#error-state").hidden');
  record('brandNavigation', await browser.evaluate(editor2, `({url:location.href,error:document.querySelector('#error-message').textContent})`));
  assert.equal(results.brandNavigation.error,'No temporary capture was specified.');
  // Positive boundary: transformed internal roots are rejected.
  await browser.evaluate(fixture, `document.body.innerHTML='<div id="scaled" style="transform:scale(.5);transform-origin:top left;width:800px;height:500px;overflow:auto;background:red"><div style="height:2000px">Scaled content</div></div>'`);
  await browser.activate(fixture);
  const protocol = `(async()=>{const [t]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.scripting.executeScript({target:{tabId:t.id},files:['content/capture-page.js']});const id=crypto.randomUUID();const p=chrome.tabs.connect(t.id,{name:'koalashot-capture:'+id});const req=m=>new Promise(r=>{const f=x=>{p.onMessage.removeListener(f);r(x)};p.onMessage.addListener(f);p.postMessage({...m,sessionId:id})});`;
  record('scaledInternal', await browser.evaluate(popup, protocol + `const ready=await req({type:'start',target:'internal'});const [m]=await chrome.scripting.executeScript({target:{tabId:t.id},func:()=>({rect:document.querySelector('#scaled').getBoundingClientRect().toJSON()})});await req({type:'restore'});p.disconnect();return {ready,actual:m.result}})()`));
  // A stale ping still reports success after a successfully started session is restored.
  await browser.evaluate(fixture, `document.body.innerHTML='<div style="height:3000px">Stale session audit</div>'`);
  record('stalePing', await browser.evaluate(popup, protocol + `const ready=await req({type:'start',target:'page'});await req({type:'restore'});const ping=await req({type:'ping'});p.disconnect();return {ready:ready.type,...ping}})()`));
  assert.equal(results.stalePing.ok,true);
  // Delay a screenshot after measuring scroll; alter actual scroll before the API call.
  await browser.evaluate(fixture, `document.body.innerHTML='<div style="height:3000px;background:linear-gradient(red,blue)">Post-measure scroll audit</div>'`);
  record('postMeasureScrollRace', await browser.evaluate(popup, `(async()=>{
    const {captureScreenshot}=await import('./capture-controller.js');const original=chrome.tabs.captureVisibleTab;let calls=0;
    chrome.tabs.captureVisibleTab=function(win,opts,cb){calls++;chrome.tabs.query({active:true,currentWindow:true}).then(([t])=>chrome.scripting.executeScript({target:{tabId:t.id},func:()=>window.scrollTo(0,Math.min(scrollY+90,document.documentElement.scrollHeight-innerHeight))})).then(()=>original.call(chrome.tabs,win,opts,cb))};
    try{const r=await captureScreenshot();return {outcome:'resolved',calls,warning:r.warning,width:r.width,height:r.height}}catch(e){return {outcome:e.code,message:e.message,calls}}finally{chrome.tabs.captureVisibleTab=original}
  })()`));
  assert.equal(results.postMeasureScrollRace.outcome,'resolved');
  // Expire the 15-second content watchdog while captureVisibleTab takes <20 seconds.
  await browser.evaluate(fixture, `document.body.innerHTML='<div style="height:100px">Watchdog audit</div>';document.body.style.minHeight='0';document.documentElement.style.minHeight='0'`);
  await new Promise(r=>setTimeout(r,1100));
  record('watchdogDuringScreenshot',await browser.evaluate(popup,`(async()=>{const {captureScreenshot}=await import('./capture-controller.js');const original=chrome.tabs.captureVisibleTab;let cleanedBeforeScreenshot=false;
    chrome.tabs.captureVisibleTab=function(win,opts,cb){setTimeout(async()=>{const [t]=await chrome.tabs.query({active:true,currentWindow:true});const [s]=await chrome.scripting.executeScript({target:{tabId:t.id},func:()=>!document.documentElement.classList.contains('koalashot-capturing')});cleanedBeforeScreenshot=s.result;original.call(chrome.tabs,win,opts,cb)},17500)};
    try{const r=await captureScreenshot();return {outcome:'resolved',cleanedBeforeScreenshot,warning:r.warning}}catch(e){return {outcome:e.code,message:e.message,cleanedBeforeScreenshot}}finally{chrome.tabs.captureVisibleTab=original}})()`));
  // Errors applying drafts must not be mistaken for successful redaction restoration.
  record('invalidDraftRestoration',await browser.evaluate(popup,`(async()=>{const {getCapture}=await import('../common/capture-store.js');await new Promise((resolve,reject)=>{const q=indexedDB.open('koalashot-captures',2);q.onsuccess=()=>{const db=q.result;const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({id:'${id}',annotations:[{id:'valid-redaction-1',type:'redact',x:0,y:0,width:300,height:300,color:'#111111'},{id:'bad-entry',type:'text',text:''}],crop:null});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}});const c=await getCapture('${id}');return {annotationCount:c.annotations.length,warning:c.warning||'',available:Boolean(c.blob)}})()`));
  for (const name of ['fixed-and-sticky','horizontal-overflow','scrollbar-layout','dynamic-height','lazy-loaded-content']) {
    await browser.navigate(fixture,`${base}/tests/fixtures/${name}.html`);
    await browser.activate(fixture);
    await new Promise(r=>setTimeout(r,1100));
    const captured=await browser.evaluate(popup,`(async()=>{const {captureScreenshot}=await import('./capture-controller.js');try{const c=await captureScreenshot();return {outcome:'resolved',width:c.width,height:c.height,warning:c.warning,bytes:c.blob.size}}catch(e){return {outcome:e.code,message:e.message}}})()`);
    const restored=await browser.evaluate(fixture,`({scrollY,captureClass:document.documentElement.classList.contains('koalashot-capturing'),captureStyle:Boolean(document.querySelector('#koalashot-capture-styles'))})`);
    record('fixture_'+name,{...captured,restored});
  }
  // Local landing/footer renders in both themes, at desktop and narrow widths.
  const landing = await browser.open(base+'/landing/',false);
  for (const width of [1440,390]) for (const theme of ['light','dark']) {
    await browser.setViewport(landing,width,900,1);
    await browser.socket.request('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]},landing.sessionId);
    await browser.evaluate(landing,'window.scrollTo(0,document.body.scrollHeight)');
    await browser.captureScreenshot(landing,join(output,`landing-footer-${width}-${theme}.png`));
  }
  record('landingLinks',await browser.evaluate(landing,`[...document.querySelectorAll('.site-footer a,[data-store]')].map(a=>({text:a.textContent,href:a.getAttribute('href'),hidden:a.hidden}))`));
} finally { await browser.stop(); await new Promise(r=>server.close(r)); }
console.log('Audit diagnostic probes completed.');

import assert from "node:assert/strict";
import { join } from "node:path";

export async function runUsabilityRegressions(browser, fixture, output) {
  const evaluate = (page, source) => browser.evaluate(page, source);
  const click = (page, id) => evaluate(page, `document.getElementById(${JSON.stringify(id)}).click()`);
  const popup = await browser.open(`chrome-extension://${browser.extensionId}/popup/popup.html`, false);
  await browser.wait(popup, "document.documentElement.dataset.koalashotReady === 'true'");
  await browser.setViewport(popup, 320, 600, 1);
  await evaluate(popup, "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const idle = () => browser.wait(popup, "document.body.dataset.phase === 'idle' && !document.querySelector('#edit-button').disabled");
  const choose = async target => {
    await evaluate(popup, `document.querySelector('#capture-target').value=${JSON.stringify(target)};document.querySelector('#capture-target').dispatchEvent(new Event('change'));document.querySelector('#capture-again-button').click()`);
  };
  const saved = async () => {
    try {
      await browser.wait(popup, "document.querySelector('#status').textContent === 'PNG save started.' && document.body.dataset.phase === 'idle'");
    } catch (error) {
      throw new Error(`Save did not complete: ${await evaluate(popup, "document.querySelector('#status').textContent")}`, {cause:error});
    }
    await evaluate(popup, "document.querySelector('#capture-preview').decode()");
  };
  const missingHints = page => evaluate(page, `[...document.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]')].filter(e=>!e.title && !e.dataset.tooltip).map(e=>e.id||e.textContent.trim())`);
  assert.deepEqual(await missingHints(popup), []);
  await evaluate(popup, "document.querySelector('#capture-target').focus()");
  assert.equal(await evaluate(popup, "!document.querySelector('#control-tooltip').hidden"), true);
  assert.equal(await evaluate(popup, "document.querySelector('#capture-target').getAttribute('aria-describedby').includes('capture-area-help')"), true);
  const tooltipBounds = await evaluate(popup, `(() => {const r=document.querySelector('#control-tooltip').getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom}})()`);
  assert.ok(tooltipBounds.left >= 0 && tooltipBounds.right <= 320 && tooltipBounds.bottom <= 600);
  await evaluate(popup, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal(await evaluate(popup, "document.querySelector('#control-tooltip').hidden"), true);
  assert.equal(await evaluate(popup, "document.querySelector('#capture-target').getAttribute('aria-describedby')"), "capture-area-help");
  assert.equal(await evaluate(popup, "document.documentElement.lang"), "en");
  assert.equal(await evaluate(popup, "[...document.querySelectorAll('footer a')].find(e=>e.textContent==='Help').href"), "https://shot.koalastuff.net/help/");

  await browser.setViewport(fixture, 1200, 800, 1);
  await browser.activate(fixture);
  await evaluate(fixture, `document.documentElement.style.cssText='';document.head.innerHTML='<title>Usability fixture</title>';document.body.style.cssText='margin:0';document.body.innerHTML='<div style="height:2400px;background:linear-gradient(#ff8800,#0000ff)">A normal long page</div>';window.scrollTo(0,600)`);
  await browser.wait(fixture, "scrollY === 600");
  const viewport = await evaluate(fixture, "({width:innerWidth,height:innerHeight})");
  // Observe the actual native response. Separate screenshots can differ while
  // Chromium paints a scroll or fades its scrollbar, even on a static fixture.
  await evaluate(popup, `(() => {
    globalThis.originalNativeCapture=chrome.tabs.captureVisibleTab;
    chrome.tabs.captureVisibleTab=function(windowId,options,callback){
      return globalThis.originalNativeCapture.call(chrome.tabs,windowId,options,dataUrl=>{
        globalThis.nativeCaptureDataUrl=dataUrl;callback(dataUrl);
      });
    };
  })()`);
  await choose("visible");
  try { await click(popup, "save-button"); await saved(); }
  finally { await evaluate(popup, "chrome.tabs.captureVisibleTab=globalThis.originalNativeCapture"); }
  const nativeSize = await evaluate(popup, `(async()=>{
    globalThis.nativeBaseline=new Image();globalThis.nativeBaseline.src=globalThis.nativeCaptureDataUrl;await globalThis.nativeBaseline.decode();
    return {width:globalThis.nativeBaseline.naturalWidth,height:globalThis.nativeBaseline.naturalHeight};
  })()`);
  assert.equal(await evaluate(fixture, "scrollY"), 600);
  assert.deepEqual(await evaluate(popup, "({width:document.querySelector('#capture-preview').naturalWidth,height:document.querySelector('#capture-preview').naturalHeight,warning:document.querySelector('#capture-warning').hidden})"), {...nativeSize,warning:true});
  assert.equal(await evaluate(popup, `(() => {
    const c=document.createElement('canvas');c.width=globalThis.nativeBaseline.naturalWidth;c.height=globalThis.nativeBaseline.naturalHeight;
    const x=c.getContext('2d');x.drawImage(globalThis.nativeBaseline,0,0);const expected=x.getImageData(0,0,c.width,c.height).data;
    x.clearRect(0,0,c.width,c.height);x.drawImage(document.querySelector('#capture-preview'),0,0);const actual=x.getImageData(0,0,c.width,c.height).data;
    return expected.every((value,index)=>actual[index]===value);
  })()`), true, "Visible capture must match the browser's native screenshot pixel for pixel");

  await choose("internal"); await click(popup, "save-button");
  await browser.wait(popup, "document.querySelector('#status').textContent.includes('No scrollable internal area') && document.body.dataset.phase === 'idle'");
  assert.equal(await evaluate(popup, "document.querySelector('#capture-visible-button').hidden"), false);
  await click(popup, "capture-visible-button"); await saved();
  assert.equal(await evaluate(popup, "document.querySelector('#capture-target').value"), "visible");
  assert.equal(await evaluate(fixture, "scrollY"), 600);

  await evaluate(popup, "globalThis.originalCreate=chrome.tabs.create;chrome.tabs.create=()=>{throw new Error('Injected editor launch failure')}");
  await choose("visible"); await click(popup, "edit-button");
  await browser.wait(popup, "document.querySelector('#status').textContent.includes('Screenshot captured, but the editor could not open') && document.body.dataset.phase === 'idle'");
  assert.equal(await evaluate(popup, "document.querySelector('#result-card').hidden"), false);
  assert.equal(await evaluate(popup, "document.querySelector('#capture-visible-button').hidden"), true);
  await evaluate(popup, "chrome.tabs.create=(...args)=>{globalThis.openedEditorUrl=args[0].url;return globalThis.originalCreate.apply(chrome.tabs,args)}");
  await click(popup, "edit-result-button"); await idle();
  const editorUrl = await evaluate(popup, "globalThis.openedEditorUrl");
  assert.ok(editorUrl?.includes('/editor/editor.html?capture='));
  const editor = await browser.existing(editorUrl);
  await browser.wait(editor, "!document.querySelector('#save-button').disabled");
  await browser.setViewport(editor, 1280, 900, 1);
  assert.deepEqual(await missingHints(editor), []);
  assert.equal(await evaluate(editor, "document.documentElement.lang"), "en");
  await evaluate(editor, "Object.defineProperty(navigator,'language',{configurable:true,value:'de-DE'})");
  assert.equal(await evaluate(editor, "(async()=>{const {t,language}=await import('../common/i18n.js');return language+':'+t('ui_save_edited_png')})()"), "en:Save edited PNG");
  await browser.draw(editor, "text", [100, 100], [100, 100]);
  await evaluate(editor, "document.querySelector('#text-input').value='Text survives a tool change';document.querySelector('[data-tool=rectangle]').click()");
  await browser.wait(editor, "document.querySelector('#draft-status').textContent === 'Draft saved locally'");
  assert.equal(await evaluate(editor, "document.querySelector('#text-editor').hidden"), true);
  assert.equal(await evaluate(editor, "document.querySelector('[data-tool=rectangle]').getAttribute('aria-pressed')"), "true");
  assert.equal(await evaluate(editor, `(async()=>{const {getCapture}=await import('../common/capture-store.js');return (await getCapture(new URLSearchParams(location.search).get('capture'))).annotations[0].text})()`), "Text survives a tool change");
  await browser.draw(editor, "text", [350, 300], [350, 300]);
  await evaluate(editor, "document.querySelector('#text-input').value='Text survives another text placement'");
  await browser.draw(editor, "text", [700, 500], [700, 500]);
  await evaluate(editor, "document.querySelector('#text-input').value='Text survives selecting another annotation';const list=document.querySelector('#annotation-list');globalThis.requestedAnnotation=list.options[1].value;list.value=globalThis.requestedAnnotation;list.dispatchEvent(new Event('change'))");
  await browser.wait(editor, "document.querySelector('#draft-status').textContent === 'Draft saved locally'");
  assert.equal(await evaluate(editor, "document.querySelector('#annotation-list').value === globalThis.requestedAnnotation"), true);
  assert.deepEqual(await evaluate(editor, `(async()=>{const {getCapture}=await import('../common/capture-store.js');return (await getCapture(new URLSearchParams(location.search).get('capture'))).annotations.map(a=>a.text)})()`), ["Text survives a tool change", "Text survives another text placement", "Text survives selecting another annotation"]);
  await browser.captureScreenshot(editor, join(output, "usability-editor.png"));

  await browser.activate(fixture);
  await evaluate(fixture, `document.head.innerHTML='<title>Internal area fallback</title><style>html,body{height:100%;margin:0}main{height:100%;display:grid;place-items:center}.inner{width:80%;height:65%;overflow:auto;background:#fff}section{height:1600px;background:linear-gradient(orange,blue)}</style>';document.body.innerHTML='<main><div class="inner"><section>Inner scroll content</section></div></main>';window.scrollTo(0,0)`);
  await choose("page"); await click(popup, "save-button"); await saved();
  assert.equal(await evaluate(popup, "document.querySelector('#capture-internal-button').hidden"), false);
  const fallbackLayout = await evaluate(popup, `({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,footerBottom:document.querySelector('footer').getBoundingClientRect().bottom})`);
  assert.ok(fallbackLayout.scrollWidth <= 320 && fallbackLayout.footerBottom <= 600, JSON.stringify(fallbackLayout));
  await browser.captureScreenshot(popup, join(output, "usability-visible-fallback.png"));
  await browser.activate(fixture);
  await click(popup, "capture-internal-button"); await saved();
  assert.equal(await evaluate(popup, "document.querySelector('#capture-preview').naturalHeight"), Math.round(1600 * nativeSize.height / viewport.height));
  assert.equal(await evaluate(popup, "document.querySelector('#capture-warning').hidden"), true);
  await browser.close(editor);
  await browser.close(popup);
  console.log("usability: visible capture, recovery actions, editor retry, tool switch, English UI and keyboard tooltips passed");
  return {tooltipBounds, fallbackLayout, language:"en", visibleCapture:{...nativeSize,scrollY:600,pixelsMatch:true}, internalRecovery:"1600 CSS pixels"};
}

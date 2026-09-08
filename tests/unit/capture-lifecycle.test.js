import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

async function fixture({ stuck = false, shrink = false } = {}) {
  const source = readFileSync(new URL("../../extension/popup/capture-controller.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\r?\n/gm, "");
  const stitcherUrl = new URL("../../extension/popup/stitcher.js", import.meta.url).href;
  const stubs = `
    import {generateCapturePositions,getBoundedDocumentHeight,StitchingError} from ${JSON.stringify(stitcherUrl)};
    export const hooks={requests:[],onEncode:null,onCapture:null}; let actualY=0;
    const CAPTURE_INTERVAL_MS=0,CAPTURE_REQUEST_TIMEOUT_MS=500,MAX_DYNAMIC_GROWTH_RATIO=.25,USER_MESSAGES={};
    const makeFilename=()=> 'audit.png';
    const makeCaptureId=()=> 'audit-session-0000001';
    const queryActiveTab=async()=>[{id:1,windowId:1,url:'https://example.test/private?token=secret#fragment'}];
    const injectCaptureScript=async()=>{}; const captureVisibleTab=async()=>{hooks.onCapture?.();return ''};
    function connectCapture(){let listener;return {onMessage:{addListener:f=>listener=f},onDisconnect:{addListener:()=>{}},disconnect(){},postMessage(m){
      hooks.requests.push(m.type);
      if(m.type==='scroll')actualY=${stuck}?0:m.requestedY;
      globalThis.queueMicrotask(()=>listener({ok:true,sessionId:m.sessionId,type:{start:'ready',scroll:'scrolled',restore:'restored',ping:'pong'}[m.type],documentHeight:${shrink}&&actualY>0?800:1600,viewportHeight:800,viewportWidth:1000,screenViewportWidth:1000,screenViewportHeight:800,captureRect:{left:0,top:0,width:1000,height:800},documentWidth:1200,actualX:0,actualY,pageUrl:'https://example.test/private?token=secret#fragment'}));
    }};}
    class PngStitcher{constructor(){this.outputWidth=1000;this.outputHeight=1600}updateDocumentHeight(){}async add(){}async toBlob(){hooks.onEncode?.();return new Blob(['png'])}clear(){}}
  `;
  return import(`data:text/javascript;base64,${Buffer.from(stubs + source + `\n// ${crypto.randomUUID()}`).toString("base64")}`);
}

test("capture rejects a stalled page and restores it without retries", async () => {
  const { captureScreenshot, hooks } = await fixture({ stuck: true });
  await assert.rejects(captureScreenshot(), { code: "scroll-stalled" });
  assert.equal(hooks.requests.filter(type => type === "scroll").length, 2);
  assert.equal(hooks.requests.at(-1), "restore");
});

test("capture rejects shrinking documents rather than exporting missing content", async () => {
  const { captureScreenshot } = await fixture({ shrink: true });
  await assert.rejects(captureScreenshot(), { code: "page-shrank" });
});

test("abort during final encoding never returns a screenshot", async () => {
  const { captureScreenshot, hooks } = await fixture();
  const controller = new AbortController(); hooks.onEncode = () => controller.abort();
  await assert.rejects(captureScreenshot({ signal: controller.signal }), { code: "cancelled" });
  assert.equal(hooks.requests.at(-1), "restore");
});

test("successful capture warns about horizontal truncation and retains only source origin", async () => {
  const { captureScreenshot } = await fixture();
  const result = await captureScreenshot();
  assert.equal(result.sourceUrl, "https://example.test");
  assert.match(result.warning, /right edge/);
});

// Deterministic audit fault injection. Real controller/history source, fake
// browser transport/canvas; complements, and does not replace, browser tests.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { DocumentHistory } from '../../../extension/editor/history.js';
const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const output=resolve(process.env.KOALASHOT_AUDIT_OUTPUT || join(root,'.cache/audit-2026-09-07'));
mkdirSync(output,{recursive:true});
const code=readFileSync(join(root,'extension/popup/capture-controller.js'),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
const stubs=`
import { generateCapturePositions,getBoundedDocumentHeight,StitchingError } from ${JSON.stringify(pathToFileURL(join(root,'extension/popup/stitcher.js')).href)};
const CAPTURE_INTERVAL_MS=0,CAPTURE_REQUEST_TIMEOUT_MS=1000,MAX_DYNAMIC_GROWTH_RATIO=.25,USER_MESSAGES={protectedPage:'protected'};
const makeCaptureId=()=> 'audit-session-0000001';
const queryActiveTab=async()=>[{id:1,windowId:1,url:'https://example.test/'}];
const injectCaptureScript=async()=>{};
const captureVisibleTab=async()=>'';
const metrics={documentHeight:1600,viewportHeight:800,viewportWidth:1000,pageUrl:'https://example.test/',actualY:0};
function connectCapture(){let listener;return {onMessage:{addListener:f=>listener=f},onDisconnect:{addListener:()=>{}},disconnect(){},postMessage(m){queueMicrotask(()=>listener({...metrics,ok:true,sessionId:m.sessionId}));}};}
class PngStitcher{updateDocumentHeight(){} async add(){} async toBlob(){return new Blob(['fake'])}clear(){}}
`;
const {captureScreenshot}=await import('data:text/javascript;base64,'+Buffer.from(stubs+code).toString('base64'));
const controller=new AbortController();
const sections=[];let outcome;
try {await captureScreenshot({signal:controller.signal,onProgress:p=>{if(p.current){sections.push(p.current);if(sections.filter(x=>x===2).length===5)controller.abort()}}});outcome='resolved';}
catch(e){outcome=e.code;}
assert.equal(outcome,'cancelled');
assert.equal(sections.filter(x=>x===2).length,5);
const anns=Array.from({length:300},(_,i)=>({id:`audit-${String(i).padStart(8,'0')}`,type:'pen',color:'#000000',strokeWidth:3,points:Array.from({length:500},(_,j)=>({x:j,y:i}))}));
const history=new DocumentHistory({annotations:anns,crop:null});
const timings=[];
for(let i=0;i<10;i++){const start=performance.now();const state=history.getState();state.annotations[0].points[0].x=i+1;history.apply('move',state);timings.push(Math.round(performance.now()-start));}
const results={noProgress:{sections,outcome,note:'Fault injection: constant actualY=0, stable documentHeight=1600. Explicit test abort after five attempts of section 2.'},history:{annotations:300,pointsPerAnnotation:500,historySteps:10,timingsMs:timings,heapUsedMiB:Math.round(process.memoryUsage().heapUsed/1024/1024),runtime:process.version,note:'Node microbenchmark, not a browser FPS measurement.'}};
writeFileSync(join(output,'model-results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));

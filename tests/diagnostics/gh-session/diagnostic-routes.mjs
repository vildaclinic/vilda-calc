// Isolated CI-v3 diagnostics only. Never imported by application code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory=path.join(process.env.RUNNER_TEMP || '', 'gh-session-diagnostic-refusal');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const resources=Object.freeze([
 {file:'vilda_data_import_export.js',version:'126',sourceSHA256:'0e805e7f0a95103176e3d46d30a3f747a6f16eef9fb7d81ee4893c6d60667c0c',clone:'observer.js',cloneSHA256:'ebaff321f97d7da5a8e48ab2a01ee5e981e31a6aea4e95884c7ea2587a88246a',publicMethod:'VildaDataImportExport.saveMainSessionNow',methodSHA256:'f2f320a9bf257170d28df4f41f6d7e2340ea1d3699896ece0c6e50a8628e400c'},
 {file:'vilda_panel_pacjent.js',version:'5',sourceSHA256:'703c0fed15df985a3fd0716af17b5abb15527f82f080c1cbb2926ce4118e1f9f',clone:'panel-observer.js',cloneSHA256:'85d535374ff13cb84f78e6d5f9bc81b616dc94025594f78b34317fc3e086745e',publicMethod:'VildaPanelPacjent.isWriteAuthorityCurrent',methodSHA256:'fa60a5ef5eb3650fefef3a325a71ccfc3bdf80237f3080e71dfed8f4a4e55b28'},
]);
export async function install(page,info){
 if(info.project.name!=='home-workspace-webkit'||info.title!=='home A2: native GH portal cancels purely and saves/imports the original therapy point · 390')throw Error('V3 routes restricted to original GH390');
 if(!Number.isInteger(info.repeatEachIndex)||!Number.isInteger(info.retry))throw Error('Missing diagnostic repeat/retry identity');
 const hits=[];
 for(const resource of resources){
  const clone=fs.readFileSync(path.join(directory,resource.clone));
  if(sha(clone)!==resource.cloneSHA256)throw Error('Frozen v3 clone drift: '+resource.file);
  await page.route('**/'+resource.file+'*',async route=>{
   const request=route.request(),url=new URL(request.url()),frameURL=request.frame().url(),frame=new URL(frameURL||'about:blank');
   if(url.origin!=='http://127.0.0.1:4173'||url.pathname!=='/'+resource.file||frame.origin!=='http://127.0.0.1:4173'||frame.pathname!=='/index.html')return route.fallback();
   if(url.search!=='?v='+resource.version)throw Error('Frozen v3 native resource version drift: '+resource.file);
   const response=await route.fetch(),body=await response.body();
   const hit={file:resource.file,url:request.url(),frameURL,nativeStatus:response.status(),nativeSHA256:sha(body),cloneSHA256:sha(clone),repeatEachIndex:info.repeatEachIndex,retry:info.retry,fulfilled:false};hits.push(hit);
   if(hit.nativeStatus!==200||hit.nativeSHA256!==resource.sourceSHA256)throw Error('Frozen v3 native response drift: '+resource.file);
   await route.fulfill({response,body:clone});hit.fulfilled=true;
  });
 }
 return hits;
}

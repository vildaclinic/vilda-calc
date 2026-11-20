// Isolated CI-v4 diagnostics only. Never imported by application code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory=path.join(process.env.RUNNER_TEMP || '', 'gh-session-diagnostic-refusal');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const resources=Object.freeze([
 {file:'vilda_data_import_export.js',version:'126',sourceSHA256:'0e805e7f0a95103176e3d46d30a3f747a6f16eef9fb7d81ee4893c6d60667c0c',clone:'observer.js',cloneSHA256:'3f19b549f4462847aa3f9b19466ebb0d1153350f2eb2365101596ed4188ac76d',publicMethod:'VildaDataImportExport.saveMainSessionNow',methodSHA256:'8f5b9167f38987f004d3e3dca805a6337ba586cb8daa6118e14b1ea89bbc42ef'},
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

// Static source/AST verification only. Never executes a native function or guard.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire}from'node:module';
import path from 'node:path';
import {execFileSync}from'node:child_process';
const root=path.resolve(process.argv[2]);
const directory=path.resolve(process.argv[3]);
const nativePath=path.join(root,'vilda_data_import_export.js');
const panelPath=path.join(root,'vilda_panel_pacjent.js');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const native=fs.readFileSync(nativePath,'utf8');const clone=fs.readFileSync(directory+'/observer.js','utf8');
assert.equal(sha(native),'0e805e7f0a95103176e3d46d30a3f747a6f16eef9fb7d81ee4893c6d60667c0c');assert.equal(sha(fs.readFileSync(panelPath)),'703c0fed15df985a3fd0716af17b5abb15527f82f080c1cbb2926ce4118e1f9f');
execFileSync(process.execPath,['--check',path.join(directory,'observer.js')],{stdio:'pipe'});
const changes=JSON.parse(fs.readFileSync(directory+'/reversal-manifest.json'));assert.equal(changes.length,2);
let base=clone;for(const c of [...changes].reverse()){assert.equal(base.split(c.new).length-1,c.count);base=base.replace(c.new,()=>c.old);}assert.equal(sha(base),'5db9849ab73111e236de1b37f83b14a4a636a59316f84356e93b78a0230cd674');
let reversed=base;for(const c of [...JSON.parse(fs.readFileSync(directory+'/base-reversal-manifest.json'))].reverse()){assert.equal(reversed.split(c.new).length-1,c.count);reversed=reversed.replace(c.new,()=>c.old);}assert(reversed===native,'Exact whole native byte reversal failed');
const acorn=createRequire(path.join(root,'package.json'))('acorn');assert.equal(acorn.version,'8.17.0');
const parse=s=>acorn.parse(s,{ecmaVersion:'latest',sourceType:'script',locations:true});const baseAST=parse(base),cloneAST=parse(clone),nativeAST=parse(native);
function walk(n,fn,parents=[]){if(!n||typeof n!=='object')return;if(Array.isArray(n)){for(const x of n)walk(x,fn,parents);return;}fn(n,parents);for(const[k,v]of Object.entries(n))if(!['start','end','loc','raw'].includes(k))walk(v,fn,[...parents,n]);}
const clean=n=>Array.isArray(n)?n.map(clean):n&&typeof n==='object'?Object.fromEntries(Object.keys(n).sort().filter(k=>!['start','end','loc','raw'].includes(k)).map(k=>[k,clean(n[k])])):n;
function findFunction(ast,name){const found=[];walk(ast,n=>{if(n.type==='FunctionDeclaration'&&n.id?.name===name)found.push(n)});assert.equal(found.length,1);return found[0];}
function observation(ast,stage){const found=[];walk(ast,n=>{if(n.type==='CallExpression'&&n.callee.name==='ghWriterObservation'&&n.arguments[0]?.value===stage)found.push(n)});assert.equal(found.length,1);return found[0];}
const stages=['carry.candidate-refused','oe.native-carry-refused'];const bodyProof=[];
function normalizeExisting(n){if(Array.isArray(n))return n.map(normalizeExisting);if(!n||typeof n!=='object')return n;if(n.type==='AssignmentExpression'&&n.left.name==='previousWitness'){assert.equal(n.operator,'=');assert.equal(n.right.name,'nativeSaveCarryWitness');return normalizeExisting(n.right);}return Object.fromEntries(Object.keys(n).sort().filter(k=>!['start','end','loc','raw'].includes(k)).map(k=>[k,normalizeExisting(n[k])]))}
const safeAddedValue=n=>n.type==='Literal'&&(['boolean','string'].includes(typeof n.value)||n.value===null)
 ||n.type==='BinaryExpression'&&['===','!=='].includes(n.operator)
 ||n.type==='UnaryExpression'&&n.operator==='!'
 ||n.type==='ConditionalExpression'&&safeAddedValue(n.consequent)&&safeAddedValue(n.alternate);
const restoredAST=structuredClone(cloneAST);
for(const stage of stages){
 const old=observation(baseAST,stage).arguments[1],next=observation(cloneAST,stage).arguments[1];assert.equal(old.type,'FunctionExpression');assert.equal(next.type,'FunctionExpression');assert.equal(next.params.length,0);
 const existing=next.body.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='detail'))?.declarations.find(d=>d.id.name==='detail').init;assert(existing);
 assert.deepEqual(normalizeExisting(existing),clean(old.body.body[0].argument));
 const oldCalls=[],newCalls=[];walk(old,n=>{if(n.type==='CallExpression')oldCalls.push(clean(n))});walk(next,n=>{if(n.type==='CallExpression')newCalls.push(normalizeExisting(n))});assert.deepEqual(newCalls,oldCalls);assert.equal(newCalls.length,2);
 let addedOutputProperties=0;
 walk(next,(n,parents)=>{
  assert(!['AwaitExpression','YieldExpression','NewExpression','UpdateExpression'].includes(n.type));
  if(n.type==='MemberExpression'&&!n.computed)assert(!['token','source','password','credential','getCurrentUser','captureWriteAuthority','isWriteAuthorityCurrent','isUnlocked','isGuestMode'].includes(n.property.name),'Forbidden opaque/API field read');
  if(n.type==='AssignmentExpression'){
   if(n.left.type==='Identifier'){assert.equal(n.left.name,'previousWitness');assert.equal(n.right.name,'nativeSaveCarryWitness');}
   else{assert.equal(n.left.type,'MemberExpression');assert(['detail','comparisons'].includes(n.left.object.name));if(n.left.object.name==='comparisons'){assert(safeAddedValue(n.right));addedOutputProperties++;}else{assert.equal(n.left.property.name,'postFalseComparisons');assert(['ObjectExpression','Identifier'].includes(n.right.type));}}
  }
  if(n.type==='ObjectExpression'){
   const originalDetail=parents.at(-1)?.type==='VariableDeclarator'&&parents.at(-1).id.name==='detail';
   if(!originalDetail){for(const p of n.properties){assert.equal(p.type,'Property');assert(safeAddedValue(p.value));addedOutputProperties++;}}
  }
 });
 const restored=observation(restoredAST,stage);restored.arguments[1]=structuredClone(old);
 bodyProof.push({stage,oldDiagnosticCalls:oldCalls.length,newDiagnosticCalls:newCalls.length,callOrderAndArgumentsUnchanged:true,originalDetailObjectAndFieldOrderPreserved:true,onlyNullableBooleanOrStaticStringAddedProperties:addedOutputProperties,noNewNativeOrGetterAPICalls:true,noTokenSourceCredentialReadOrOpaqueOutput:true});
}
assert.deepEqual(clean(restoredAST),clean(baseAST));
const guardByteProof={};for(const name of ['nativeSaveCarryCurrent','mainSessionWriteAuthorityCurrent']){const a=findFunction(nativeAST,name),b=findFunction(cloneAST,name);assert.equal(clone.slice(b.start,b.end),native.slice(a.start,a.end));guardByteProof[name]=sha(clone.slice(b.start,b.end));}
let siteCount=0;walk(cloneAST,n=>{if(n.type==='CallExpression'&&n.callee.name==='ghWriterObservation')siteCount++});assert.equal(siteCount,19);
const helpers=new Set(['ghWriterObservation','ghWriterObservationScope','ghWriterObservationCarry']);const obs=n=>n?.type==='ExpressionStatement'&&n.expression?.type==='CallExpression'&&n.expression.callee.name==='ghWriterObservation';const obsElse=n=>n?.type==='BlockStatement'&&n.body.length===1&&obs(n.body[0]);
function strip(n){if(Array.isArray(n))return n.filter(x=>!obs(x)&&!(x.type==='FunctionDeclaration'&&helpers.has(x.id?.name))).map(strip);if(!n||typeof n!=='object')return n;const r={};for(const k of Object.keys(n).sort()){if(['start','end','loc','raw'].includes(k))continue;r[k]=k==='alternate'&&n.type==='IfStatement'&&obsElse(n.alternate)?null:strip(n[k]);}if(r.type==='IfStatement')for(const k of ['consequent','alternate'])if(r[k]?.type==='BlockStatement'&&r[k].body.length===1&&r[k].body[0].type==='ReturnStatement')r[k]=r[k].body[0];return r;}
const canonical=JSON.stringify(strip(nativeAST));assert.equal(sha(canonical),'78e8ac32a235245dae0089439c2b992755fc79d6a414192c6cd381c5dd9ad33b');assert.equal(JSON.stringify(strip(cloneAST)),canonical);
const oe=findFunction(cloneAST,'oe');const proof=JSON.parse(fs.readFileSync(directory+'/proof.json'));
proof.syntax={result:'PASS',parser:'acorn8.17.0',nodeCheck:'PASS',nativeRuntimeExecuted:false};proof.astEquivalence={result:'PASS',canonicalNativeASTSHA256:sha(canonical),wholeV4ASTEquals5dbAfterOnlyTwoExistingCallbackReplacements:true,originalDataGuardsByteExactToNative0e805:guardByteProof,existingObserverCallSites:19};proof.falseDetailBodyProof=bodyProof;proof.writerFunctionSourceSHA256=sha(clone.slice(oe.start,oe.end));
fs.writeFileSync(directory+'/proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({cloneSHA256:sha(clone),writerFunctionSourceSHA256:proof.writerFunctionSourceSHA256,ast:'PASS',onlyTwoExistingCallbacks:true,existingObserverSites:19,guardBodiesByteExact:true}));

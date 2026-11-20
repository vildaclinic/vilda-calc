// Static source/AST proof only. No native function or guard is invoked.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]);
const dir=path.resolve(process.argv[3]);
const source=path.join(root,'vilda_data_import_export.js');
const require=createRequire(path.join(root,'package.json'));
const acorn=require('acorn');assert.equal(acorn.version,'8.17.0');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const original=fs.readFileSync(source,'utf8');const clone=fs.readFileSync(dir+'/observer.js','utf8');
assert.equal(sha(original),'0e805e7f0a95103176e3d46d30a3f747a6f16eef9fb7d81ee4893c6d60667c0c');
let restored=clone;
for(const c of [...JSON.parse(fs.readFileSync(dir+'/v3-reversal-manifest.json'))].reverse()){assert.equal(restored.split(c.new).length-1,c.count);restored=restored.replace(c.new,()=>c.old);}
assert.equal(sha(restored),'5db9849ab73111e236de1b37f83b14a4a636a59316f84356e93b78a0230cd674');
let whole=restored;
for(const c of [...JSON.parse(fs.readFileSync(dir+'/base-reversal-manifest.json'))].reverse()){assert.equal(whole.split(c.new).length-1,c.count);whole=whole.replace(c.new,()=>c.old);}
assert(whole===original,'Entire original source did not reverse byte exact');
const parse=s=>acorn.parse(s,{ecmaVersion:'latest',sourceType:'script',locations:true});
execFileSync(process.execPath,['--check',path.join(dir,'observer.js')],{stdio:'pipe'});
const nativeAST=parse(original),cloneAST=parse(clone),baseAST=parse(restored);
function visit(node,fn,ancestors=[]){if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const n of node)visit(n,fn,ancestors);return;}fn(node,ancestors);for(const[k,v]of Object.entries(node))if(!['start','end','loc','raw'].includes(k))visit(v,fn,[...ancestors,node]);}
function find(ast,name){const found=[];visit(ast,n=>{if(n.type==='FunctionDeclaration'&&n.id?.name===name)found.push(n);});assert.equal(found.length,1);return found[0];}
const markerNames=new Set(['ghCarryOperand','ghAuthorityOperand','ghPanelAuthorityEvaluated']);
const resultNames=new Set(['ghPanelIdentityResult','ghPanelAuthorityResult']);
const markerAssignment=n=>n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&markerNames.has(n.left.name);
function normalize(n){
 if(Array.isArray(n))return n.map(normalize);
 if(!n||typeof n!=='object')return n;
 if(n.type==='SequenceExpression'){
  const expressions=n.expressions.filter(e=>!markerAssignment(e));assert.equal(expressions.length,1);return normalize(expressions[0]);
 }
 if(n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&resultNames.has(n.left.name))return normalize(n.right);
 return Object.fromEntries(Object.keys(n).sort().filter(k=>!['start','end','loc','raw'].includes(k)).map(k=>[k,normalize(n[k])]));
}
const oldCarry=find(nativeAST,'nativeSaveCarryCurrent'),newCarry=find(cloneAST,'nativeSaveCarryCurrent');
assert.equal(oldCarry.body.body.length,1);assert.equal(newCarry.body.body.length,4);
assert.equal(newCarry.body.body[0].type,'VariableDeclaration');assert.equal(newCarry.body.body[0].declarations[0].id.name,'ghCarryOperand');
assert.equal(newCarry.body.body[1].type,'VariableDeclaration');assert.equal(newCarry.body.body[1].declarations[0].id.name,'ghCarryResult');
assert.deepEqual(normalize(oldCarry.body.body[0].argument),normalize(newCarry.body.body[1].declarations[0].init));
assert.equal(newCarry.body.body[2].type,'IfStatement');assert.equal(newCarry.body.body[2].test.operator,'!');assert.equal(newCarry.body.body[2].test.argument.name,'ghCarryResult');
assert.equal(newCarry.body.body[3].type,'ReturnStatement');assert.equal(newCarry.body.body[3].argument.name,'ghCarryResult');
const oldAuthority=find(nativeAST,'mainSessionWriteAuthorityCurrent'),newAuthority=find(cloneAST,'mainSessionWriteAuthorityCurrent');
assert.equal(oldAuthority.body.body.length,1);assert.equal(newAuthority.body.body.length,2);
const oldTry=oldAuthority.body.body[0],newTry=newAuthority.body.body[1];assert.equal(oldTry.type,'TryStatement');assert.equal(newTry.type,'TryStatement');
assert.deepEqual(normalize(oldTry.block.body[0].test),normalize(newTry.block.body[0].test));
assert.deepEqual(normalize(oldTry.block.body[1].argument),normalize(newTry.block.body[1].declarations[0].init));
assert.equal(newTry.block.body.length,4);assert.equal(newTry.block.body[2].type,'IfStatement');assert.equal(newTry.block.body[2].test.argument.name,'ghAuthorityResult');
assert.equal(newTry.block.body[3].type,'ReturnStatement');assert.equal(newTry.block.body[3].argument.name,'ghAuthorityResult');
assert.deepEqual(normalize(oldTry.handler.body.body[0]),normalize(newTry.handler.body.body.at(-1)));
assert.deepEqual(normalize(oldTry.block.body[0].consequent),normalize(newTry.block.body[0].consequent.body.at(-1)));
assert.equal(newTry.handler.param,null);assert.equal(oldTry.handler.param,null);
const functionProof=[];
for(const name of ['nativeSaveCarryCurrent','mainSessionWriteAuthorityCurrent']){
 const a=find(nativeAST,name),b=find(cloneAST,name),nativeCalls=[],generatedCalls=[];
 const collect=(fn,target)=>visit(fn,n=>{if(n.type==='CallExpression'&&n.callee.name!=='ghWriterObservation')target.push(normalize(n));});
 collect(a,nativeCalls);collect(b,generatedCalls);assert.deepEqual(nativeCalls,generatedCalls);
 const originalGetters=[],generatedGetters=[];
 const getters=(fn,list)=>visit(fn,(n,parents)=>{if(n.type==='MemberExpression'){
  const inObservation=parents.some(p=>p.type==='CallExpression'&&p.callee.name==='ghWriterObservation');if(!inObservation)list.push(normalize(n));
 }});
 getters(a,originalGetters);getters(b,generatedGetters);assert.deepEqual(originalGetters,generatedGetters);
 const observationSites=[];
 visit(b,(n,parents)=>{
  if(n.type==='CallExpression'&&n.callee.name==='ghWriterObservation'){
   const statement=parents.at(-1);assert.equal(statement.type,'ExpressionStatement');
   const parent=parents.at(-2);const catchParent=parents.some(p=>p.type==='CatchClause');
   const negativeGuard=parent?.type==='IfStatement'&&parent.test?.type==='UnaryExpression'&&parent.test.operator==='!'&&['ghCarryResult','ghAuthorityResult'].includes(parent.test.argument?.name);
   const originalInitialRefusal=parent?.type==='BlockStatement'&&parent.body.at(-1)?.type==='ReturnStatement'&&parent.body.at(-1).argument?.value===false;
   assert(negativeGuard||catchParent||originalInitialRefusal);
   observationSites.push({stage:n.arguments[0].value,line:n.loc.start.line,onlyAfterFalseOrOriginalCatch:true});
  }
  if(['ObjectExpression','ArrayExpression','FunctionExpression','ArrowFunctionExpression'].includes(n.type))assert(parents.some(p=>p.type==='CallExpression'&&p.callee.name==='ghWriterObservation'));
 });
 functionProof.push({name,originalCalls: nativeCalls.length,generatedCalls:generatedCalls.length,originalPropertyReads:originalGetters.length,generatedPropertyReads:generatedGetters.length,
  originalBooleanExpressionTreesByteShapeEqualAfterRemovingOnlyLocalMarkers:true,noAddedGuardCalls:true,noAddedNativePropertyReads:true,allObservationSitesAfterRefusalOrOriginalCatch:observationSites});
}
// Independently recover canonical full native AST from the approved refusal-only base.
const helpers=new Set(['ghWriterObservation','ghWriterObservationScope','ghWriterObservationCarry']);
const observation=n=>n?.type==='ExpressionStatement'&&n.expression?.type==='CallExpression'&&n.expression.callee?.name==='ghWriterObservation';
const observerElse=n=>n?.type==='BlockStatement'&&n.body.length===1&&observation(n.body[0]);
function strip(n){
 if(Array.isArray(n))return n.filter(x=>!observation(x)&&!(x.type==='FunctionDeclaration'&&helpers.has(x.id?.name))).map(strip);
 if(!n||typeof n!=='object')return n;
 const r={};for(const k of Object.keys(n).sort()){
  if(['start','end','loc','raw'].includes(k))continue;
  r[k]=k==='alternate'&&n.type==='IfStatement'&&observerElse(n.alternate)?null:strip(n[k]);
 }
 if(r.type==='IfStatement')for(const k of ['consequent','alternate'])if(r[k]?.type==='BlockStatement'&&r[k].body.length===1&&r[k].body[0].type==='ReturnStatement')r[k]=r[k].body[0];
 return r;
}
const canonical=JSON.stringify(strip(nativeAST));assert.equal(JSON.stringify(strip(baseAST)),canonical);assert.equal(sha(canonical),'78e8ac32a235245dae0089439c2b992755fc79d6a414192c6cd381c5dd9ad33b');
const proof=JSON.parse(fs.readFileSync(dir+'/proof.json'));proof.syntax={result:'PASS',parser:'acorn8.17.0',nativeRuntimeExecuted:false};proof.expressionASTProof={result:'PASS',functions:functionProof,
 method:'Compare original expression ASTs with generated expressions after removing only local scalar marker assignment sequences/result assignments. Native logical operator trees, native call/property AST traversal order and counts are identical. Verify added statements only store result, observe false/original catch, and return exact original result.'};
proof.canonicalFullNativeASTSHA256=sha(canonical);proof.fullReverseToNative0e805ByteExact=true;
const writer=find(cloneAST,'oe');proof.writerFunctionSourceSHA256=sha(clone.slice(writer.start,writer.end));
assert.equal(proof.writerFunctionSourceSHA256,'f2f320a9bf257170d28df4f41f6d7e2340ea1d3699896ece0c6e50a8628e400c');
proof.syntax.nodeCheck='PASS';let sites=0;visit(cloneAST,n=>{if(n.type==='CallExpression'&&n.callee.name==='ghWriterObservation')sites++;});assert.equal(sites,23);proof.observationCallSiteCount=sites;
fs.writeFileSync(dir+'/proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({cloneSHA256:sha(clone),expressionASTProof:'PASS',reverseEntireSource:true,functions:functionProof}));

// Mechanical extraction of the existing DocPro presentation, without editing
// its numerical functions, thresholds, reference data or rendered output.
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'espree';

const args = process.argv.slice(2);
if (args.some(arg => !/^--(?:input|output)=.+/.test(arg))) throw Error('Usage: --input=<original> --output=<extracted>');
const path = new URL('../sga_birth_module.js', import.meta.url);
const input = args.find(arg => arg.startsWith('--input='))?.slice(8) || path;
const destination = args.find(arg => arg.startsWith('--output='))?.slice(9) || path;
const source = readFileSync(input, 'utf8');
if (source.includes('function buildSgaPresentation(')) throw Error('Presentation already extracted');
const outer = parse(source, { ecmaVersion: 'latest', range: true }).body[0].expression.callee.body.body;
const controller = outer.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'le');
const functions = controller.body.body.filter(node => node.type === 'FunctionDeclaration');
const names = ['je', 'tt', 'ge', 'nt', 'it', 'at', 'te', 'Ee', 'me', 'rt', 'Ge', 'pe', 'Ie', 'ot', 'st', 'lt'];
const moved = names.map(name => {
  if (outer.some(node => node.type === 'FunctionDeclaration' && node.id.name === name)) throw Error('Name collision: ' + name);
  const node = functions.find(node => node.id.name === name);
  if (!node) throw Error('Missing native function: ' + name);
  return node;
});
const calculate = functions.find(node => node.id.name === 'fe');
const errors = [];
let html;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'BlockStatement') node.body.forEach((statement, index) => {
    const expression = statement.type === 'ExpressionStatement' && statement.expression;
    const first = expression && expression.type === 'SequenceExpression' && expression.expressions[0];
    if (first && first.type === 'CallExpression' && first.callee.name === 'I' && first.arguments[1]?.value === 'error') {
      const next = node.body[index + 1];
      if (next?.type !== 'ReturnStatement' || next.argument) throw Error('Unexpected native error branch');
      errors.push({ start: statement.range[0], end: next.range[1], text: 'return { error: ' + source.slice(...first.arguments[0].range) + ' };' });
    }
  });
  if (node.type === 'CallExpression' && node.callee.name === 'Oe' && node.arguments[0]?.name === 'r') html = source.slice(...node.arguments[1].range);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'range') continue;
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(calculate.body);
if (errors.length !== 10 || !html) throw Error('Native calculation structure changed: ' + errors.length);
let evaluation = source.slice(...calculate.range);
for (const edit of errors.sort((a, b) => b.start - a.start)) {
  const start = edit.start - calculate.range[0], end = edit.end - calculate.range[0];
  evaluation = evaluation.slice(0, start) + edit.text + evaluation.slice(end);
}
const validation = evaluation.indexOf('if([c,v,g]');
if (validation < 0) throw Error('Missing native input validation');
evaluation = `function buildSgaPresentation(state) {
  const n=je(state.sourceKeys||state.sourceChoice||"niklasson"),o=n.length>1,l=state.sex,
    h=Number(state.weeks),p=Number(state.days==null?"":state.days),
    c=ie(state.weight),v=ie(state.length),g=ie(state.head);
  ` + evaluation.slice(validation);
const predicate = '[c,v,g].some((T,$)=>{const A=[m,C,R][$];return A&&A.value.trim()!==""&&!Number.isFinite(T)})';
if (!evaluation.includes(predicate)) throw Error('Missing native format predicate');
evaluation = evaluation.replace(predicate, '[c,v,g].some((value,index)=>{const raw=[state.weight,state.length,state.head][index];return String(raw==null?"":raw).trim()!==""&&!Number.isFinite(value)})');
// A radio group can only produce these values. The shared entry also accepts
// drafts, so an unknown sex must retain the existing "choose sex" refusal.
evaluation = evaluation.replace('if(!l)', 'if(l!=="male"&&l!=="female")');
const sink = evaluation.indexOf('Oe(r,');
if (sink < 0) throw Error('Missing native result sink');
evaluation = evaluation.slice(0, sink) + 'return { error: null, html: ' + html + ', models:k, notes:[...W,...L] };\n}';
const nativeCalculate = `function fe(e=!0){
  e!==!1&&(birthBeginCalculation(),birthProducerGeneration+=1,birthAssessmentSnapshot=null);
  const view=buildSgaPresentation(dt(SGA_READONLY_CAPTURE));
  if(view.error){I(view.error,"error"),r.style.display="none",_(r);return}
  Oe(r,view.html,"sga-birth:resultsEl"),r.style.display="block",r.dataset.hasComputed="1",I("","");
  e!==!1&&window.VildaBirthAssessment&&(birthAssessmentSnapshot=window.VildaBirthAssessment.create(dt(SGA_READONLY_CAPTURE),view.models,void 0,view.notes));
  e&&Qe("Wykonano obliczenia.");
}`;
const edits = [...moved.map(node => ({ start: node.range[0], end: node.range[1], text: '' })),
  { start: calculate.range[0], end: calculate.range[1], text: nativeCalculate }];
let output = source;
for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
const shared = moved.map(node => source.slice(...node.range)).join('\n') + '\n' + evaluation + '\n';
output = output.replace('var Ae={', shared + 'var Ae={');
output = output.replace('compute:qe}', 'compute:qe,evaluatePresentation:buildSgaPresentation}');
parse(output, { ecmaVersion: 'latest' });
writeFileSync(destination, output);
console.log('Extracted ' + moved.length + ' unchanged native helpers and the DocPro presentation workflow.');

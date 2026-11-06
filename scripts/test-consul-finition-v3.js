'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = process.cwd();
const html = fs.readFileSync(path.join(root,'public/dashboard-consul.html'),'utf8');
const css = fs.readFileSync(path.join(root,'public/sateer-consul-finition.css'),'utf8');
const js = fs.readFileSync(path.join(root,'public/sateer-consul-finition.js'),'utf8');
const styleA = html.indexOf('sateer-consul-theme.css');
const styleB = html.indexOf('sateer-consul-finition.css');
const scriptA = html.indexOf('sateer-consul-theme.js');
const scriptB = html.indexOf('sateer-consul-finition.js');
assert(styleA>=0 && styleB>styleA && scriptA>=0 && scriptB>scriptA);
assert.match(css,/background:\s*#f6f8fb\s*!important/);
assert.match(css,/\.page \.section[\s\S]*?border-left:\s*5px solid/i);
assert.match(css,/\.sateer-strat-kpi--accent/);
assert.match(css,/\.sateer-consul-return-visible/);
console.log('PASS: theme charge en dernier, sections bleutees et cartes contrastees');
const relativeLuminance = (hex) => {
  let nums = hex.match(/[a-fA-F0-9]{2}/g).map(s => parseInt(s,16)/255);
  nums = nums.map(c => c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  return nums[0]*.2126 + nums[1]*.7152 + nums[2]*.0722;
};
const contrast = (a,b) => {
  const x=relativeLuminance(a),y=relativeLuminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
for (const [foreground,background,name] of [
  ['#16324f','#eaf1fa','bandeau clair'],
  ['#ffffff','#143955','bouton retour'],
  ['#102d49','#edf4fb','section'],
  ['#314b61','#e8f1fa','texte secondaire'],
  ['#10314d','#f6f9fd','chiffres'],
  ['#893312','#fff0df','urgence'],
]) {
  const ratio=contrast(foreground,background);
  assert(ratio >= 4.5, `${name}: contraste ${ratio.toFixed(2)} insuffisant`);
}
console.log('PASS: contrastes WCAG AA (6 couples, texte normal)');
function stylable() {
  const values={};
  return {values,setProperty(k,v,priority){assert.equal(priority,'important');values[k]=v;}};
}
const body={classList:{values:new Set(),add(x){this.values.add(x);}}};
const hstyle=stylable(), tstyle=stylable(), lstyle=stylable();
const eyebrow={classList:{contains(x){return x==='eyebrow';}},style:stylable()};
const heading={textContent:'Dashboard stratégique',style:tstyle};
const header={id:'',style:hstyle,classList:{add(){}},querySelectorAll(){return [heading,eyebrow];}};
heading.closest=()=>header;
const link={textContent:'← Retour à Mon Consulat',style:lstyle,
  classList:{values:new Set(),add(x){this.values.add(x);}},
  getAttribute(k){return k==='href'?'/consulat.html?organisation=70&tenant=P6V_3B5AC5AB9DB04657':null;}};
const doc={readyState:'complete',body,getElementById(id){return id==='dashboardContenu'?{}:null;},
  querySelectorAll(q){if(q==='h1')return [heading];if(q==='a[href]')return [link];return [];},
  querySelector(){return null;}};
vm.runInNewContext(js,{document:doc});
assert.equal(hstyle.values.background,'#eaf1fa');
assert.equal(tstyle.values.color,'#16324f');
assert.equal(eyebrow.style.values.color,'#193850');
assert.equal(lstyle.values.color,'#ffffff');
assert.equal(lstyle.values.background,'#143955');
assert(link.classList.values.has('sateer-consul-return-visible'));
assert.equal(link.getAttribute('href'),'/consulat.html?organisation=70&tenant=P6V_3B5AC5AB9DB04657');
console.log('PASS: en-tete clair force apres anciens styles et bouton retour contraste');
const otherBody={classList:{values:new Set(),add(x){this.values.add(x);}}};
const otherDoc={...doc,body:otherBody,getElementById(){return null;}};
vm.runInNewContext(js,{document:otherDoc});
assert.equal(otherBody.classList.values.size,0);
console.log('PASS: aucune intervention sur les autres pages');
console.log('BORDEAUX_CONSUL_FINITION_CLAIR_V4_PASS : 4/4');

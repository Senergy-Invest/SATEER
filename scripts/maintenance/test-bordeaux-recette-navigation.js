'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../../public/sateer-bordeaux-recette-nav.js'),'utf8');
function run({port='3200',org='70',tenant='P6V_3B5AC5AB9DB04657',path='/dashboard-vice-consul.html'}={}) {
  let inserted=0,linkHref='';
  const root={prepend(n){inserted++;const link=n.children?.find(x=>x.tag==='a');linkHref=link?.href;}};
  const document={
    querySelector(v){return v==='main'?root:null;},
    getElementById(){return null;},
    createElement(tag){return {tag,children:[],style:{},setAttribute(){},append(n){this.children.push(n);}};}
  };
  const window={location:{hostname:'127.0.0.1',port,pathname:path,search:'?'+new URLSearchParams({organisation:org,tenant})}};
  vm.runInNewContext(script,{window,document,URLSearchParams});
  return {inserted,linkHref};
}
test('dashboard consulat Bordeaux: lien explicite vers simulation locale',()=>{
  assert.equal(run().inserted,1);
  assert.equal(run().linkHref,'http://127.0.0.1:3300/bordeaux-catalogue-recette.html');
});
test('catalogue Bordeaux: lien visible',()=>{
  assert.equal(run({path:'/catalogue-demarches.html'}).inserted,1);
});
test('organisations, tenants, autres pages et ports: aucun lien',()=>{
  for (const v of [{org:'71'},{tenant:'INCONNU'},{port:'3300'},{path:'/consulat.html'}]) {
    assert.equal(run(v).inserted,0);
  }
});

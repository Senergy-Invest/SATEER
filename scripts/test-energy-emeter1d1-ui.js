'use strict';
/** E-METER-1D1 : régression de courses asynchrones UI, DOM simulé, zéro réseau réel. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const TENANT='ENERGY_MVP01D_RECETTE';
const S1='123e4567-e89b-42d3-a456-426614174000';
const S2='123e4567-e89b-42d3-a456-426614174001';
const js=fs.readFileSync(path.join(__dirname,'../public/energie-import.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function element(){return {
 listeners:{},dataset:{},classList:{toggle(){}},textContent:'',disabled:false,checked:false,
 files:[],value:'',children:[],href:'',
 addEventListener(type,fn){this.listeners[type]=fn},
 async fire(type){const f=this.listeners[type];if(f)return f();},
 replaceChildren(...items){this.children=items},append(x){this.children.push(x)}
};}
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const csv='registre_id,releve_le,valeur_index,observation\n'+S1+',2026-11-20T10:00:00Z,230,Fictif';
const file=s=>{const bytes=new TextEncoder().encode(s);return {size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer}};
const aperçu=()=>({importPossible:true,fichierSha256:'a'.repeat(64),total:1,admissibles:1,refusees:0,
 lignes:[{numero:2,registreId:S1,releveLe:'2026-11-20T10:00:00.000Z',valeur:'230',unite:'KWH',statut:'ADMISSIBLE'}]});
async function setup(previewHandler,validateHandler){
 const elements=new Map();const $=k=>elements.get(k)||elements.set(k,element()).get(k);
 let previewCalls=0,validateCalls=0;const keys=[];
 const fetch=async(url,opts={})=>{
  if(url.includes('/sites/')&&url.includes('/apercu')){previewCalls++;return previewHandler?previewHandler(url,opts):response(aperçu());}
  if(url.includes('/sites/')&&url.includes('/valider')){validateCalls++;keys.push(opts.headers['Idempotency-Key']);return validateHandler?validateHandler(url,opts,validateCalls):response({total:1,nouveau:true,fichierSha256:'a'.repeat(64)});}
  if(url.includes('/sites'))return response({sites:[{id:S1,nom:'A',pays:'SN'},{id:S2,nom:'B',pays:'SN'}],suivant:false});
  throw Error('REQUETE_INATTENDUE');
 };
 const context={document:{getElementById:$,createElement:element},window:{SATEER_CONTEXT_READY:Promise.resolve({organisations:[{tenant_code:TENANT}]})},
  location:{search:'?tenant='+TENANT},URLSearchParams,fetch,TextDecoder,crypto:{randomUUID:()=>S1}};
 vm.runInNewContext(js,context,{filename:'energie-import.js'});await tick();await tick();
 assert.equal($('site').value,S1);
 return {$,calls:()=>({previewCalls,validateCalls,keys})};
}
test('changement de site pendant aperçu retardé : réponse ignorée',async()=>{
 const d=deferred(),x=await setup(()=>d.promise);x.$('csv').files=[file(csv)];await x.$('csv').fire('change');
 const pending=x.$('apercu').fire('click');await tick();assert.equal(x.$('site').disabled,true);
 x.$('site').value=S2;await x.$('site').fire('change');d.resolve(response(aperçu()));await pending;
 assert.equal(x.$('consentement').disabled,true);assert.equal(x.$('valider').disabled,true);
 assert.equal(x.$('bilan').textContent,'Aucun fichier prévisualisé.');
});
test('changement de fichier pendant aperçu retardé : réponse ignorée',async()=>{
 const d=deferred(),x=await setup(()=>d.promise);x.$('csv').files=[file(csv)];await x.$('csv').fire('change');
 const pending=x.$('apercu').fire('click');await tick();x.$('csv').files=[file(csv+'\n')];await x.$('csv').fire('change');
 d.resolve(response(aperçu()));await pending;assert.equal(x.$('consentement').disabled,true);
});
test('double clic aperçu : une seule requête déclenchée',async()=>{
 const d=deferred(),x=await setup(()=>d.promise);x.$('csv').files=[file(csv)];await x.$('csv').fire('change');
 const p1=x.$('apercu').fire('click'),p2=x.$('apercu').fire('click');d.resolve(response(aperçu()));await Promise.all([p1,p2]);
 assert.equal(x.calls().previewCalls,1);assert.equal(x.$('consentement').disabled,false);
});
test('aperçu valide et consentement : échec réseau puis rejeu avec même clé',async()=>{
 const x=await setup(null,(_url,_opts,count)=>count===1?response({statut:'IMPORT_INDISPONIBLE'},503):response({total:1,nouveau:true,fichierSha256:'a'.repeat(64)}));
 x.$('csv').files=[file(csv)];await x.$('csv').fire('change');await x.$('apercu').fire('click');
 x.$('consentement').checked=true;await x.$('consentement').fire('change');
 assert.equal(x.$('valider').disabled,false);await x.$('valider').fire('click');
 assert.equal(x.$('valider').disabled,false);await x.$('valider').fire('click');
 const c=x.calls();assert.equal(c.validateCalls,2);assert.equal(c.keys[0],c.keys[1]);
 assert.equal(x.$('consentement').disabled,true);assert.match(x.$('resultat').textContent,/historique privé/);
});
test('changement après aperçu : interdit la confirmation périmée',async()=>{
 const x=await setup();x.$('csv').files=[file(csv)];await x.$('csv').fire('change');await x.$('apercu').fire('click');
 x.$('site').value=S2;await x.$('site').fire('change');x.$('consentement').checked=true;
 await x.$('consentement').fire('change');await x.$('valider').fire('click');
 assert.equal(x.calls().validateCalls,0);
});

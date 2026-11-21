'use strict';
/** Test de navigation 1C2 : DOM/API fictifs, aucune base ni serveur requis. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const pub=path.join(__dirname,'../public');
const tenant='ENERGY_MVP01D_RECETTE';
const site='11111111-1111-4111-8111-111111111111',doc='22222222-2222-4222-8222-222222222222';
class Element {
 constructor(tag='div'){this.tag=tag;this.textContent='';this.href='';this.disabled=false;this.hidden=false;this.value='';this.children=[];this.options=[];this.dataset={};this.listeners={};}
 append(...nodes){this.children.push(...nodes);if(this.tag==='select')this.options.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];if(this.tag==='select'){this.options=[...nodes];this.value=nodes[0]?.value??'';}}
 addEventListener(type,cb){this.listeners[type]=cb;}
}
const values={id:doc,nature:'RECHARGE',energie:'ELECTRICITE',dateDocument:'2026-11-21',montant:'100.00',devise:'XOF',periodeDebut:null,periodeFin:null,pointId:null,meterId:null,referenceDocument:'DEMO-C2-001',referenceJustificatif:null};
const row={originalId:doc,actuelId:doc,nature:'RECHARGE',energie:'ELECTRICITE',dateDocument:'2026-11-21',montant:'100.00',devise:'XOF',revision:0};
function api(url){const u=new URL(url,'http://sateer.local'),q=u.searchParams,p=u.pathname;
 let obj={};
 if(p.endsWith('/sites'))obj={sites:[{id:site,nom:'SITE DEMO'}],suivant:false};
 else if(p.endsWith('/signaux'))obj=q.get('source')==='DOCUMENTS'?{source:'DOCUMENTS',items:[{id:doc,date:'2026-11-21',nature:'RECHARGE',energie:'ELECTRICITE',reference:'DEMO-C2-001',montant:'100.00',devise:'XOF',signaux:[{code:'REFERENCE_REPETEE',niveau:'A_VERIFIER',explication:'Test'}]}],suivant:false}:{source:'RELEVES',items:[],suivant:false};
 else if(p.endsWith('/points'))obj={points:[]};
 else if(p.endsWith('/declarations'))obj={declarations:[values],suivant:false};
 else if(p.endsWith('/fichiers'))obj={fichiers:[]};
 else if(p.endsWith('/rectifications')&&p.includes('/declarations/'))obj={original:values,actuel:values,revisions:[],revisionActuelle:0};
 else if(p.endsWith('/rectifications'))obj={declarations:[row],suivant:false};
 return {ok:true,status:200,json:async()=>obj};
}
async function run(file,query){const els=new Map();const get=id=>{if(!els.has(id))els.set(id,new Element(id==='site'||id==='source'||id==='pointId'||id==='meterId'||id==='declarationFichier'?'select':'div'));return els.get(id);};
 get('source').value='RELEVES';get('nature').value='FACTURE';
 const docObj={getElementById:get,createElement(tag){return new Element(tag);}};
 const context={document:docObj,window:{SATEER_CONTEXT_READY:Promise.resolve({organisations:[{tenant_code:tenant}]})},location:{search:'?tenant='+tenant+query},URLSearchParams,URL,fetch:async u=>api(u),console,crypto:require('node:crypto').webcrypto};
 const result=vm.runInNewContext(fs.readFileSync(path.join(pub,file),'utf8'),context,{filename:file,timeout:3000});
 await result;return {get,els};}
function descendants(root){return [root,...root.children.flatMap(descendants)];}
test('Qualité : DOCUMENTS chargé depuis URL, action ciblée vers origine contrôles',async()=>{
 const {get}=await run('energie-controles.js','&source=DOCUMENTS');
 assert.equal(get('source').value,'DOCUMENTS');
 const links=descendants(get('resultats')).filter(e=>e.tag==='a'&&e.textContent==='Voir les versions');
 assert.equal(links.length,1);const url=new URL(links[0].href,'http://sateer.local');
 assert.equal(url.pathname,'/energie-rectifications.html');assert.equal(url.searchParams.get('tenant'),tenant);
 assert.equal(url.searchParams.get('from'),'controles');assert.equal(url.searchParams.get('site'),site);assert.equal(url.searchParams.get('document'),doc);
});
test('Rectifications depuis contrôles : sélection document et retour vers DOCUMENTS',async()=>{
 const {get}=await run('energie-rectifications.js','&from=controles&site='+site+'&document='+doc);
 assert.equal(get('retour').textContent,'← Contrôles de qualité');
 const url=new URL(get('retour').href,'http://sateer.local');
 assert.equal(url.pathname,'/energie-controles.html');assert.equal(url.searchParams.get('source'),'DOCUMENTS');
 assert.equal(url.searchParams.get('site'),site);
 assert.match(get('historiqueEtat').textContent,/Versions conservées/);
 const factures=new URL(get('versFactures').href,'http://sateer.local');
 assert.equal(factures.searchParams.get('from'),'rectifications');assert.equal(factures.searchParams.get('returnFrom'),'controles');
 assert.equal(factures.searchParams.get('document'),doc);
});
test('Factures depuis rectifications : retour conserve provenance et document',async()=>{
 const {get}=await run('energie-factures.js','&from=rectifications&returnFrom=controles&site='+site+'&document='+doc);
 assert.equal(get('retour').textContent,'← Rectifications');
 const url=new URL(get('retour').href,'http://sateer.local');assert.equal(url.pathname,'/energie-rectifications.html');
 assert.equal(url.searchParams.get('from'),'controles');assert.equal(url.searchParams.get('site'),site);assert.equal(url.searchParams.get('document'),doc);
});
test('Pages ouvertes directement gardent des destinations prévisibles',async()=>{
 const b=await run('energie-factures.js','');assert.equal(b.get('retour').textContent,'← Mes compteurs');
 const r=await run('energie-rectifications.js','');assert.equal(r.get('retour').textContent,'← Mes factures');
 assert.equal(new URL(r.get('retour').href,'http://sateer.local').searchParams.get('from'),'rectifications');
});
test('Origine externe arbitraire impossible et document invalide ignoré',async()=>{
 const r=await run('energie-rectifications.js','&from=https%3A%2F%2Fevil.invalid&document=%2F%2Fevil.invalid');
 assert.equal(r.get('retour').textContent,'← Mes factures');
 for(const k of ['retour','versControles','versFactures'])assert.match(new URL(r.get(k).href,'http://sateer.local').pathname,/^\/energie-(?:factures|rectifications|controles)\.html$/);
 const b=await run('energie-factures.js','&from=javascript%3Aalert(1)&document=%2F%2Fevil.invalid');
 assert.equal(b.get('retour').textContent,'← Mes compteurs');
 assert.doesNotMatch(b.get('retour').href,/evil/);
});
test('Liens statiques et versions cache tous actualisés',()=>{
 for(const name of ['energie-controles','energie-rectifications','energie-factures']){
  const s=fs.readFileSync(path.join(pub,name+'.html'),'utf8');assert.match(s,new RegExp(name+'\\.js\\?v=nav-r2'));
 }
 assert.match(fs.readFileSync(path.join(pub,'energie-rectifications.html'),'utf8'),/id="versFactures"/);
});

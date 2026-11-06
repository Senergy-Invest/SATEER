'use strict';
// Régression ciblée sans réseau, sans DB et sans mot de passe.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const tenant = 'P6V_3B5AC5AB9DB04657';
const src = name => fs.readFileSync(path.join(ROOT, 'public', name), 'utf8');
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
class Node {
  constructor(tag='div',doc=null) { this.tag=tag; this.doc=doc; this.children=[]; this.listeners={}; this.style={}; this.value=''; this.textContent=''; this.hidden=false; this.options=[]; }
  addEventListener(type,fn){this.listeners[type]=fn;}
  append(...items){this.children.push(...items);}
  appendChild(item){this.children.push(item);return item;}
  prepend(item){this.children.unshift(item);}
  replaceChildren(...items){this.children=items;}
  add(item){this.options.push(item);}
  setAttribute(name,value){this[name]=value;}
  closest(){return this.doc?.section || null;}
  scrollIntoView(){}
}
function dom() {
 const nodes = new Map();
 const document = {
   body: new Node('body'),
   getElementById(id){ if(!nodes.has(id))nodes.set(id,new Node('div',document));return nodes.get(id); },
   createElement(tag){return new Node(tag,document);},
   querySelector(which){return which==='main'?document.main:null;},
 };
 document.main = new Node('main',document);
 document.section = new Node('section',document);
 document.main.append(document.section);
 nodes.set('demandeForm',new Node('form',document));
 document.section.append(document.getElementById('demandeForm'));
 return { document,nodes };
}
async function testMonConsulat(label, initialSearch, contexteTenant) {
 const {document,nodes}=dom();
 let context = { tenantCode:contexteTenant, personne:{id:301}, organisations:[{id:70,type:'CONSULAT',tenant_code:tenant}] };
 const location = {origin:'http://127.0.0.1:3200', search:initialSearch, hash:'', href:'http://127.0.0.1:3200/consulat.html'+initialSearch};
 let apiUrl='', redirected='';
 const window = { location, SATEER_CONTEXT_READY:Promise.resolve(context), SATEER_CONTEXT:context,
  SATEER_choisirOrganisation:async (id,type)=> type==='CONSULAT'&&Number(id)===70?context.organisations[0]:null,
  history:{ replaceState(_s,_t,url) { let u = new URL(url,'http://127.0.0.1:3200');location.href=u.href;location.search=u.search; } }
 };
 const fetch=async url => {apiUrl=url;return {ok:true,json:async()=>({organisation:{nom:'Organisation fictive Bordeaux'},publications:[],demandes:[],notifications:[]})};};
 const ctx={window,document,fetch,URL,URLSearchParams,Option:class{constructor(text,value){this.text=text;this.value=value;}},console, requestAnimationFrame: fn=>fn(),decodeURIComponent};
 vm.runInNewContext(src('consulat.js'),ctx,{filename:'consulat.js'});
 await flush();
 assert.ok(apiUrl.includes('tenant='+tenant), `${label}: API sans tenant de l'organisation`);
 assert.equal(new URL(location.href).searchParams.get('tenant'),tenant,`${label}: URL non canonique`);
 assert.equal(typeof nodes.get('nouvelleDemandeButton').listeners.click,'function');
 await nodes.get('nouvelleDemandeButton').listeners.click();
 const target=new URL(location.href,'http://127.0.0.1:3200');
 assert.equal(target.pathname,'/demande.html');
 assert.equal(target.searchParams.get('organisation'),'70');
 assert.equal(target.searchParams.get('tenant'),tenant);
 assert.equal(target.searchParams.get('source'),'MON_CONSULAT');
 console.log('PASS',label,': Mon Consulat → Nouvelle demande conserve tenant');
}
async function testP7(label, initialSearch, contexteTenant, org, expectedSuccess) {
 const {document,nodes}=dom();
 const context={tenantCode:contexteTenant};
 const location={ origin:'http://127.0.0.1:3200', search:initialSearch, href:'http://127.0.0.1:3200/demande.html'+initialSearch};
 let apiCalls=0, restoredUrl='';
 const window={SATEER_CONTEXT_READY:Promise.resolve(context),SATEER_choisirOrganisation:async()=>org,
  location,history:{ replaceState(_a,_b,url){restoredUrl=url;} }
 };
 const fetch=async url=>{apiCalls++;return {ok:true,json:async()=>({procedures:[]})};};
 const ctx={window,document,location,fetch,URL,URLSearchParams,console,confirm:()=>true,Error,Date,Number,String,Array};
 vm.runInNewContext(src('p7-citizen-ui.js'),ctx,{filename:'p7-citizen-ui.js'});
 await flush();
 const msg=document.getElementById('p7-status').textContent;
 if(expectedSuccess){
  assert.equal(apiCalls,1,`${label}: catalogue non interrogé`);
  assert.ok(!msg.includes('Impossible de préparer'),`${label}: ${msg}`);
  if(!new URLSearchParams(initialSearch).has('tenant')) assert.equal(new URL(restoredUrl,location.origin).searchParams.get('tenant'),tenant);
 }else{
  assert.equal(apiCalls,0,`${label}: requête interdite malgré contexte incohérent`);
  assert.ok(msg.includes('Impossible de préparer'),`${label}: erreur non affichée`);
 }
 console.log('PASS',label);
}
(async()=>{
 await testMonConsulat('Ouverture depuis un contexte explicitement sélectionné','?organisation=70&tenant='+tenant,tenant);
 await testMonConsulat('Retour ancien sans tenant, rattaché au Consulat','?organisation=70',null);
 await testP7('Formulaire avec tenant explicite','?organisation=70&tenant='+tenant+'&source=MON_CONSULAT',tenant,{id:70,type:'CONSULAT',tenant_code:tenant},true);
 await testP7('Ancien lien sans tenant, organisation autorisée','?organisation=70&source=MON_CONSULAT',null,{id:70,type:'CONSULAT',tenant_code:tenant},true);
 await testP7('Rejet tenant contradictoire','?organisation=70&tenant=AUTRE&source=MON_CONSULAT','AUTRE',{id:70,type:'CONSULAT',tenant_code:tenant},false);
 await testP7('Rejet organisation non autorisée','?organisation=70&source=MON_CONSULAT',null,null,false);
 console.log('BORDEAUX_NAVIGATION_CONSULAT_P7_PASS : 6/6');
})().catch(err=>{console.error(err.stack||err);process.exitCode=1;});

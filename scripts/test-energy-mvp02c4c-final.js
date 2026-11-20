'use strict';
/** Clôture C4C — tests de navigation et d'affichage, sans base ni navigateur externe. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const nav=require('../public/energie-retour-c4c3.js');
const TENANT='ENERGY_MVP01D_RECETTE';
const SITE=crypto.randomUUID(),GRANT=crypto.randomUUID();
const html=fs.readFileSync(path.join(__dirname,'../public/energie-actions.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../public/energie-actions.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'../public/energie-actions.css'),'utf8');

function element(tag='div') {
  return {tag,children:[],hidden:false,disabled:false,textContent:'',value:'',href:'',className:'',
    classList:{toggle(){}},replaceChildren(...xs){this.children=xs;},append(...xs){this.children.push(...xs);},
    addEventListener(){},setAttribute(){}};
}
async function visiter({owner=true,member=true,fail=false,filter='EN_REVUE'}={}) {
  const els=new Map();
  function get(id){if(!els.has(id))els.set(id,element());return els.get(id);}
  get('filtre').value=filter;get('suivi').value='TOUS';
  const ctx={organisations:member?[{tenant_code:TENANT}]:[]};
  const site={id:SITE,nom:'Site synthétique',role:owner?'PROPRIETAIRE':'RESPONSABLE',
    grantId:owner?null:GRANT,perimetre:owner?null:'Bureau A'};
  const request=[];
  const sandbox={
    window:{SATEER_CONTEXT_READY:Promise.resolve(ctx),SATEER_C4C3_NAV:nav},
    document:{getElementById:get,createElement:element},
    location:{search:'?tenant='+TENANT},URLSearchParams,URL,
    fetch:async u=>{request.push(String(u));if(fail)throw Error('SIMULATION_HTTP');
      const data=String(u).endsWith('/sites?tenant='+TENANT)?{sites:[site],suivant:false}: {
        acces:{role:site.role,perimetre:owner?'Site synthétique':'Bureau A',complet:owner},
        actions:[],suivant:false,statutStructure:'DISPONIBLE'};
      return {ok:true,status:200,json:async()=>data};}
  };
  await vm.runInNewContext(source,sandbox,{timeout:1200});
  return {get,request};
}

test('C4C fin : lien permanent C1 présent, caché avant réponse du serveur',()=>{
  assert.match(html,/id="versResponsabilites"[^>]+hidden/);
  assert.match(html,/id="versCollecte"/);
});
test('C4C fin : chargement Core avant navigation métier',()=>{
  assert.ok(html.indexOf('/auth-client.js')>=0);
  assert.ok(html.indexOf('/energie-retour-c4c3.js')>html.indexOf('/auth-client.js'));
  assert.ok(html.indexOf('/energie-actions.js')>html.indexOf('/energie-retour-c4c3.js'));
});
test('C4C fin : lien C1 réservé à une réponse propriétaire',()=>{
  assert.match(source,/lienC1\.hidden=!data\.acces\.complet/);
  assert.match(source,/if\(data\.acces\.complet\)lienC1\.href=nav\.vers/);
});
test('C4C fin : remise à zéro masque C1 pendant les changements de contexte',()=>{
  assert.match(source,/const clear=.*versResponsabilites'\)\.hidden=true/);
});
test('C4C fin : le lien C1 est lisible et caché même si un style de lien est défini',()=>{
  assert.match(styles,/\.actions-navigation a\[hidden\]\{display:none\}/);
  assert.match(styles,/flex-wrap:wrap/);
});
test('C4C fin : propriétaire voit C1 et C2, sans toucher aux permissions',async()=>{
  const {get,request}=await visiter();
  assert.equal(get('versResponsabilites').hidden,false);
  assert.ok(get('versResponsabilites').href.startsWith('/energie-responsabilites.html?'));
  assert.ok(get('versCollecte').href.startsWith('/energie-collecte.html?'));
  assert.ok(get('versResponsabilites').href.includes('from=c4c3'));
  assert.equal(request.length,2);
});
test('C4C fin : collaborateur ne voit pas le lien permanent C1',async()=>{
  const {get}=await visiter({owner:false});
  assert.equal(get('versResponsabilites').hidden,true);
  assert.ok(get('versCollecte').href.includes('retourC4C3'));
  assert.ok(nav.retourDepuis(new URL(get('versCollecte').href,'https://local.invalid').search,TENANT).includes(GRANT));
});
test('C4C fin : session hors tenant n’affiche pas de lien propriétaire',async()=>{
  const {get,request}=await visiter({member:false});
  assert.equal(get('versResponsabilites').hidden,true);
  assert.equal(request.length,0);
});
test('C4C fin : erreur API masque C1 même pour un propriétaire attendu',async()=>{
  const {get}=await visiter({fail:true});
  assert.equal(get('versResponsabilites').hidden,true);
});
test('C4C fin : retour C1 authentique restaure le site et les filtres',()=>{
  const to=nav.vers('/energie-responsabilites.html',TENANT,{id:SITE},'EN_REVUE','SANS_RELECTEUR_ACTIF',100);
  const ret=nav.retourDepuis(new URL(to,'https://local.invalid').search,TENANT);
  const state=nav.lireEtat(new URL(ret,'https://local.invalid').search,TENANT);
  assert.equal(state.site,SITE);assert.equal(state.statut,'EN_REVUE');
  assert.equal(state.suivi,'SANS_RELECTEUR_ACTIF');assert.equal(state.offset,100);
});
test('C4C fin : retour C2 authentique conserve le grant actif sans accorder de droit',()=>{
  const to=nav.vers('/energie-collecte.html',TENANT,{id:SITE,grantId:GRANT},'A_CORRIGER','TOUS',50);
  const ret=nav.retourDepuis(new URL(to,'https://local.invalid').search,TENANT);
  const state=nav.lireEtat(new URL(ret,'https://local.invalid').search,TENANT);
  assert.equal(state.site,SITE);assert.equal(state.grantId,GRANT);assert.equal(state.offset,50);
});
test('C4C fin : un faux retour inter-tenant ou externe reste refusé',()=>{
  for (const raw of ['https://elsewhere.example/','//elsewhere.example/','/energie-actions.html?tenant=AUTRE']) {
    const query=new URLSearchParams({tenant:TENANT,from:'c4c3',retourC4C3:raw});
    assert.equal(nav.retourDepuis('?'+query,TENANT),null);
  }
});

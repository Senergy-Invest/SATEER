'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../public/associations-partenaires.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/associations-partenaires.html'), 'utf8');
assert(html.includes('href="/index.html"') && html.includes('id="accessGuard"'));
class Element {
  constructor() { this.textContent=''; this.href=''; this.style={}; this.children=[]; this.className=''; this.disabled=false; }
  replaceChildren(...e){this.children=e;this.textContent='';}
  append(...e){this.children.push(...e);}
  addEventListener(){}
}
function fixture(org, fetchImpl, search='?organisation=70&tenant=DEMO') {
  const nodes = new Map();
  const get = id => {if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const stats = new Element(), layout = new Element();
  let fetchCount=0;
  const document = {
    getElementById:get,
    createElement:()=>new Element(),
    querySelector:sel=>sel === '.partner-stats'?stats: sel==='.partner-layout'?layout:null,
  };
  const context = {
    window:{SATEER_CONTEXT_READY:Promise.resolve({tenantCode:'DEMO'}), SATEER_choisirOrganisation:async()=>org,confirm:()=>false},
    document,location:{search},URLSearchParams,encodeURIComponent,
    fetch:async(...args)=>{fetchCount++;return fetchImpl(...args)},
    console,Date
  };
  vm.runInNewContext(script,context);
  return {get,stats,layout,calls:()=>fetchCount};
}
const response=(ok,body,status=200)=>({ok,status,json:async()=>body});
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
(async()=>{
  {
    const f=fixture(null,async()=>{throw new Error('unexpected fetch');}); await flush();
    assert.equal(f.calls(),0); assert.equal(f.get('back').href,'/index.html');
    assert.equal(f.get('accessGuard').style.display,'block');
    assert.equal(f.stats.style.display,'none'); assert.equal(f.layout.style.display,'none');
    assert.match(f.get('accessGuardMessage').textContent,/réservé aux responsables habilités/);
    console.log('PASS Membre sans Consulat : panneau accès réservé, aucun indicateur ni appel réseau');
  }
  {
    const f=fixture({id:70,tenant_code:'DEMO'},async path=>{
      if(path.includes('association-partners?'))return response(true,{associations:[{id:132,nom:'Association demo',relation_statut:'ACTIVE',relation_active:true,relation_id:1}]});
      if(path.includes('association-join-requests'))return response(true,{demandes:[]});
      if(path.includes('association-relay-history'))return response(true,{relais:[{titre:'Information demo',original_author_first_name:'Vice',original_author_last_name:'Consul',association_nom:'Association demo',date_relais:'2026-11-06T05:40:00Z'}]});
      throw Error(path);
    }); await flush();
    assert.equal(f.get('partnerConnectedCount').textContent,'1');
    assert.equal(f.get('partnerPendingCount').textContent,'0');
    assert.equal(f.get('partnerRelayCount').textContent,'1');
    assert.equal(f.get('accessGuard').style.display,undefined);
    assert.match(f.get('back').href,/organisation=70&tenant=DEMO/);
    assert.equal(f.get('back').textContent,'← Retour au pilotage du Consulat');
    console.log('PASS Vice-Consul autorisé : KPIs 1/0/1 et lien de retour contextualisé');
  }
  {
    const f=fixture({id:70,tenant_code:'DEMO'},async()=>response(false,{statut:'ACCES_REFUSE'},403)); await flush();
    assert.equal(f.calls(),1);
    assert.equal(f.get('accessGuard').style.display,'block');
    assert.equal(f.stats.style.display,'none');
    assert.equal(f.get('back').href,'/index.html');
    assert.match(f.get('accessGuardMessage').textContent,/ne possède pas l’autorisation/);
    console.log('PASS Compte non autorisé API 403 : aucun tableau administratif affiché');
  }
  {
    const f=fixture({id:70,tenant_code:'OTHER'},async()=>{throw Error('Unexpected network request');}); await flush();
    assert.equal(f.calls(),0); assert.equal(f.stats.style.display,'none');
    assert.match(f.get('accessGuardMessage').textContent,/ne correspond pas/);
    console.log('PASS Tenant incohérent : refus avant toute requête API');
  }
  console.log('ASSOCIATION_ADMIN_GUARD_UI_PASS : 4/4');
})().catch(e=>{console.error(e); process.exitCode=1});

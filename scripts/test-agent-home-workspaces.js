'use strict';
// Recette hors réseau: on exécute la vraie fonction d'accueil contre des
// réponses API simulées, sans mot de passe, session réelle ni PostgreSQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname,'..','public','app.js'), 'utf8');
const bootMarker = 'document.getElementById("notificationButton")?.addEventListener';
assert.equal(source.split(bootMarker).length, 2, 'Point d’initialisation introuvable');
assert.ok(source.includes('/units/overview?tenant='),'L’API d’unités autorisées doit être utilisée');
class N {
  constructor(tag='div') {this.tagName=tag;this.children=[];this.hidden=false;this.textContent='';this.className='';this.classList={toggle(){}};}
  append(...xs){this.children.push(...xs)}
  appendChild(x){this.children.push(x);return x}
  replaceChildren(...xs){this.children=[...xs]}
  setAttribute(name,val){this[name]=val}
}
const org={id:70,nom:'Consulat de recette',type:'CONSULAT',tenant_code:'P6V_DEMO'};
const assoc={id:132,nom:'Association',type:'ASSOCIATION',tenant_code:'P6V_DEMO'};
const ctx=orgs=>({organisations:orgs,tenantCode:'P6V_DEMO',personne:{id:123}});
const good=(unitId,nom,orgId=70)=>({id:unitId,nom,organisation_id:orgId,canOpenWorkspace:true});
function session({dash={},units=[],overviewStatus=200,partnersStatus=403}={}){
  const elements=new Map(),seen=[];
  const document={createElement:tag=>new N(tag),getElementById:id=>{if(!elements.has(id))elements.set(id,new N());return elements.get(id)}};
  document.getElementById('professionnelsSection').hidden=true;
  const fetch=async url=>{
    seen.push(url);
    let status=404, body={};
    if(url.includes('/dashboards/acces')){status=200;body={dashboards:dash};}
    if(url.includes('/units/overview')){status=overviewStatus;body={unites:units};}
    if(url.includes('/association-partners')) status=partnersStatus;
    return {ok:status>=200 && status<300,status,json:async()=>body};
  };
  const scope=vm.createContext({document,fetch,URLSearchParams,console:{warn(){},error(){}},window:{}});
  vm.runInContext(source.split(bootMarker)[0],scope,{filename:'app.js'});
  const container=document.getElementById('professionnelsContainer');
  const section=document.getElementById('professionnelsSection');
  return {scope,container,section,seen,elements};
}
const urls=s=>s.container.children.map(c=>c.href);
async function check(label,run){await run();console.log('PASS',label)}
(async()=>{
  await check('Agent Passeports : son bureau uniquement, sans dashboard',async()=>{
    const s=session({units:[good(501,'Bureau Passeports'),{...good(502,'Bureau État civil'),canOpenWorkspace:false}]});
    await s.scope.afficherAccesProfessionnels(ctx([org]));
    assert.equal(s.section.hidden,false);
    assert.deepEqual(urls(s),['/unit-workspace.html?organisation=70&unit=501&tenant=P6V_DEMO']);
    assert.match(s.container.children[0].children[0].textContent,/Mon bureau · Bureau Passeports/);
    assert.ok(s.seen.some(u=>u.includes('/api/organisations/70/units/overview?tenant=P6V_DEMO')));
    assert.equal(s.elements.get('professionnelsTitle').textContent,'Mes fonctions professionnelles');
  });
  await check('Agent État civil : unité différente, autre bureau absent',async()=>{
    const s=session({units:[good(502,'Bureau État civil')]});
    await s.scope.afficherAccesProfessionnels(ctx([org]));
    assert.deepEqual(urls(s),['/unit-workspace.html?organisation=70&unit=502&tenant=P6V_DEMO']);
  });
  await check('Aucune unité autorisée : aucune carte créée',async()=>{
    const s=session({units:[{...good(501,'Bureau Passeports'),canOpenWorkspace:false}]});
    await s.scope.afficherAccesProfessionnels(ctx([org]));
    assert.equal(s.section.hidden,true); assert.equal(s.container.children.length,0);
  });
  await check('API refusée : échec fermé, aucune carte créée',async()=>{
    const s=session({overviewStatus:403,units:[good(501,'Bureau Passeports')]});
    await s.scope.afficherAccesProfessionnels(ctx([org]));
    assert.equal(s.section.hidden,true); assert.deepEqual(urls(s),[]);
  });
  await check('Unité étrangère ou invalide : aucun lien créé',async()=>{
    const s=session({units:[good(501,'Bureau Passeports',999),good('abc','Invalide'),good(-1,'Invalide')]});
    await s.scope.afficherAccesProfessionnels(ctx([org]));
    assert.equal(s.section.hidden,true);
  });
  await check('Vice-Consul : dashboard conservé sans cartes de bureaux en double',async()=>{
    const s=session({dash:{operationnel:true},units:[good(501,'Bureau Passeports')]});
    await s.scope.afficherAccesProfessionnels(ctx([org]));
    assert.deepEqual(urls(s),['/dashboard-vice-consul.html?organisation=70&tenant=P6V_DEMO']);
    assert.ok(!s.seen.some(u=>u.includes('/units/overview')));
  });
  await check('Consul : pilotage stratégique conservé',async()=>{
    const s=session({dash:{strategique:true},units:[good(501,'Bureau Passeports')]});
    await s.scope.afficherAccesProfessionnels(ctx([org]));
    assert.deepEqual(urls(s),['/dashboard-consul.html?organisation=70&tenant=P6V_DEMO']);
  });
  await check('Association : accès associatif conservé sans requête aux unités',async()=>{
    const s=session(); await s.scope.afficherAccesProfessionnels(ctx([assoc]));
    assert.deepEqual(urls(s),['/association-communications.html?organisation=132&tenant=P6V_DEMO']);
    assert.ok(!s.seen.some(u=>u.includes('/units/overview')));
  });
  console.log('AGENT_UNIT_HOME_PASS : 8/8 scénarios UI hors ligne');
})().catch(err=>{console.error(err);process.exitCode=1});

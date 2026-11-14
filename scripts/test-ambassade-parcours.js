"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../public/ambassade-parcours-ui.js');
const contextualiser = require('../public/institution-publication-context.js');
let total = 0;
function ok(condition, label) { assert.ok(condition, label); total++; }
class Elem {
  constructor(tag='div') {this.tag=tag;this.children=[];this.textContent='';this.href='';this.className='';}
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children=[...elements]; }
}
function setup() {
  const ids={};
  for(const name of ['ambassadeParcoursStatut','ambassadeParcoursBureaux','ambassadeParcoursCommunicationStatut','ambassadeParcoursCommunicationActions'])ids[name]=new Elem();
  return {ids,doc:{createElement:tag=>new Elem(tag),getElementById:id=>ids[id]||null}};
}
const org=17,tenant='SN';
function units(data={}) {return {ok:true,status:200,json:async()=>({
  statut:'UNITES_WORKSPACE_CHARGEES',organisationId:org,tenantCode:tenant,
  unites:[
   {id:101,organisation_id:org,nom:'Secrétariat <script>',canOpenWorkspace:true,
    capabilities:['RECEIVE_INCOMING','ROUTE_CASES'],canViewAnalytics:true,new_cases:4},
   {id:102,organisation_id:org,nom:'Service administratif',canOpenWorkspace:true,capabilities:['VIEW_INBOX']},
   {id:103,organisation_id:org,nom:'Bureau interdit',canOpenWorkspace:false,capabilities:['VIEW_INBOX']},
   {id:104,organisation_id:999,nom:'Bureau tiers',canOpenWorkspace:true,capabilities:['VIEW_INBOX']}
  ],...data})};}
function pubs(data={}) {return {ok:true,status:200,json:async()=>({statut:'PUBLICATIONS_CHARGEES',publications:[],...data})};}
function denied(status=403) {return {ok:false,status,json:async()=>({statut:'ACCES_REFUSE'})};}
function fail() {throw new Error('Network down');}
function all(root){return [root,...root.children.flatMap(all)];}
function req(fn1=units(),fn2=pubs()){let c=0;return async(url,options)=>{ok(options.credentials==='same-origin'&&options.cache==='no-store','No store et cookie');
  if(url.includes('/units/overview')){c++;return typeof fn1==='function'?fn1():fn1;}
  if(url.includes('/publications')){c++;return typeof fn2==='function'?fn2():fn2;}
  throw new Error('Mauvaise URL');};}
(async()=>{
  assert.equal(ui.urlWorkspace(17,'SN',101),'/unit-workspace.html?organisation=17&unit=101&tenant=SN');total++;
  assert.equal(ui.urlPublication(17,'SN'),'/publication-institutionnelle.html?organisation=17&tenant=SN&from=AMBASSADE');total++;
  assert.throws(()=>ui.urlWorkspace(17,'SN',0),/INVALIDE/);total++;
  assert.throws(()=>ui.urlWorkspace(17,'sn',5),/INVALIDE/);total++;
  assert.throws(()=>ui.urlPublication(-1,'SN'),/INVALIDE/);total++;
  ok(ui.categorieCapacites({capabilities:['RECEIVE_INCOMING','ROUTE_CASES']})==='Réception et orientation','Réception');
  ok(ui.categorieCapacites({capabilities:['VIEW_INBOX']})==='Traitement des demandes','Dossiers');
  ok(ui.categorieCapacites({capabilities:[]})==='Espace de travail','Unité simple');
  let {ids,doc}=setup();
  await ui.charger({organisationId:org,tenantCode:tenant,doc,fetcher:req()});
  let liens=all(ids.ambassadeParcoursBureaux).filter(e=>e.tag==='a');
  ok(liens.length===2,'Deux Workspaces explicitement ouverts seulement');
  ok(liens[0].href.includes('unit=101')&&liens[1].href.includes('unit=102'),'Liens unitaires propres');
  ok(!JSON.stringify(ids.ambassadeParcoursBureaux).includes('Bureau interdit'),'Pas d unité interdite');
  ok(!JSON.stringify(ids.ambassadeParcoursBureaux).includes('Bureau tiers'),'Pas d unité d une autre organisation');
  ok(all(ids.ambassadeParcoursBureaux).some(x=>x.textContent==='Secrétariat <script>'),'Entrée préservée comme texte');
  ok(!('innerHTML' in new Elem()),'Aucune API HTML brute dans les éléments');
  ok(all(ids.ambassadeParcoursBureaux).some(x=>x.textContent==='4 nouvelle(s) demande(s)'),'Statistique seulement si canViewAnalytics');
  ok(all(ids.ambassadeParcoursCommunicationActions).filter(e=>e.tag==='a').length===1,'Publication éditable si droit reconnu par API');
  ok(ids.ambassadeParcoursCommunicationStatut.textContent.includes('accessible'),'État Communication autorisé');
  ({ids,doc}=setup());
  await ui.charger({organisationId:org,tenantCode:tenant,doc,fetcher:req(denied(),denied())});
  ok(all(ids.ambassadeParcoursBureaux).filter(e=>e.tag==='a').length===0,'403 : pas de bureau');
  ok(all(ids.ambassadeParcoursCommunicationActions).filter(e=>e.tag==='a').length===0,'403 : pas de publication');
  ok(ids.ambassadeParcoursStatut.textContent.includes('non habilité'),'Refus Workspace clair');
  ({ids,doc}=setup());
  await ui.charger({organisationId:org,tenantCode:tenant,doc,fetcher:req(units(),denied())});
  ok(all(ids.ambassadeParcoursBureaux).filter(e=>e.tag==='a').length===2,'Publication refusée sans bloquer Workspaces');
  ({ids,doc}=setup());
  await ui.charger({organisationId:org,tenantCode:tenant,doc,fetcher:req(denied(),pubs())});
  ok(all(ids.ambassadeParcoursCommunicationActions).filter(e=>e.tag==='a').length===1,'Workspace refusé sans bloquer Communication');
  ({ids,doc}=setup());
  await ui.charger({organisationId:org,tenantCode:tenant,doc,fetcher:req(fail,fail)});
  ok(all(ids.ambassadeParcoursCommunicationActions).filter(e=>e.tag==='a').length===0,'Erreur réseau : aucun accès supposé');
  ({ids,doc}=setup());
  await ui.charger({organisationId:org,tenantCode:tenant,doc,fetcher:req(units({organisationId:999}),pubs({statut:'ERREUR'}))});
  ok(all(ids.ambassadeParcoursBureaux).filter(e=>e.tag==='a').length===0,'Réponse autre organisation refusée');
  ok(all(ids.ambassadeParcoursCommunicationActions).filter(e=>e.tag==='a').length===0,'Contrat de publication refusé');
  ({ids,doc}=setup());
  await ui.charger({organisationId:org,tenantCode:'SN%27',doc,fetcher:()=>{throw Error('Ne doit pas appeler');}});
  ok(ids.ambassadeParcoursStatut.textContent.includes('invalide'),'Validation du tenant avant appels');
  ({ids,doc}=setup());
  await ui.charger({organisationId:org,tenantCode:tenant,doc,fetcher:req(units({unites:[]}),pubs())});
  ok(all(ids.ambassadeParcoursBureaux).some(e=>e.textContent.includes('Aucun Workspace')),'Aucune unité : message sans inventer');
  const dom={
    retour:new Elem('a'),kicker:new Elem('p'),bandeau:new Elem('h1'),
    querySelector(selector){return ({'.com-back':this.retour,'.com-kicker':this.kicker,'.com-banner h1':this.bandeau})[selector]||null;}
  };
  const contexte={organisations:[{id:17,type:'AMBASSADE',tenant_code:'SN'}, {id:18,type:'CONSULAT',tenant_code:'SN'}]};
  ok(contextualiser.presentation({doc:dom,organisation:'17',tenantCode:'SN',contexte}),'Rattachement Ambassade');
  ok(dom.retour.href==='/ambassade.html?organisation=17&tenant=SN','Retour Ambassade');
  ok(dom.kicker.textContent.includes('Ambassade'),'Titre Ambassade');
  const previous=dom.retour.href;
  ok(!contextualiser.presentation({doc:dom,organisation:'18',tenantCode:'SN',contexte}),'Consulat ne prend pas façade Ambassade');
  ok(!contextualiser.presentation({doc:dom,organisation:'17',tenantCode:'FR',contexte}),'Tenant différent refusé');
  ok(dom.retour.href===previous,'Aucune modification sur autre contexte');
  const here=path.join(__dirname,'..');
  const server=fs.readFileSync(path.join(here,'server.js'),'utf8');
  ok(server.includes('"/api/organisations/:organisationId/units/overview"'),'API Workspace commune présente');
  ok(server.includes('"/api/organisations/:organisationId/publications"'),'API Communication commune présente');
  ok(server.includes('canOpenWorkspace')&&server.includes('TARGET_COMMUNICATION'),'Autorisations du Core conservées');
  const html=fs.readFileSync(path.join(here,'public/ambassade.html'),'utf8');
  ok(html.includes('/ambassade-parcours-ui.js')&&html.includes('ambassadeParcoursBureaux'),'Façade branchée à Mon Ambassade');
  const entry=fs.readFileSync(path.join(here,'public/ambassade.js'),'utf8');
  ok(entry.includes('SATEER_AMBASSADE_PARCOURS?.charger'),'Entrée déclenchée seulement après vérification du contexte');
  const editor=fs.readFileSync(path.join(here,'public/publication-institutionnelle.html'),'utf8');
  ok(editor.includes('/institution-publication-context.js'),'Éditeur commun contextualisé');
  console.log(`AMBASSADE_A6_PARCOURS_PASS=${total}`);
})().catch(e=>{console.error(e);process.exitCode=1;});

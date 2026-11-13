"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(root,"public/ministry-worldwide-ui.js"),"utf8");
const entry = fs.readFileSync(path.join(root,"public/ministry-experience-entry.js"),"utf8");
const html = fs.readFileSync(path.join(root,"public/ministry-worldwide.html"),"utf8");
const home = fs.readFileSync(path.join(root,"public/index.html"),"utf8");
const app = fs.readFileSync(path.join(root,"public/app.js"),"utf8");
let n = 0;
function check(x,message) { assert.ok(x,message);n++; }
function fail(fn,regexp,message) {assert.throws(fn,regexp,message);n++;}
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.textContent="";this.events={};this.hidden=false;this.value="";}
  setAttribute(k,v){this[k]=v;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  addEventListener(k,callback){this.events[k]=callback;}
}
function environment({orgType="MINISTERE", tenant="SN", authorized=true, status=503, apiBody={statut:"SOURCES_NON_CONFIGUREES"}}={}) {
  const nodes = Object.fromEntries(["mwStatut","mwContenu","mwOrganisation","mwPeriode","mwForm","mwIndicateurs","mwReseau","mwProvenance"].map(id=>[id,new Element("div")]));
  const listeners = {};
  const doc = {readyState:"loading",createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element("fragment"),
    getElementById:id=>nodes[id],addEventListener:(k,fn)=>{listeners[k]=fn;}};
  let calls=0, lastUrl="", lastOptions=null;
  const context={organisations:authorized?[{id:1,type:orgType,tenant_code:tenant,nom:'Ministère <test> & Sénégal'}]:[]};
  const win={location:{search:"?organisation=1&tenant="+tenant},SATEER_CONTEXT_READY:Promise.resolve(context)};
  const scope={window:win,document:doc,URLSearchParams,Date,console,
    fetch:async(url,opts)=>{calls++;lastUrl=url;lastOptions=opts;return {status,ok:status===200,json:async()=>apiBody};}};
  vm.runInNewContext(ui,scope,{filename:"public/ministry-worldwide-ui.js"});
  return {nodes,listeners,window:win,calls:()=>calls,lastUrl:()=>lastUrl,lastOptions:()=>lastOptions};
}
function response() {
  const poste=(tenantCode,organisationId,type,nom,pays,etat,metriques=null)=>({tenantCode,organisationId,type,nom,
    reference:`${tenantCode}:${organisationId}`,paysImplantation:pays,statutDeploiement:etat,
    etatReporting:metriques?"RAPPORT_VALIDE":"NON_DEPLOYE",metriques});
  return {statut:"SUPERVISION_MINISTERIELLE",provenance:{revisionAnnuaire:"TEST-REF-2026",revisionReporting:"TEST-REPORT-2026",valideLe:"2026-11-13T12:00:00Z"},
    supervision:{organisations:[poste("SN",1,"MINISTERE","Ministère fictif", "Sénégal","RACCORDE",{demandesRecues:1,demandesTraitees:1,dossiersEnCours:0}),
      poste("FR",11,"AMBASSADE","Ambassade <img src=x>","France","RACCORDE",{demandesRecues:7,demandesTraitees:4,dossiersEnCours:3}),
      poste("FR",12,"CONSULAT","Consulat de recette","France","NON_DEPLOYE")],
      relations:[{parent:"SN:1",enfant:"FR:11",type:"SUPERVISION"},{parent:"FR:11",enfant:"FR:12",type:"ADMINISTRATIVE_TUTELLE"}],
      couverture:{inventoriees:3,raccordees:2,nonDeployees:1,enRecette:0,avecRapport:2,statut:"COMPLETE_PARMI_RACCORDES"},
      indicateurs:{statut:"COMPLETE_PARMI_RACCORDES",totauxRenseignes:{demandesRecues:8,demandesTraitees:5,dossiersEnCours:3}}
    }};
}
async function flush(){await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));}
(async()=>{
 const e=environment();
 const vue=e.window.SATEER_MINISTRY_UI;
 const valid=vue.verifierReponse(response(),"SN",1);
 check(valid.racine==="SN:1"&&valid.nodes.size===3,"Racine et identités composites");
 let tree=vue.ordonnerReseau(valid);
 check(tree.items.length===3,"Trois organisations affichables");
 check(tree.items.map(x=>x.profondeur).join(",")==="0,1,2","Profondeurs ministère/ambassade/consulat");
 check(!tree.tronque,"Réseau complet");
 check(vue.ordonnerReseau(valid,2).tronque,"Limite d'affichage visible");
 fail(()=>vue.verifierReponse(null,"SN",1),/REPONSE_SUPERVISION_INVALIDE/,"Réponse vide refusée");
 fail(()=>vue.verifierReponse({...response(),statut:"FAUX"},"SN",1),/REPONSE_SUPERVISION_INVALIDE/,"Statut invalide refusé");
 fail(()=>vue.verifierReponse(response(),"IT",1),/RACINE_MINISTERIELLE_INVALIDE/,"Racine étrangère refusée");
 const wrong=response();wrong.supervision.organisations[0].reference="FR:1";
 fail(()=>vue.verifierReponse(wrong,"SN",1),/POSTE_SUPERVISION_INVALIDE/,"Identifiant tenant/organisation incohérent");
 const collision=response();collision.supervision.organisations.push({...collision.supervision.organisations[1]});
 fail(()=>vue.verifierReponse(collision,"SN",1),/POSTE_SUPERVISION_INVALIDE/,"Doublon interdit");
 const disconnected=response();disconnected.supervision.organisations.push({tenantCode:"PT",organisationId:99,reference:"PT:99",type:"AMBASSADE",nom:"Hors réseau",paysImplantation:"Portugal",statutDeploiement:"NON_DEPLOYE"});
 fail(()=>vue.ordonnerReseau(vue.verifierReponse(disconnected,"SN",1)),/RESEAU_NON_ANCRE/,"Poste non rattaché refusé");
 const badRelation=response();badRelation.supervision.relations[0].enfant="PT:19";
 fail(()=>vue.ordonnerReseau(vue.verifierReponse(badRelation,"SN",1)),/RELATION_SUPERVISION_INVALIDE/,"Relation incohérente refusée");
 e.listeners.DOMContentLoaded();await flush();
 check(e.nodes.mwContenu.hidden===false,"Espace présenté si rattachement réel dans session");
 check(e.calls()===1,"Un seul appel initial à l'API");
 check(e.lastUrl().startsWith("/api/ministry-worldwide/1?"),"API commune A4b utilisée");
 check(e.lastOptions().credentials==="same-origin"&&e.lastOptions().method==="GET","Lecture same-origin uniquement");
 check(e.nodes.mwStatut.textContent.includes("non configurées"),"503 non configuré communiqué explicitement");
 check(e.nodes.mwIndicateurs.children.length===0,"Aucun chiffre quand fournisseur absent");
 check(e.nodes.mwReseau.children.length===0,"Aucun réseau fictif quand fournisseur absent");
 const forbidden=environment({status:403,apiBody:{statut:"ACCES_SUPERVISION_REFUSE"}});
 forbidden.listeners.DOMContentLoaded();await flush();
 check(forbidden.nodes.mwStatut.textContent.includes("non habilité"),"403 indique permission manquante");
 check(forbidden.nodes.mwIndicateurs.children.length===0,"403 ne conserve aucune statistique");
 const unauth=environment({authorized:false});unauth.listeners.DOMContentLoaded();await flush();
 check(unauth.calls()===0,"Aucun appel sans rattachement ministériel");
 const other=environment({orgType:"AMBASSADE"});other.listeners.DOMContentLoaded();await flush();
 check(other.calls()===0,"Ambassade n'est pas ministère");
 const ok=environment({status:200,apiBody:response()});ok.listeners.DOMContentLoaded();await flush();
 check(ok.nodes.mwIndicateurs.children.length>0,"Agrégats synthétiques transmis par le serveur uniquement");
 check(ok.nodes.mwReseau.children.length===1,"Arborescence rendue");
 check(ok.nodes.mwProvenance.textContent.includes("TEST-REF-2026"),"Provenance visible");
 check(ok.nodes.mwStatut.textContent.includes("2 rapports valides"),"Couverture visible");
 check(ui.includes("textContent")&&!/\.innerHTML\s*=|document\.write\s*\(/.test(ui),"Rendu DOM sans injection HTML");
 check(!/fetch\(['"]https?:\/\//.test(ui),"Aucune ressource externe consultée");
 check(html.includes('<script src="/auth-client.js"></script>')&&html.includes('<script src="/ministry-worldwide-ui.js"></script>'),"Client de session d'abord");
 check(home.indexOf('/ministry-experience-entry.js')>0&&home.indexOf('/ministry-experience-entry.js')<home.lastIndexOf('/app.js'),"Entrée ministère chargée avant accueil");
 check(app.includes('SATEER_MINISTRY_PRESENTATION?.creerCarte'),"Carte ministère raccordée à Mon SATEER");
 const d={createElement:tag=>new Element(tag)};const w={};vm.runInNewContext(entry,{window:w,URLSearchParams}, {filename:'public/ministry-experience-entry.js'});
 const card=w.SATEER_MINISTRY_PRESENTATION.creerCarte({id:3,type:'MINISTERE',nom:'Ministère <test>'},'SN',d);
 check(card && card.children.length===3,"Carte de présentation générée");
 check(card.children.at(-1).href.includes('organisation=3'),"Navigation vers organisation sélectionnée");
 check(!w.SATEER_MINISTRY_PRESENTATION.creerCarte({id:3,type:'CONSULAT'},'SN',d),"Une carte Consulat ne devient pas Ministère");
 check(!w.SATEER_MINISTRY_PRESENTATION.creerCarte({id:3,type:'MINISTERE'},'sn',d),"Tenant invalide écarté");
 console.log('AMBASSADE_A4C_INTERFACE_PASS='+n);
})().catch(err=>{console.error(err);process.exitCode=1});

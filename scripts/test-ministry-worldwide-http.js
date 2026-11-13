"use strict";
/** A4b — contrats de transport, RBAC et provenance ; simulation sans BD. */
const assert = require("node:assert/strict");
const { creerRouteSupervisionMinisterielle } = require("../ministry-worldwide-http");
const { composerSupervisionMondiale } = require("../ministry-worldwide-reporting");
const { chargerLotNonConfigure } = require("../ministry-worldwide-source-contract");
const NOW = "2026-11-13T17:00:00Z";
let n = 0;
function ok(condition, label) { assert.ok(condition, label); n++; }
function lotValide() {
  const p = (tenantCode, organisationId) => ({ tenantCode, organisationId });
  return {
    racine: p("SN",1),
    provenance: { revisionAnnuaire: "REF-2026-11", revisionReporting: "REPORT-2026-11", valideLe: "2026-11-13T16:00:00Z" },
    postes: [
      { ...p("SN",1), nom:"Ministère synthétique", type:"MINISTERE", paysImplantation:"Sénégal", statutDeploiement:"RACCORDE" },
      { ...p("FR",11), nom:"Ambassade synthétique", type:"AMBASSADE", paysImplantation:"France", statutDeploiement:"RACCORDE" },
      { ...p("FR",12), nom:"Consulat synthétique", type:"CONSULAT", paysImplantation:"France", statutDeploiement:"NON_DEPLOYE" }
    ],
    relations: [
      { parent:p("SN",1),enfant:p("FR",11),type:"SUPERVISION",statut:"ACTIVE",actif:true,approuvee:true },
      { parent:p("FR",11),enfant:p("FR",12),type:"ADMINISTRATIVE_TUTELLE",statut:"ACTIVE",actif:true,approuvee:true }
    ],
    rapports: [
      { ...p("SN",1), periode:"2026-11",statut:"VALIDE",produitLe:"2026-11-13T16:00:00Z",
        metriques:{demandesRecues:0,demandesTraitees:0,dossiersEnCours:0} },
      { ...p("FR",11), periode:"2026-11",statut:"VALIDE",produitLe:"2026-11-13T16:00:00Z",
        metriques:{demandesRecues:10,demandesTraitees:6,dossiersEnCours:4},
        nomsCitoyens:["PERSONNE_PRIVEE"] }
    ],
    referencesAutorisees:[p("SN",1),p("FR",11),p("FR",12)],
    piecesConfidentielles:["SECRET"]
  };
}
const callbacks = {};
const router = { get(path,handler){ callbacks[path]=handler; } };
const calls={org:0,permission:0,source:0};
let orgType="MINISTERE", permission=true, scope="ORGANISATION", source=lotValide();
let lastArgs;
creerRouteSupervisionMinisterielle({
  router,
  trouverOrganisation:async (id,tenant)=>{calls.org++;return orgType==="MISSING"?null:{id,type:orgType,tenant_code:tenant};},
  verifierPermission:async data=>{calls.permission++;lastArgs=data;return {succes:true,autorise:permission,portee:scope};},
  chargerLot:async data=>{calls.source++;lastArgs={...lastArgs,provider:data};if(source instanceof Error)throw source;return source;},
  composer:composerSupervisionMondiale,
  horloge:()=>NOW
});
const handler=callbacks["/:organisationId"];
assert.equal(typeof handler,"function");
async function call({auth={personneId:99},id="1",tenant="SN",periode="2026-11",other={}}={}) {
  const req={auth,params:{organisationId:id},query:{tenant,periode,...other}};
  const resp={statusCode:200,headers:{},body:null,set(k,v){this.headers[k.toLowerCase()]=v;return this;},
    status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
  await handler(req,resp);
  return resp;
}
(async()=>{
  let r=await call({auth:undefined}); // helper defaults auth for undefined: test explicitly null below
  ok(r.statusCode===200,"Autorisation fictive valide pour le scénario témoin");
  ok(r.body.statut==="SUPERVISION_MINISTERIELLE","Réponse institutionnelle");
  ok(r.body.supervision.organisations.length===3,"Hiérarchie complète du témoin");
  ok(r.body.supervision.relations.length===2,"Deux arêtes structurelles");
  ok(r.body.supervision.couverture.nonDeployees===1,"Poste non déployé conservé");
  ok(r.body.supervision.indicateurs.totauxRenseignes.demandesRecues===10,"Métriques agrégées uniquement");
  ok(!JSON.stringify(r.body).includes("PERSONNE_PRIVEE"),"Aucun nom privé");
  ok(!JSON.stringify(r.body).includes("SECRET"),"Aucune pièce brute");
  ok(/no-store/.test(r.headers["cache-control"]),"Sans cache");
  ok(r.body.provenance.revisionAnnuaire==="REF-2026-11","Révision documentée");
  ok(lastArgs.permissionCode==="VIEW_MINISTRY_WORLDWIDE","Permission dédiée vérifiée");
  ok(lastArgs.personneId===99&&lastArgs.organisationId===1&&lastArgs.tenantCode==="SN","Permission ciblée racine exacte");
  ok(lastArgs.provider.personneId===99&&lastArgs.provider.organisationId===1,"Source appelée avec identité serveur");
  ok(!lastArgs.provider.referencesAutorisees,"Source ne reçoit aucun périmètre choisi par le navigateur");
  const before={...calls};
  r=await call({auth:null});
  ok(r.statusCode===401,"Session absente refusée");
  ok(JSON.stringify(calls)===JSON.stringify(before),"Aucune lecture sans session");
  for (const bad of [{id:"abc"},{id:"0"},{id:"9007199254740992"},{tenant:"fr"},
    {tenant:"SN;DELETE"},{periode:"2026-13"},{periode:"2026-1"},{periode:["2026-11"]}]) {
    r=await call(bad);ok(r.statusCode===400,"Entrée invalide : 400");
  }
  ok(JSON.stringify(calls)===JSON.stringify(before),"Entrées invalides : aucune lecture");
  orgType="CONSULAT";r=await call();ok(r.statusCode===403,"Racine non ministère : refus");
  ok(calls.permission===before.permission,"Racine non ministère : aucun RBAC appelé");
  orgType="MISSING";r=await call();ok(r.statusCode===403,"Organisation absente : refus");
  orgType="MINISTERE";permission=false;const sourceBefore=calls.source;
  r=await call();ok(r.statusCode===403,"Permission absente : refus");
  ok(calls.source===sourceBefore,"Aucun fournisseur interrogé sans droit");
  permission=true;scope="UNIT";r=await call();ok(r.statusCode===403,"Permission UNIT ne vaut pas portée ministère");
  ok(calls.source===sourceBefore,"Aucun fournisseur en permission locale");
  scope="ORGANISATION";source=lotValide();source.racine={tenantCode:"FR",organisationId:11};
  r=await call();ok(r.statusCode===503,"Racine étrangère refusée");
  source=lotValide();source.postes.push({...source.postes[1],organisationId:88,nom:"Poste hors réseau"});
  source.referencesAutorisees.push({tenantCode:"FR",organisationId:88});
  r=await call();ok(r.statusCode===503,"Un poste hors graphe raciné refuse le lot entier");
  source=lotValide();source.provenance.valideLe="2026-12-01T00:00:00Z";
  r=await call();ok(r.statusCode===503,"Provenance future refusée");
  source=lotValide();source.provenance.revisionAnnuaire="";
  r=await call();ok(r.statusCode===503,"Révision absente refusée");
  source=lotValide();source.rapports[1].metriques.demandesRecues=-1;
  r=await call();ok(r.statusCode===503,"Métrique invalide refusée");
  source=lotValide();source.rapports=[];
  r=await call();ok(r.statusCode===200&&r.body.supervision.couverture.statut==="AUCUNE_DONNEE","Absence d'indicateurs signalée, pas remplacée par zéro");
  source=lotValide();source.referencesAutorisees=[];
  r=await call();ok(r.statusCode===503,"Le ministère racine doit être présent dans le périmètre certifié");
  source=lotValide();source.referencesAutorisees.push({tenantCode:"PT",organisationId:77});
  r=await call({other:{referencesAutorisees:"PT:77",metriques:"9999"}});
  ok(r.statusCode===200&&r.body.supervision.organisations.length===3,"Une référence absente de l'annuaire n'ouvre pas d'accès");
  ok(!JSON.stringify(r.body).includes("PT:77"),"Aucun résultat créé par les paramètres client");
  source=lotValide();source.postes[1].type="CONSULAT";
  r=await call();ok(r.statusCode===503,"Chaîne hiérarchique incohérente refusée");
  source=lotValide();source.rapports.push({...source.rapports[1]});
  r=await call();ok(r.statusCode===503,"Rapport dupliqué refusé");
  source=new Error("SENSITIVE_DB_ERROR_SECRET");
  r=await call();ok(r.statusCode===503&&!JSON.stringify(r.body).includes("SECRET"),"Erreur fournisseur masquée");
  source=lotValide();
  try{await chargerLotNonConfigure();throw new Error("Devait refuser");}
  catch(error){source=error;}
  r=await call();ok(r.statusCode===503&&r.body.statut==="SOURCES_NON_CONFIGUREES","Fournisseur non installé : fail closed");
  ok(!callbacks["POST /:organisationId"],"Aucune écriture HTTP enregistrée");
  console.log("AMBASSADE_A4B_API_CONTRATS_PASS="+n);
})().catch(e=>{console.error(e);process.exitCode=1;});

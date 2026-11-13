"use strict";
/**
 * A4d — recette horizontale dans un serveur HTTP ephémère sur 127.0.0.1.
 * Route A4b REELLE + projection A4a REELLE + JS d'interface A4c REEL.
 * Seules les dépendances session/RBAC/source sont SYNTHETIQUES dans ce test.
 * Aucune connexion PostgreSQL, aucun serveur SATEER existant, aucun fichier modifié.
 */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { once } = require("node:events");
const express = require("express");
const { creerRouteSupervisionMinisterielle } = require("../ministry-worldwide-http");
const { composerSupervisionMondiale } = require("../ministry-worldwide-reporting");
const { SourcesMinisteriellesIndisponibles } = require("../ministry-worldwide-source-contract");

let total = 0;
const ok = (value, description) => { assert.ok(value, description); total++; };
const check = (actual, expected, description) => { assert.equal(actual, expected, description); total++; };
const root = path.resolve(__dirname, "..");
const uiSource = readFileSync(path.join(root, "public/ministry-worldwide-ui.js"), "utf8");
const codeActuel = new Date().toISOString();
const dateValidee = new Date(Date.now() - 30_000).toISOString();
const id = (tenantCode, organisationId) => ({tenantCode, organisationId});
const org = (tenantCode, organisationId, type, nom, paysImplantation, statutDeploiement) =>
  ({...id(tenantCode, organisationId), type, nom, paysImplantation, statutDeploiement});
const relation = (parent, enfant, type) => ({ parent, enfant, type, statut:"ACTIVE",actif:true,approuvee:true });
const rapport = (periode, poste, metriques) => ({...poste, periode, statut:"VALIDE", produitLe:dateValidee, metriques });
const ministere = id("SN", 1), ambassade = id("FR", 11), consulat = id("FR", 12);
function lot(periode) {
  return {
    racine:ministere,
    provenance:{ revisionAnnuaire:"ANN-RECETTE-2026", revisionReporting:"RPT-RECETTE-2026", valideLe:dateValidee },
    postes:[
      org("SN",1,"MINISTERE","Ministère fictif","Sénégal","RACCORDE"),
      org("FR",11,"AMBASSADE","Ambassade <script>alert(1)</script>","France","RACCORDE"),
      org("FR",12,"CONSULAT","Consulat fictif de Bordeaux","France","NON_DEPLOYE")
    ],
    relations:[ relation(ministere,ambassade,"SUPERVISION"), relation(ambassade,consulat,"ADMINISTRATIVE_TUTELLE") ],
    rapports:[
      rapport(periode,ministere,{demandesRecues:0,demandesTraitees:0,dossiersEnCours:0}),
      {...rapport(periode,ambassade,{demandesRecues:9,demandesTraitees:4,dossiersEnCours:5}),
        secrets:["PRIVÉ NE JAMAIS AFFICHER"]}
    ],
    referencesAutorisees:[ministere,ambassade,consulat]
  };
}
class Element {
  constructor(tag) {this.tag=tag;this.children=[];this.dataset={};this.textContent="";this.events={};this.hidden=false;this.value="";}
  append(...items) {this.children.push(...items);}
  replaceChildren(...items) {this.children=[...items];}
  addEventListener(event,callback){this.events[event]=callback;}
}
function tousTextes(element) {
  return String(element?.textContent||"") + (element?.children||[]).map(tousTextes).join(" ");
}
function creerInterface(origin, credential) {
  const noms = ["mwStatut","mwContenu","mwOrganisation","mwPeriode","mwForm","mwIndicateurs","mwReseau","mwProvenance"];
  const nodes = Object.fromEntries(noms.map(name=>[name,new Element("section")]));
  const listeners = {};
  const document = {
    readyState:"loading",createElement:name=>new Element(name),createDocumentFragment:()=>new Element("fragment"),
    getElementById:name=>nodes[name],addEventListener:(name,fn)=>{listeners[name]=fn;}
  };
  const context={organisations:[{id:1,tenant_code:"SN",type:"MINISTERE",nom:"Ministère de recette"}]};
  const window={location:{search:"?organisation=1&tenant=SN"},SATEER_CONTEXT_READY:Promise.resolve(context)};
  const calls=[];
  const fakeFetch=(url,opts)=>{
    calls.push({url,opts});
    return fetch(origin+url,{...opts,headers:{...opts.headers,"x-recette-personne":credential}});
  };
  vm.runInNewContext(uiSource,{window,document,URLSearchParams,Date,console,fetch:fakeFetch},{filename:"ministry-worldwide-ui.js"});
  return { nodes, listeners, calls, window };
}
async function attendre(predicate, description) {
  for(let i=0;i<100;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,15));
  }
  throw new Error("ATTENTE_TIMEOUT: "+description);
}
async function main() {
  const app=express();
  let mode="valide", consultationsFournisseur=0, droitsTestes=0;
  // Simulation de session uniquement dans le serveur de test éphémère.
  app.use("/api/ministry-worldwide",(req,res,next)=>{
    if(req.get("x-recette-personne")==="ministere")req.auth={personneId:99};
    if(req.get("x-recette-personne")==="sansdroit")req.auth={personneId:50};
    next();
  },creerRouteSupervisionMinisterielle({
    router:express.Router(),
    trouverOrganisation:async (organisationId,tenantCode)=>tenantCode==="SN"&&organisationId===1?
      {id:1,type:"MINISTERE",tenant_code:"SN"}:null,
    verifierPermission:async a=>{
      droitsTestes++;
      return {succes:true,autorise:a.personneId===99&&a.organisationId===1&&a.tenantCode==="SN"&&
        a.permissionCode==="VIEW_MINISTRY_WORLDWIDE",portee:"ORGANISATION"};
    },
    chargerLot:async a=>{
      consultationsFournisseur++;
      if(mode==="absent")throw new SourcesMinisteriellesIndisponibles();
      if(mode==="invalide")return {...lot(a.periode),racine:id("FR",11)};
      return lot(a.periode);
    },
    composer:composerSupervisionMondiale,
    horloge:()=>codeActuel
  }));
  const serveur=app.listen(0,"127.0.0.1");
  try {
    await once(serveur,"listening");
    const origin="http://127.0.0.1:"+serveur.address().port;
    const period=new Date().toISOString().slice(0,7);
    const chemin="/api/ministry-worldwide/1?tenant=SN&periode="+period;
    let response=await fetch(origin+chemin);
    check(response.status,401,"API refuse session absente");
    check(consultationsFournisseur,0,"Aucune source sans session");
    response=await fetch(origin+chemin,{headers:{"x-recette-personne":"sansdroit"}});
    check(response.status,403,"RBAC réel du routeur refuse session non habilitée");
    check(consultationsFournisseur,0,"Aucune source sans droit ministériel");
    response=await fetch(origin+chemin,{headers:{"x-recette-personne":"ministere"}});
    check(response.status,200,"API réelle accepte une session synthétique habilitée");
    const body=await response.json();
    check(body.statut,"SUPERVISION_MINISTERIELLE","Contrat HTTP A4b conservé");
    check(body.supervision.organisations.length,3,"Trois organisations issues du fournisseur serveur");
    check(body.supervision.relations.length,2,"Liens Ministère/Ambassade/Consulat visibles");
    check(body.supervision.couverture.nonDeployees,1,"Non-déployé n'est pas zéro activité");
    check(body.supervision.indicateurs.totauxRenseignes.demandesRecues,9,"Agrégation réelle A4a");
    ok(!JSON.stringify(body).includes("PRIVÉ NE JAMAIS AFFICHER"),"Fuite de champ métier empêchée");
    ok(/no-store/.test(response.headers.get("cache-control")),"Réponse privée non mise en cache");
    const ministereUI=creerInterface(origin,"ministere");
    ministereUI.listeners.DOMContentLoaded();
    await attendre(()=>ministereUI.nodes.mwStatut.textContent.includes("3 organisations"),"Chargement du réseau réel par le JS A4c");
    ok(ministereUI.nodes.mwReseau.children.length===1,"Rendu du réseau via réponse HTTP réelle");
    ok(tousTextes(ministereUI.nodes.mwReseau).includes("Consulat fictif de Bordeaux"),"Trois niveaux présentés");
    ok(tousTextes(ministereUI.nodes.mwIndicateurs).includes("9"),"Statistiques reçues via API");
    ok(ministereUI.nodes.mwProvenance.textContent.includes("ANN-RECETTE-2026"),"Traçabilité visible");
    ok(ministereUI.nodes.mwReseau.children[0].children.every(n=>n.tag==="li"),"Noeuds créés sans HTML exécutable");
    check(ministereUI.calls.length,1,"Une seule requête de page");
    ok(ministereUI.calls[0].opts.method==="GET"&&ministereUI.calls[0].opts.credentials==="same-origin","GET same-origin uniquement");
    const before=consultationsFournisseur;
    mode="absent";
    const sansSource=creerInterface(origin,"ministere");
    sansSource.listeners.DOMContentLoaded();
    await attendre(()=>sansSource.nodes.mwStatut.textContent.includes("non configurées"),"Source manquante");
    check(sansSource.nodes.mwIndicateurs.children.length,0,"Aucun chiffre sans source");
    check(sansSource.nodes.mwReseau.children.length,0,"Aucun lien institutionnel fictif sans source");
    ok(consultationsFournisseur>before,"API interrogée dans le contexte habilité");
    const uiNonHabilitee=creerInterface(origin,"sansdroit");
    uiNonHabilitee.listeners.DOMContentLoaded();
    await attendre(()=>uiNonHabilitee.nodes.mwStatut.textContent.includes("non habilité"),"Permission refusée");
    check(uiNonHabilitee.nodes.mwIndicateurs.children.length,0,"Aucun contenu quand droit insuffisant");
    mode="invalide";
    const invalide=creerInterface(origin,"ministere");
    invalide.listeners.DOMContentLoaded();
    await attendre(()=>invalide.nodes.mwStatut.textContent.includes("Supervision indisponible"),"Provenance invalide");
    check(invalide.nodes.mwReseau.children.length,0,"Réseau incohérent jamais affiché");
    response=await fetch(origin+chemin,{method:"POST",headers:{"x-recette-personne":"ministere"}});
    check(response.status,404,"Aucune mutation HTTP exposée");
    response=await fetch(origin+"/api/ministry-worldwide/1?tenant=SN&periode=2026-13",{headers:{"x-recette-personne":"ministere"}});
    check(response.status,400,"Période malformée refusée avant source");
    ok(droitsTestes>0,"Vérification RBAC exercée par vraie route A4b");
    console.log("AMBASSADE_A4D_HTTP_UI_INTEGRE_PASS="+total);
    console.log("A4D_SIMULATION_SYNTHETIQUE_UNIQUEMENT, AUCUNE_BD_ET_AUCUNE_SOURCE_REELLE");
  } finally {
    await new Promise((resolve,reject)=>serveur.close(err=>err?reject(err):resolve()));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

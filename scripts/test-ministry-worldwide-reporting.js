"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { composerSupervisionMondiale } = require("../ministry-worldwide-reporting");
let n = 0;
function ok(value, label) { assert.ok(value, label); n++; }
function throws(f, re, label) { assert.throws(f, re, label); n++; }
const dateReference = "2026-11-13T12:00:00Z";
const periode = "2026-11";
function poste(tenantCode, organisationId, type, nom, pays, etat="RACCORDE") {
  return { tenantCode, organisationId, type, nom, paysImplantation: pays, statutDeploiement: etat };
}
function lien(parentTenant, parentId, enfantTenant, enfantId, type, more={}) {
  return { parent:{tenantCode:parentTenant, organisationId:parentId},
    enfant:{tenantCode:enfantTenant, organisationId:enfantId}, type,
    statut:"ACTIVE", actif:true, approuvee:true, dateDebut:"2026-01-01T00:00:00Z", dateFin:null, ...more };
}
function rapport(tenantCode, organisationId, metriques, more={}) {
  return {tenantCode, organisationId, periode, statut:"VALIDE",
    produitLe:"2026-11-12T12:00:00Z", metriques, ...more};
}
const postes=[
  poste("SN",1,"MINISTERE","Ministère fictif","Sénégal"),
  poste("FR",11,"AMBASSADE","Ambassade A fictive","France"),
  poste("FR",12,"CONSULAT","Consulat Bordeaux fictif","France"),
  poste("IT",11,"AMBASSADE","Ambassade B fictive","Italie","NON_DEPLOYE"),
  poste("IT",12,"CONSULAT","Consulat Milan fictif","Italie","EN_RECETTE"),
  poste("PT",11,"AMBASSADE","Ambassade hors périmètre","Portugal")
];
const relations=[
  lien("SN",1,"FR",11,"SUPERVISION"),
  lien("FR",11,"FR",12,"ADMINISTRATIVE_TUTELLE"),
  lien("SN",1,"IT",11,"SUPERVISION"),
  lien("IT",11,"IT",12,"ADMINISTRATIVE_TUTELLE"),
  lien("SN",1,"PT",11,"SUPERVISION"),
  lien("FR",11,"IT",11,"COOPERATION")
];
const referencesAutorisees=postes.slice(0,5).map(p=>({tenantCode:p.tenantCode,organisationId:p.organisationId}));
const rapports=[
  rapport("SN",1,{demandesRecues:0,demandesTraitees:0,dossiersEnCours:0}, {courriersPrives:"SECRET"}),
  rapport("FR",11,{demandesRecues:9,demandesTraitees:3,dossiersEnCours:7}, {nomsCitoyens:["PRIVE"]}),
  rapport("FR",12,{demandesRecues:4,demandesTraitees:8,dossiersEnCours:1}),
  rapport("PT",11,{demandesRecues:800,demandesTraitees:800,dossiersEnCours:0})
];
const input={postes,relations,rapports,referencesAutorisees,periode,dateReference};
const vue=composerSupervisionMondiale(input);
ok(vue.organisations.length===5,"Affiche le périmètre autorisé uniquement");
ok(!JSON.stringify(vue).includes("Portugal"),"Aucun poste hors périmètre");
ok(!JSON.stringify(vue).includes("SECRET"),"Aucune donnée brute personnelle");
ok(!JSON.stringify(vue).includes("PRIVE"),"Aucun nom citoyen");
ok(vue.relations.length===4,"Réseau hiérarchique validé uniquement");
ok(vue.relations.some(x=>x.parent==="SN:1"&&x.enfant==="FR:11"),"Liens inter-tenant du seul annuaire validé");
ok(vue.relations.some(x=>x.parent==="FR:11"&&x.enfant==="FR:12"),"Tutelle consulat inchangée");
ok(vue.couverture.inventoriees===5,"Inventaire multi-pays");
ok(vue.couverture.raccordees===3,"Comptage des postes raccordés");
ok(vue.couverture.nonDeployees===1,"Postes non déployés identifiés");
ok(vue.couverture.enRecette===1,"Postes en recette identifiés");
ok(vue.couverture.avecRapport===3,"Rapports validés uniquement");
ok(vue.couverture.statut==="COMPLETE_PARMI_RACCORDES","Couverture connue des seuls postes raccordés");
ok(vue.indicateurs.totauxRenseignes.demandesRecues===13,"Agrégats sur rapports autorisés seulement");
ok(vue.indicateurs.totauxRenseignes.demandesTraitees===11,"Traitement historique peut dépasser les entrées du mois");
ok(vue.indicateurs.couvertureIntegralePerimetreAutorise===false,"Interdiction de présenter la somme comme total national exhaustif");
ok(vue.organisations.find(x=>x.reference==="IT:11").metriques===null,"Poste non déployé ≠ zéro demandes");
ok(vue.organisations.find(x=>x.reference==="IT:12").metriques===null,"Poste en recette sans chiffres");
ok(vue.organisations.find(x=>x.reference==="SN:1").metriques.demandesRecues===0,"Zéro réel seulement si rapport validé");
ok(vue.organisations.find(x=>x.reference==="FR:11").reference!==vue.organisations.find(x=>x.reference==="IT:11").reference,"Identifiants locaux identiques isolés par tenant");
const onlyFR=postes.slice(1,3).map(p=>({tenantCode:p.tenantCode,organisationId:p.organisationId}));
let local=composerSupervisionMondiale({...input,referencesAutorisees:onlyFR});
ok(local.organisations.length===2&&local.relations.length===1,"La lecture partielle n'expose pas les parents externes");
ok(local.couverture.avecRapport===2,"Agrégats locaux seulement");
let noReport=composerSupervisionMondiale({...input,rapports:[]});
ok(noReport.couverture.statut==="AUCUNE_DONNEE","Absence de rapport ≠ zéro mondial");
ok(noReport.organisations.find(x=>x.reference==="FR:11").etatReporting==="DONNEES_INDISPONIBLES","Données manquantes signalées");
let old=composerSupervisionMondiale({...input,rapports:rapports.map(r=>({...r,periode:"2026-10"}))});
ok(old.couverture.statut==="AUCUNE_DONNEE","Rapport du mois précédent ignoré");
let revoked=composerSupervisionMondiale({...input,relations:relations.map(r=>({...r,statut:"REVOKED",actif:false}))});
ok(revoked.relations.length===0,"Relations révoquées exclues");
let expired=composerSupervisionMondiale({...input,relations:relations.map(r=>({...r,dateFin:"2026-01-02T00:00:00Z"}))});
ok(expired.relations.length===0,"Relations expirées exclues");
let unapproved=composerSupervisionMondiale({...input,relations:relations.map(r=>({...r,approuvee:false}))});
ok(unapproved.relations.length===0,"Lien non approuvé n'est pas une tutelle");
throws(()=>composerSupervisionMondiale({...input,relations:[...relations,lien("FR",12,"SN",1,"SUPERVISION")]}),/HIERARCHIE_INVALIDE/,"Types parent-enfant contrôlés");
throws(()=>composerSupervisionMondiale({...input,relations:[...relations,lien("FR",11,"FR",11,"ADMINISTRATIVE_TUTELLE")]}),/HIERARCHIE_INVALIDE/,"Auto-parent refusé");
throws(()=>composerSupervisionMondiale({...input,postes:[...postes,postes[0]]}),/POSTE_DUPLIQUE/,"Annuaires dupliqués refusés");
throws(()=>composerSupervisionMondiale({...input,referencesAutorisees:[...referencesAutorisees,referencesAutorisees[0]]}),/AUTORISATION_DUPLIQUEE/,"Périmètres dupliqués refusés");
throws(()=>composerSupervisionMondiale({...input,rapports:[...rapports,rapports[1]]}),/RAPPORT_DUPLIQUE/,"Rapports concurrents dupliqués refusés");
throws(()=>composerSupervisionMondiale({...input,rapports:[...rapports.slice(0,1),rapport("FR",11,{demandesRecues:-1,demandesTraitees:0,dossiersEnCours:0})]}),/METRIQUE_INVALIDE/,"Statistique négative refusée");
throws(()=>composerSupervisionMondiale({...input,rapports:[...rapports.slice(0,1),rapport("FR",11,{demandesRecues:2.5,demandesTraitees:0,dossiersEnCours:0})]}),/METRIQUE_INVALIDE/,"Statistique fractionnaire refusée");
throws(()=>composerSupervisionMondiale({...input,periode:"2026-13"}),/CONTEXTE_SUPERVISION_INVALIDE/,"Période erronée refusée");
throws(()=>composerSupervisionMondiale({...input,dateReference:"2026-11-13"}),/CONTEXTE_SUPERVISION_INVALIDE/,"Date relative sans fuseau refusée");
throws(()=>composerSupervisionMondiale({...input,referencesAutorisees:undefined}),/CONTEXTE_SUPERVISION_INVALIDE/,"Absence de périmètre autorisé refusée");
throws(()=>composerSupervisionMondiale({...input,postes:[...postes,poste("sn",20,"AMBASSADE","Test","Test")]}),/REFERENCE_ORGANISATION_INVALIDE/,"Tenant invalide refusé");
throws(()=>composerSupervisionMondiale({...input,relations:[...relations,lien("FR",11,"FR",12,"ADMINISTRATIVE_TUTELLE",{dateDebut:"nimportequoi"})]}),/DATE_RELATION_INVALIDE/,"Date institutionnelle invalide refusée");
const empty=composerSupervisionMondiale({...input,referencesAutorisees:[]});
ok(empty.organisations.length===0&&empty.relations.length===0&&empty.couverture.statut==="AUCUNE_DONNEE","Périmètre vide = aucune donnée, pas de contournement");
const src=fs.readFileSync(path.resolve(__dirname,"../ministry-worldwide-reporting.js"),"utf8");
ok(!/require\(["'](?:\.\/database|\.\/services-database|pg|express)["']\)/.test(src),"Aucun moteur SQL ou HTTP dupliqué");
ok(!/INSERT INTO |UPDATE |DELETE FROM |CREATE TABLE /i.test(src),"Aucune écriture ni création de tables");
console.log("AMBASSADE_A4A_SUPERVISION_CONTRATS_PASS="+n);

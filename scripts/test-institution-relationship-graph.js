"use strict";
const assert = require("node:assert/strict");
const {
  TYPES_STRUCTURELS, TYPES_COLLABORATION, estRelationEffective,
  estRelationDeCommunicationCandidate, construireGrapheInstitutionnel, descendantsInstitutionnels
} = require("../institution-relationship-graph");

const ref = "2026-11-13T12:00:00Z";
const tenantId = 1;
const monde = [
  { id: 1, tenant_id: 1, type: "MINISTERE", nom: "Ministère fictif" },
  { id: 2, tenant_id: 1, type: "AMBASSADE", nom: "Ambassade France fictive" },
  { id: 3, tenant_id: 1, type: "CONSULAT", nom: "Consulat Bordeaux fictif" },
  { id: 4, tenant_id: 1, type: "CONSULAT", nom: "Consulat Paris fictif" },
  { id: 5, tenant_id: 1, type: "AMBASSADE", nom: "Ambassade Italie fictive" },
  { id: 6, tenant_id: 1, type: "CONSULAT", nom: "Consulat Milan fictif" },
  { id: 7, tenant_id: 1, type: "ASSOCIATION", nom: "Association fictive" },
  { id: 8, tenant_id: 2, type: "CONSULAT", nom: "Autre tenant" }
];
function relation(parent, enfant, type = "ADMINISTRATIVE_TUTELLE", extra = {}) {
  return { tenant_id: 1, source_organisation_id: parent, target_organisation_id: enfant,
    type, statut: "ACTIVE", actif: true, date_debut: "2026-01-01T00:00:00Z", date_fin: null, ...extra };
}
const liaisons = [
  relation(1, 2, "SUPERVISION"), relation(1, 5, "SUPERVISION"),
  relation(2, 3), relation(2, 4), relation(5, 6),
  relation(2, 7, "COOPERATION"), relation(3, 7, "COMMUNITY_MEMBER"),
  relation(2, 3, "COORDINATION"), relation(2, 4, "COMMUNICATION_AUTHORIZATION"),
  relation(2, 8), relation(8, 2, "SUPERVISION", { tenant_id: 2 })
];
let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS",name); }
function graphe(relations = liaisons, organisations = monde) {
  return construireGrapheInstitutionnel({ organisations, relations, tenantId, dateReference: ref });
}
test("types de liens structurels stricts", () => assert.deepEqual(TYPES_STRUCTURELS, ["SUPERVISION", "ADMINISTRATIVE_TUTELLE"]));
test("collaboration distincte de la tutelle", () => assert(TYPES_COLLABORATION.includes("COOPERATION")));
test("graphe ministère ambassade consulat", () => assert.equal(graphe().relationsStructurelles.length, 5));
test("deux ambassades distinctes", () => assert.deepEqual(descendantsInstitutionnels(graphe(), 1).filter(x => x.type === "AMBASSADE").map(x=>x.id), [2,5]));
test("deux consulats sous France", () => assert.deepEqual(descendantsInstitutionnels(graphe(), 2).map(x=>x.id), [3,4]));
test("consulat Italie indépendant", () => assert.deepEqual(descendantsInstitutionnels(graphe(), 5).map(x=>x.id), [6]));
test("structure nationale complète", () => assert.equal(descendantsInstitutionnels(graphe(), 1).length, 5));
test("organisation tiers exclue du tenant", () => assert(!graphe().organisations.some(x=>x.id===8)));
test("liaison inter-tenant exclue", () => assert(!graphe().relationsStructurelles.some(x=>x.enfantId===8)));
test("coopération ne crée pas d'enfant", () => assert(!descendantsInstitutionnels(graphe(),2).some(x=>x.id===7)));
test("relation communication ne crée pas d'enfant", () => assert(!graphe().relationsStructurelles.some(x=>x.type==="COMMUNICATION_AUTHORIZATION")));
test("tutelle n'est pas une relation de communication", () => assert.equal(estRelationDeCommunicationCandidate(relation(2,3),{tenantId,dateReference:ref}),false));
test("supervision n'est pas une relation de communication", () => assert.equal(estRelationDeCommunicationCandidate(relation(1,2,"SUPERVISION"),{tenantId,dateReference:ref}),false));
test("relation communication reste candidate seulement", () => assert.equal(estRelationDeCommunicationCandidate(relation(2,3,"COMMUNICATION_AUTHORIZATION"),{tenantId,dateReference:ref}),true));
test("association n'est pas communication automatique", () => assert.equal(estRelationDeCommunicationCandidate(relation(3,7,"COMMUNITY_MEMBER"),{tenantId,dateReference:ref}),false));
test("relation révoquée exclue", () => assert.equal(estRelationEffective(relation(2,3,"ADMINISTRATIVE_TUTELLE",{statut:"REVOKED"}),{tenantId,dateReference:ref}),false));
test("relation inactive exclue", () => assert.equal(estRelationEffective(relation(2,3,"ADMINISTRATIVE_TUTELLE",{actif:false}),{tenantId,dateReference:ref}),false));
test("relation expirée exclue", () => assert.equal(estRelationEffective(relation(2,3,"ADMINISTRATIVE_TUTELLE",{date_fin:"2026-01-15T00:00:00Z"}),{tenantId,dateReference:ref}),false));
test("relation future exclue", () => assert.equal(estRelationEffective(relation(2,3,"ADMINISTRATIVE_TUTELLE",{date_debut:"2027-01-01T00:00:00Z"}),{tenantId,dateReference:ref}),false));
test("relation limite fin exclusive", () => assert.equal(estRelationEffective(relation(2,3,"ADMINISTRATIVE_TUTELLE",{date_fin:ref}),{tenantId,dateReference:ref}),false));
test("date invalide exclue", () => assert.equal(estRelationEffective(relation(2,3,"ADMINISTRATIVE_TUTELLE",{date_fin:"demain"}),{tenantId,dateReference:ref}),false));
test("type inconnu exclu", () => assert.equal(estRelationEffective(relation(2,3,"AUTORISE_TOUT"),{tenantId,dateReference:ref}),false));
test("faux booléen ne suffit pas", () => assert.equal(estRelationEffective(relation(2,3,"ADMINISTRATIVE_TUTELLE",{actif:"true"}),{tenantId,dateReference:ref}),false));
test("faux identifiant rejeté", () => assert.equal(estRelationEffective(relation(2,3,"ADMINISTRATIVE_TUTELLE",{target_organisation_id:"3"}),{tenantId,dateReference:ref}),false));
test("cycle détecté et refusé", () => assert.throws(()=>graphe([...liaisons,relation(3,1,"SUPERVISION")]),/Cycle/));
test("relation dupliquée dédupliquée", () => assert.equal(graphe([...liaisons,relation(2,3)]).relationsStructurelles.length, 5));
test("même enfant multi-tutelle sans dupliquer les noeuds", () => assert.equal(descendantsInstitutionnels(graphe([...liaisons,relation(5,3)]),1).length,5));
test("groupe sans lien hiérarchique", () => assert.equal(graphe([relation(2,7,"COOPERATION")]).relationsStructurelles.length,0));
test("tenant invalide refusé", () => assert.throws(()=>construireGrapheInstitutionnel({organisations:monde,relations:liaisons,tenantId:0,dateReference:ref}),/invalide/));
test("date de référence absente refusée", () => assert.throws(()=>construireGrapheInstitutionnel({organisations:monde,relations:liaisons,tenantId:1}),/invalide/));
test("organisation de départ hors graphe refusée", () => assert.throws(()=>descendantsInstitutionnels(graphe(),8),/invalide/));
test("aucune permission héritée dans le résultat", () => {
  const s=JSON.stringify(graphe());
  assert(!/permission|dossier|document|courrier|metadata|date_naissance|prenom|profil/i.test(s));
});
test("aucune donnée sensible copiée depuis les organisations",()=>{
  const result=graphe(liaisons,monde.map(x=>({...x,adresse_secrete:"PRIVE",permissions:["TOUT"]})));
  assert(!JSON.stringify(result).includes("PRIVE"));
});
console.log(`A2_5_CONTRATS_OK ${n} scénarios synthétiques; PostgreSQL=NON; HTTP=NON; AUCUN droit accordé`);

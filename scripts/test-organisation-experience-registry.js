"use strict";
// Tests unitaires locaux, sans PostgreSQL ni HTTP.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { creerRegistreExperiencesOrganisation } = require("../organisation-experience-registry");

const acteur = { personneId: 123 };
let calls = [];
let droits = new Set(["VIEW_ORGANISATION_EXPERIENCES", "MANAGE_ORGANISATION_EXPERIENCES"]);
let resultats = [{ active: false }];
const service = creerRegistreExperiencesOrganisation({
    requete: async (sql, args) => {
        calls.push({sql, args});
        return { rows: resultats };
    },
    autoriser: async ({acteur: a, tenantId, organisationId, action}) =>
        a.personneId === 123 && tenantId === 20 && organisationId === 70 && droits.has(action)
});
const req = { acteur, tenantId: 20, organisationId: 70, codeExperience: "MON_CONSULAT" };
async function main() {
    assert.equal(await service.estActive(req), false, "Absence d'activation = refus implicite");
    assert.deepEqual(calls.at(-1).args, [20, 70, "MON_CONSULAT"]);
    assert.match(calls.at(-1).sql, /o\.tenant_id = a\.tenant_id/);
    assert.match(calls.at(-1).sql, /a\.organisation_id = \$2/);
    resultats = [{active: true}];
    assert.equal(await service.estActive(req), true);

    const beforeWrong = calls.length;
    await assert.rejects(() => service.estActive({...req,organisationId:71}), /Accès non autorisé/);
    await assert.rejects(() => service.estActive({...req,tenantId:21}), /Accès non autorisé/);
    assert.equal(calls.length, beforeWrong, "Interdiction avant toute requête");
    await assert.rejects(() => service.estActive({...req,codeExperience:"x'; DELETE"}), /invalide/);
    await assert.rejects(() => service.definirStatut({...req,statut:"SUPERUSER"}), /invalide/);
    droits.delete("MANAGE_ORGANISATION_EXPERIENCES");
    await assert.rejects(() => service.definirStatut({...req,statut:"ACTIVE"}), /Accès non autorisé/);
    droits.add("MANAGE_ORGANISATION_EXPERIENCES");
    resultats = [{id:1,statut:"ACTIVE"}];
    const r = await service.definirStatut({...req,statut:"ACTIVE"});
    assert.equal(r.statut,"ACTIVE");
    assert.deepEqual(calls.at(-1).args,[20,70,"MON_CONSULAT","ACTIVE",123]);
    assert.match(calls.at(-1).sql, /ON CONFLICT \(tenant_id, organisation_id, experience_id\)/);
    resultats = [];
    await assert.rejects(() => service.definirStatut({...req,statut:"INACTIVE"}), /introuvable/);
    assert.equal(calls.at(-1).args[3],"INACTIVE");
    resultats = [{id:1,code:"MON_CONSULAT",statut:"INACTIVE"}];
    const list = await service.lister(req);
    assert.equal(list[0].statut,"INACTIVE");
    assert.match(calls.at(-1).sql, /o\.tenant_id = \$2/);
    const noAuth = creerRegistreExperiencesOrganisation({requete:async()=>{throw Error("DB call forbidden");}});
    await assert.rejects(() => noAuth.estActive(req), /Accès non autorisé/);
    const sql = fs.readFileSync(path.join(__dirname,"../database/040_organisation_experience_activations.sql"),"utf8");
    assert.match(sql,/FOREIGN KEY \(organisation_id, tenant_id\)/);
    assert.match(sql,/REFERENCES organisations\(id, tenant_id\)/);
    assert.match(sql,/DEFAULT 'INACTIVE'/);
    assert.doesNotMatch(sql,/INSERT INTO organisation_experience_activations\s*\(/i, "Aucune activation initiale implicite");
    console.log("P3_3_1_REGISTRE_CONTRATS_PASS : autorisations, tenant/org, statut par défaut, SQL paramétré, zéro activation implicite");
    console.log("Tests purement locaux : aucun accès PostgreSQL ou API");
}
main().catch(e=>{console.error(e);process.exitCode=1;});

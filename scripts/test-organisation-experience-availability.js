"use strict";
// Tests de contrats purs. Aucun serveur Express, aucun acces DB ou reseau.
const assert = require("node:assert/strict");
const { creerDisponibiliteExperienceOrganisation } = require("../organisation-experience-availability");

async function main() {
    const active = new Set();
    const calls = [];
    const cle = (t, o, e) => `${t}/${o}/${e}`;
    const requete = async (sql, params) => {
        calls.push({ sql, params });
        assert.match(sql, /a\.organisation_id\s*=\s*\$2/);
        assert.match(sql, /a\.tenant_id\s*=\s*\$1/);
        assert.match(sql, /o\.tenant_id\s*=\s*a\.tenant_id/);
        assert.match(sql, /t\.actif\s*=\s*TRUE/);
        assert.match(sql, /e\.actif\s*=\s*TRUE/);
        assert.match(sql, /a\.statut\s*=\s*'ACTIVE'/);
        assert.deepEqual(params.length, 3);
        return { rows: [{ disponible: active.has(cle(...params)) }] };
    };
    const service = creerDisponibiliteExperienceOrganisation({ requete });
    const A = { tenantId: 10, organisationId: 70, codeExperience: "MON_CONSULAT" };
    const B = { tenantId: 10, organisationId: 71, codeExperience: "MON_CONSULAT" };
    const C = { tenantId: 11, organisationId: 72, codeExperience: "MON_CONSULAT" };
    assert.equal(await service.estDisponible(A), false, "A absent = indisponible");
    assert.equal(await service.estDisponible(B), false, "B absent = indisponible");
    assert.equal(await service.estDisponible(C), false, "C absent = indisponible");

    active.add(cle(10, 70, "MON_CONSULAT"));
    assert.equal(await service.estDisponible(A), true, "A active = disponible");
    assert.equal(await service.estDisponible(B), false, "B reste inactive");
    assert.equal(await service.estDisponible(C), false, "Autre tenant reste inactif");
    assert.equal(await service.estDisponible({ ...A, tenantId: 11 }), false, "Mauvais tenant refuse implicitement");
    assert.equal(await service.estDisponible({ ...A, codeExperience: "DIASPORA" }), false, "Autre experience non active");

    active.add(cle(10, 71, "MON_CONSULAT"));
    active.delete(cle(10, 70, "MON_CONSULAT"));
    assert.equal(await service.estDisponible(A), false, "Desactivation A isolee");
    assert.equal(await service.estDisponible(B), true, "B reste active");
    assert.equal(await service.estDisponible(C), false, "C reste inactive");

    const avant = calls.length;
    for (const champ of [
        {}, { ...A, tenantId: "10" }, { ...A, organisationId: 0 },
        { ...A, tenantId: 1.2 }, { ...A, codeExperience: "MON_CONSULAT';DROP TABLE" },
        { ...A, codeExperience: "mon_consulat" }
    ]) {
        await assert.rejects(service.estDisponible(champ), TypeError);
    }
    assert.equal(calls.length, avant, "Parametres invalides refuses avant toute requete");
    assert.throws(() => creerDisponibiliteExperienceOrganisation(), TypeError);

    const dbError = creerDisponibiliteExperienceOrganisation({ requete: async () => { throw Error("DB indisponible"); } });
    await assert.rejects(dbError.estDisponible(A), /DB indisponible/, "Aucune bascule permissive en cas de panne DB");
    const wrongRow = creerDisponibiliteExperienceOrganisation({ requete: async () => ({ rows: [{ disponible: "t" }] }) });
    await assert.rejects(wrongRow.estDisponible(A), /invalide/, "Aucun TRUE suppose si la reponse SQL est anormale");

    console.log("P3_3_4A_DISPONIBILITE_CONTRATS_PASS : A/B/C, tenants, codes, zero activation implicite, erreur SQL sans ouverture");
    console.log("P3_3_4A_AUCUN_MONTAGE : module interne uniquement, sans changement des routes Bordeaux");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

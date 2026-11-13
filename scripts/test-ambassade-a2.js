"use strict";
/** Tests HTTP contractuels A2 sans Express, réseau ni PostgreSQL. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { creerRoutesCommunicationsInstitutionnelles } = require("../institution-communications-http");

function fixture(overrides = {}) {
    let handler;
    const traces = [];
    const router = {
        get: (route, fn) => { assert.equal(route, "/:organisationId/publications"); handler = fn; },
        post: () => { throw Error("A2 doit rester en lecture seule"); },
        put: () => { throw Error("A2 doit rester en lecture seule"); },
        delete: () => { throw Error("A2 doit rester en lecture seule"); }
    };
    const dependances = {
        router,
        listerOrganisationsPersonne: async (personneId, tenant) => {
            traces.push(["liaisons", personneId, tenant]);
            return [{ id: 2, tenant_code: "SN", type: "AMBASSADE" }];
        },
        trouverOrganisation: async (id, tenant) => {
            traces.push(["organisation", id, tenant]);
            return { id: 2, tenant_id: 1, type: "AMBASSADE", nom: "Ambassade synthétique" };
        },
        listerPublicationsVisibles: async (personneId, id, tenant) => {
            traces.push(["publications", personneId, id, tenant]);
            return [
                { id: 8, organisation_id: 2, statut: "PUBLIEE", titre: "Message fictif", contenu: "Information fictive", categorie: "INFORMATION", priorite: "NORMALE", date_publication: "2026-11-13", communication_channel_nom: "Informations", medias: [{ secret: "ne pas exposer" }], publie_par: 999 },
                { id: 9, organisation_id: 3, statut: "PUBLIEE", titre: "AUTRE ORGANISATION" },
                { id: 10, organisation_id: 2, statut: "BROUILLON", titre: "BROUILLON" }
            ];
        }, ...overrides
    };
    creerRoutesCommunicationsInstitutionnelles(dependances);
    assert.equal(typeof handler, "function");
    async function appel(reqOverride = {}) {
        const req = { auth: { personneId: 5 }, params: { organisationId: "2" }, query: { tenant: "SN" }, ...reqOverride };
        const res = {
            code: 200, headers: {}, body: null,
            set(k, v) { this.headers[k] = v; return this; },
            status(code) { this.code = code; return this; },
            json(body) { this.body = body; return this; }
        };
        await handler(req, res);
        assert.equal(res.headers["Cache-Control"], "no-store");
        return res;
    }
    return { appel, traces };
}
async function main() {
    let total = 0;
    async function test(name, fn) { await fn(); total++; console.log("PASS", name); }
    await test("session absente : 401, zéro accès Core", async () => {
        const h = fixture(); const r = await h.appel({ auth: undefined });
        assert.equal(r.code, 401); assert.equal(h.traces.length, 0);
    });
    await test("id non numérique : 400, zéro accès Core", async () => {
        const h = fixture(); const r = await h.appel({ params: {organisationId: "2 OR 1=1"} });
        assert.equal(r.code, 400); assert.equal(h.traces.length, 0);
    });
    await test("tenant invalidé : 400", async () => {
        const h = fixture(); assert.equal((await h.appel({ query: {tenant: "fr"} })).code, 400);
        assert.equal(h.traces.length, 0);
    });
    await test("rattachement absent : 403 sans lecture", async () => {
        const h = fixture({ listerOrganisationsPersonne: async () => [] });
        const r = await h.appel(); assert.equal(r.code, 403); assert.equal(h.traces.length, 0);
    });
    await test("autre type d'organisation : 403", async () => {
        const h = fixture({ listerOrganisationsPersonne: async () => [{id:2,tenant_code:"SN",type:"CONSULAT"}] });
        assert.equal((await h.appel()).code, 403); assert.equal(h.traces.length, 0);
    });
    await test("mauvais tenant : 403", async () => {
        const h = fixture({ listerOrganisationsPersonne: async () => [{id:2,tenant_code:"FR",type:"AMBASSADE"}] });
        assert.equal((await h.appel()).code, 403); assert.equal(h.traces.length, 0);
    });
    await test("type réel invalidé par base : 403 avant Communication", async () => {
        const h = fixture({ trouverOrganisation: async () => ({id:2,type:"CONSULAT"}) });
        assert.equal((await h.appel()).code, 403);
        assert.deepEqual(h.traces, [["liaisons",5,"SN"]]);
    });
    await test("accès publié : projection des seuls contenus autorisés", async () => {
        const h = fixture(); const r = await h.appel();
        assert.equal(r.code, 200); assert.equal(r.body.publications.length,1);
        assert.equal(r.body.publications[0].titre,"Message fictif");
        assert.ok(!("medias" in r.body.publications[0]));
        assert.ok(!("publie_par" in r.body.publications[0]));
        assert.deepEqual(h.traces, [["liaisons",5,"SN"],["organisation",2,"SN"],["publications",5,2,"SN"]]);
    });
    await test("aucune publication : réponse vide explicite", async () => {
        const h = fixture({ listerPublicationsVisibles: async () => [] }); const r = await h.appel();
        assert.equal(r.code,200); assert.deepEqual(r.body.publications,[]);
    });
    await test("erreur backend : non-divulgation et échec fermé", async () => {
        const old = console.error; console.error = () => {};
        try {
            const h = fixture({ listerPublicationsVisibles: async () => { throw Error("SECRET_DE_TEST"); } });
            const r = await h.appel(); assert.equal(r.code,500); assert.equal(JSON.stringify(r.body).includes("SECRET_DE_TEST"),false);
        } finally { console.error = old; }
    });
    await test("interface DOM : aucune insertion HTML brute", async () => {
        const js = fs.readFileSync(path.resolve(__dirname,"../public/ambassade.js"),"utf8");
        assert.doesNotMatch(js,/\.innerHTML\s*=/);
        assert.match(js,/textContent/);
        assert.match(js,/SATEER_CONTEXT_READY/);
        assert.match(js,/\/api\/institution-communications\//);
    });
    await test("montage : exactement une route partagée derrière session", async () => {
        const source = fs.readFileSync(path.resolve(__dirname,"../server.js"),"utf8");
        assert.equal((source.match(/\/api\/institution-communications/g)||[]).length,1);
        assert.match(source,/app\.use\("\/api\/institution-communications", exigerSession/);
        assert.match(source,/listerPublicationsVisibles:\s*listerPublicationsVisiblesPourPersonneDatabase/);
    });
    console.log("AMBASSADE_A2_CONTRATS_PASS="+total);
}
main().catch(e => { console.error(e); process.exitCode = 1; });

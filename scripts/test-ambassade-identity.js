"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { identifierAmbassade, appliquerIdentite, initialiser } = require("../public/ambassade-identity.js");
const root = path.resolve(__dirname, "..");
let pass = 0;
function ok(condition, message) { assert.ok(condition, message); pass++; }
const contexte = { organisations: [
  { id: 333, type: "AMBASSADE", nom: "Ambassade de recette", tenant_code: "AMBVIS_TEST" },
  { id: 444, type: "CONSULAT", nom: "Consulat de recette", tenant_code: "AMBVIS_TEST" },
  { id: 555, type: "AMBASSADE", nom: "Autre Ambassade", tenant_code: "AUTRE" }
] };
const cas = (pathname, extra, org=333, tenant="AMBVIS_TEST", ctx=contexte) =>
  identifierAmbassade({ pathname, search:`?organisation=${org}&tenant=${tenant}${extra}`, contexte:ctx });
for (const [page, extra] of [
  ["/ambassade.html", ""],
  ["/demande.html", "&source=MON_AMBASSADE"],
  ["/demande-detail.html", "&source=MON_AMBASSADE"],
  ["/unit-workspace.html", "&unit=265"],
  ["/publication-institutionnelle.html", "&from=AMBASSADE"]
]) {
  const v = cas(page, extra);
  ok(v?.organisationId === 333 && v?.tenantCode === "AMBVIS_TEST", `${page} activée sur Ambassade réellement rattachée`);
}
for (const [page, extra, org, tenant, ctx] of [
  ["/consulat.html", "", 333],
  ["/demande.html", "&source=MON_CONSULAT", 333],
  ["/demande.html", "", 333],
  ["/demande-detail.html", "&source=MON_CONSULAT", 333],
  ["/publication-institutionnelle.html", "", 333],
  ["/publication-institutionnelle.html", "&from=CONSULAT", 333],
  ["/unit-workspace.html", "&unit=265", 444],
  ["/ambassade.html", "", 444],
  ["/ambassade.html", "", 333, "AUTRE"],
  ["/ambassade.html", "", 555, "AMBVIS_TEST"],
  ["/ambassade.html", "", 999],
  ["/ambassade.html", "", 333, "AMBVIS_TEST", { organisations: [] }],
  ["/ambassade.html", "", 333, "AMBVIS_TEST", {}],
  ["/ambassade.html", "", "333 OR 1=1"],
  ["/ambassade.html", "", "0x14D"]
]) ok(cas(page, extra, org, tenant, ctx) === null, `Aucune identité Ambassade hors contexte : ${page} ${extra} ${org} ${tenant}`);
class FakeNode {
  constructor(tag="div") {this.tagName=tag;this.children=[];this.textContent="";this.className="";this.attrs={};}
  append(...items) {this.children.push(...items);}
  prepend(...items) {this.children.unshift(...items);}
  setAttribute(k,v) {this.attrs[k]=v;}
}
function mockDoc() {
  const header=new FakeNode("header"), main=new FakeNode("main"), classes=new Set();
  return {
    header, main, classes,
    body: { classList: { add: x=>classes.add(x) } },
    title: "SATEER",
    querySelector: s=>s.includes("header.header")?header:s==="main"?main:null,
    createElement: tag=>new FakeNode(tag)
  };
}
(async()=>{
  const d = mockDoc(), v=cas("/unit-workspace.html","&unit=265");
  ok(appliquerIdentite(d, v) === true,"Thème appliqué dans un Workspace validé");
  ok(d.classes.has("sx-ambassade-mode"),"Classe strictement contextuelle");
  ok(d.header.children.length===1 && d.header.children[0].textContent.includes("RECETTE"),"En-tête explicite de recette");
  ok(d.main.children.length===1,"Bandeau de contexte ajouté une seule fois");
  ok(d.main.children[0].children[1].textContent.includes("Ambassade de recette"),"Nom d'organisation provenant du Core");
  const blocked = mockDoc();
  ok(appliquerIdentite(blocked, cas("/unit-workspace.html","&unit=444",444)) === false,"Consulat inchangé");
  ok(blocked.classes.size===0 && blocked.main.children.length===0,"Aucune fuite de thème dans le Consulat");
  const refused = mockDoc();
  ok(await initialiser({document:refused,location:{pathname:"/demande.html",search:"?organisation=444&tenant=AMBVIS_TEST&source=MON_AMBASSADE"},SATEER_CONTEXT_READY:Promise.resolve(contexte)})===false,"L'URL seule n'accorde pas l'identité");
  const ready = mockDoc();
  ok(await initialiser({document:ready,location:{pathname:"/demande.html",search:"?organisation=333&tenant=AMBVIS_TEST&source=MON_AMBASSADE"},SATEER_CONTEXT_READY:Promise.resolve(contexte)})===true,"Session validée avant le thème");
  const rejection=mockDoc();
  ok(await initialiser({document:rejection,location:{pathname:"/ambassade.html",search:"?organisation=333&tenant=AMBVIS_TEST"},SATEER_CONTEXT_READY:Promise.reject(new Error("AUTH"))})===false,"Session refusée : thème désactivé");
  ok(!rejection.classes.size,"Aucun badge sans session");
  for(const page of ["ambassade.html","demande.html","demande-detail.html","unit-workspace.html","publication-institutionnelle.html"]){
    const html=fs.readFileSync(path.join(root,"public",page),"utf8");
    ok(html.includes('href="/ambassade-identity.css"'),`CSS chargé dans ${page}`);
    ok(html.includes('src="/ambassade-identity.js"'),`JS chargé dans ${page}`);
  }
  const css=fs.readFileSync(path.join(root,"public/ambassade-identity.css"),"utf8");
  ok(css.includes("body.sateer-ambassade") && css.includes("body.sx-ambassade-mode"),"CSS contextuel Ambassade seulement");
  ok(!css.match(/(^|\n)\s*(body\s*\{|:root\s*\{|\.unit-workspace-header\s*\{)/),"Aucune règle racine globale dans A11");
  const js=fs.readFileSync(path.join(root,"public/ambassade-identity.js"),"utf8");
  ok(!js.includes("innerHTML") && !js.includes("localStorage") && !js.includes("sessionStorage"),"Pas de HTML injecté ni stockage client");
  const base=fs.readFileSync(path.join(root,"public/ambassade.html"),"utf8");
  ok(base.includes('class="ambassade-hero"') && base.includes('id="ambassadeDemandeLink"') && base.includes('id="ambassadeOperationsContenu"'),"Nouvelle façade sans supprimer les points d'ancrage métier");
  console.log(`A11_AMBASSADE_IDENTITE_PASS=${pass}`);
})().catch(err=>{console.error(err);process.exitCode=1;});

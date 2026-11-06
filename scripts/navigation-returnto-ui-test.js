"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const loginSource = fs.readFileSync(path.join(__dirname, "../public/login.js"), "utf8");
const authSource = fs.readFileSync(path.join(__dirname, "../public/auth-client.js"), "utf8");

function field(value = "") { return { value, disabled: false, textContent: "", hidden: false }; }

async function submitLogin(search) {
  let submitHandler;
  let destination = null;
  const elements = {
    loginForm: { addEventListener(type, handler) { if (type === "submit") submitHandler = handler; } },
    loginError: field(),
    loginSubmit: field("Se connecter"),
    identifiant: field("vice-consul-test"),
    motDePasse: field("synthétique")
  };
  const window = {
    location: { origin: "http://sateer.test", search, replace(value) { destination = value; } }
  };
  const context = {
    window, document: { getElementById(id) { return elements[id]; } },
    URL, URLSearchParams, fetch: async () => ({ ok: true, async json() { return {}; } }),
    console, Error
  };
  vm.runInNewContext(loginSource, context, { filename: "public/login.js" });
  await submitHandler({ preventDefault() {} });
  return destination;
}

async function captureReturnTo(pathname, search) {
  let destination = null;
  const window = {
    location: { origin: "http://sateer.test", pathname, search, replace(value) { destination = value; } },
    addEventListener() {}
  };
  const context = {
    window, document: { getElementById() { return null; } },
    fetch: async () => ({ ok: false }), URL, URLSearchParams, console
  };
  vm.runInNewContext(authSource, context, { filename: "public/auth-client.js" });
  await window.SATEER_CONTEXT_READY.catch(() => {});
  return destination;
}

(async () => {
  assert.equal(await submitLogin(""), "/index.html", "Connexion générale ouvre Mon SATEER.");
  console.log("OK - connexion générale → Mon SATEER");

  const professional = "/dashboard-vice-consul.html?organisation=87&tenant=BORDEAUX";
  const requestedPage = "/publication-institutionnelle.html?organisation=87&tenant=BORDEAUX";
  const requested = "/login.html?returnTo=" + encodeURIComponent(requestedPage);
  assert.equal(await captureReturnTo("/publication-institutionnelle.html", "?organisation=87&tenant=BORDEAUX"), requested,
    "Une page professionnelle non authentifiée conserve sa destination et son contexte.");
  assert.equal(await submitLogin("?returnTo=" + encodeURIComponent(professional)), professional,
    "Après connexion, la destination professionnelle locale est reprise.");
  console.log("OK - destination professionnelle et contexte organisation/tenant conservés");

  assert.equal(await submitLogin("?returnTo=" + encodeURIComponent("https://outside.example/")), "/index.html",
    "Une destination externe est rejetée.");
  assert.equal(await submitLogin("?returnTo=" + encodeURIComponent("//outside.example/")), "/index.html",
    "Une destination protocol-relative externe est rejetée.");
  console.log("OK - redirections externes rejetées");

  const appSource = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(appSource, /Aucune information officielle accessible à votre profil pour le moment\./);
  assert.match(appSource, /lienVers\(path, org\.id, tenant\)/,
    "Les liens professionnels utilisent l’organisation et son tenant.");
  assert.match(appSource, /org\.tenant_code \|\| contexte\.tenantCode/,
    "Le tenant de l’organisation prévaut quand le contexte global n’en porte pas.");
  const dashboardSource = fs.readFileSync(path.join(__dirname, "../public/dashboard-vice-consul.js"), "utf8");
  assert.match(dashboardSource, /tenant = organisation\.tenant_code \|\| contexte\.tenantCode/,
    "Le dashboard Vice-Consul construit ses liens depuis le tenant de l’organisation sélectionnée.");
  console.log("OK - message vide clarifié et liens professionnels contextualisés");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

"use strict";
// SATEER — Recette Bordeaux: quatre dossiers synthétiques conservés dans sateer_test.
// Aucun compte réel ni donnée d'un autre tenant n'est modifié.
// Usage: node scripts/bordeaux-dossiers-persistants.js setup|verify
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { Client } = require("pg");
const { hacherMotDePasse } = require("../auth-passwords");

const DB = "sateer_test";
const SYS = "7699611241381229531";
const TENANT = "P6V_3B5AC5AB9DB04657";
const ORG = 70;
const KEY = "BORDEAUX_DOSSIERS_PERSISTANTS_V1";
const STORE = path.join(process.cwd(), ".sateer-backups", "bordeaux-dossiers-persistants-v1");
const MANIFEST = path.join(STORE, "manifest.json");
const CREDS = path.join(STORE, "comptes-demonstration.txt");
const ORIGIN = "http://127.0.0.1:3200";

function refuser(condition, message) { assert.ok(condition, message); }
function pg() {
  refuser(process.env.PGDATABASE === DB, "PGDATABASE=sateer_test requis");
  refuser(process.env.PGHOST === "::1", "PGHOST=::1 requis");
  refuser(String(process.env.PGPORT) === "5432", "PGPORT=5432 requis");
  return new Client({ database: DB, host: "::1", port: 5432,
    user: process.env.PGUSER || process.env.USER,
    ...(process.env.PGPASSWORD ? { password: process.env.PGPASSWORD } : {}) });
}
async function identite(c) {
  const r = await c.query("SELECT current_database() db, (SELECT system_identifier::text FROM pg_control_system()) sid");
  assert.equal(r.rows[0]?.db, DB, "Base interdite");
  assert.equal(r.rows[0]?.sid, SYS, "Instance PostgreSQL interdite");
  const org = await c.query(`SELECT o.id, o.nom, o.type, t.code tenant, t.type tenant_type, t.id tenant_id
    FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1`, [ORG]);
  assert.equal(org.rowCount, 1, "Organisation pilote absente");
  assert.equal(org.rows[0].tenant, TENANT, "Tenant incorrect");
  assert.equal(org.rows[0].tenant_type, "TEST_SYNTHETIQUE", "Tenant non synthétique : STOP");
  assert.equal(org.rows[0].type, "CONSULAT", "Organisation non consulaire : STOP");
  refuser(/^Organisation recette P6 /.test(org.rows[0].nom), "Organisation non reconnue comme recette P6");
  return Number(org.rows[0].tenant_id);
}
async function regles(c, tenantId) {
  const r = await c.query(`SELECT r.category_key category, r.destination_unit_id unit_id, u.nom unit_name,
    u.actif unit_active, u.organisation_id unit_org
    FROM organisation_routing_rules r JOIN organisation_units u ON u.id=r.destination_unit_id
    WHERE r.organisation_id=$1 AND r.tenant_id=$2 AND r.source='MON_CONSULAT'
      AND r.actif=true AND r.category_key=ANY($3::text[])
    ORDER BY r.category_key`, [ORG, tenantId, ["PASSEPORT", "ETAT_CIVIL", "CARTE_CONSULAIRE"]]);
  const map = Object.fromEntries(r.rows.map(x => [x.category, x]));
  for (const cat of ["PASSEPORT", "ETAT_CIVIL", "CARTE_CONSULAIRE"]) {
    refuser(map[cat] && map[cat].unit_active && Number(map[cat].unit_org) === ORG,
      `Règle P6 ${cat} absente, désactivée ou hors organisation`);
  }
  assert.equal(Number(map.PASSEPORT.unit_id), Number(map.CARTE_CONSULAIRE.unit_id),
    "La recette attend Passeport et Carte consulaire vers le même bureau");
  refuser(Number(map.PASSEPORT.unit_id) !== Number(map.ETAT_CIVIL.unit_id),
    "Les deux bureaux de démonstration doivent être distincts");
  const units = [Number(map.PASSEPORT.unit_id), Number(map.ETAT_CIVIL.unit_id)];
  const caps = await c.query(`SELECT uc.organisation_unit_id, cap.code FROM organisation_unit_capabilities uc
    JOIN capabilities cap ON cap.id=uc.capability_id
    WHERE uc.organisation_unit_id=ANY($1::int[]) AND uc.actif AND cap.actif`, [units]);
  for (const unitId of units) for (const code of ["RECEIVE_INCOMING", "VIEW_INBOX"]) {
    refuser(caps.rows.some(x => Number(x.organisation_unit_id) === unitId && x.code === code),
      `Capacité ${code} manquante dans le bureau ${unitId}`);
  }
  return map;
}
async function verifierDonnees(c, m) {
  const tenantId = await identite(c);
  refuser(m.key === KEY && m.tenant === TENANT && m.orgId === ORG, "Manifeste de recette invalide");
  const d = await c.query(`SELECT id, categorie, statut, priorite, objet, destination_unit_id,
    personne_id, assignee_a, metadata FROM demandes
    WHERE organisation_id=$1 AND tenant_id=$2 AND metadata->>'fixtureKey'=$3 ORDER BY id`, [ORG, tenantId, KEY]);
  assert.equal(d.rowCount, 4, "Il faut exactement quatre dossiers de cette recette");
  const states = d.rows.map(x => x.statut).sort();
  assert.deepEqual(states, ["EN_COURS", "NOUVELLE", "NOUVELLE", "TRAITEE"]);
  assert.equal(d.rows.filter(x => x.priorite === "URGENTE").length, 1);
  assert.deepEqual(d.rows.map(x=>Number(x.id)).sort((a,b)=>a-b), m.demandIds.slice().sort((a,b)=>a-b));
  refuser(d.rows.every(x=>x.destination_unit_id && x.objet.includes("[DEMO BORDEAUX]")), "Dossiers mal orientés ou non marqués");
  const counts = await c.query(`SELECT (SELECT count(*)::int FROM personnes WHERE id=ANY($1::int[])) people,
     (SELECT count(*)::int FROM auth_accounts WHERE personne_id=ANY($1::int[])) accounts,
     (SELECT count(*)::int FROM demande_history WHERE demande_id=ANY($2::bigint[])) history,
     (SELECT count(*)::int FROM demande_reponses WHERE demande_id=ANY($2::bigint[])) replies
     `, [m.personIds, m.demandIds]);
  assert.equal(counts.rows[0].people, 5); assert.equal(counts.rows[0].accounts, 5);
  refuser(counts.rows[0].history >= 7, "Historique insuffisant");
  assert.equal(counts.rows[0].replies, 1, "La réponse du dossier traité est absente");
  console.log("DB_PERSISTENT_DEMO_PASS : 4 dossiers, 5 comptes synthétiques, historique et réponse conservés.");
  return d.rows;
}
function protectedRead(file) {
  const stat = fs.statSync(file);
  assert.equal(stat.mode & 0o077, 0, `Permissions du fichier privé insuffisantes: ${file}`);
  return fs.readFileSync(file, "utf8");
}
async function api(url, cookie, method = "GET", body) {
  const response = await fetch(ORIGIN + url, { method, redirect: "manual", headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {})
  }, ...(body ? {body: JSON.stringify(body)} : {}) });
  const raw = await response.text();
  let json; try { json = JSON.parse(raw); } catch { json = { raw: raw.slice(0,160) }; }
  return { status: response.status, json };
}
async function login(user) {
  // Une seule authentification par profil; lire le cookie de cette réponse.
  const response = await fetch(ORIGIN + "/api/auth/login", {
    method: "POST", redirect: "manual", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifiant:user.login, motDePasse:user.password }) });
  assert.equal(response.status, 200, `Session refusée (${user.label})`);
  const rawCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  const cookie = rawCookies.map(v=>v.split(";")[0]).find(v=>v.startsWith("sateer_session="));
  assert.ok(cookie, `Cookie absent (${user.label})`);
  return cookie;
}
function parseCreds() {
  const raw = protectedRead(CREDS);
  return raw.split("\n\n").map(block => {
    const [label, login, password] = block.trim().split("\n");
    return {label, login:login?.replace(/^Identifiant : /,""), password:password?.replace(/^Mot de passe : /,"")};
  }).filter(x => x.label);
}
async function verificationHttp(c, manifest, rows) {
  const users = Object.fromEntries(parseCreds().map(x=>[x.label,x]));
  for (const label of ["CITOYEN_SAMBA","CITOYEN_AWA","AGENT_PASSEPORTS","AGENT_ETAT_CIVIL","CONSUL"]) assert.ok(users[label], `Identifiants manquants: ${label}`);
  const cookies={}; for (const [key,user] of Object.entries(users)) cookies[key]=await login(user);
  const pathDemand = id => `/api/demandes/${id}?organisationId=${ORG}&tenant=${TENANT}`;
  for (const row of rows) {
    const own = Number(row.personne_id) === manifest.people.SAMBA ? "CITOYEN_SAMBA" : "CITOYEN_AWA";
    const other = own === "CITOYEN_SAMBA" ? "CITOYEN_AWA" : "CITOYEN_SAMBA";
    const detail = await api(pathDemand(row.id), cookies[own]);
    assert.equal(detail.status, 200, `Citoyen propriétaire ne lit pas dossier ${row.id}`);
    assert.equal(detail.json.demande.statut, row.statut);
    const denied = await api(pathDemand(row.id), cookies[other]);
    assert.equal(denied.status, 404, `Autre citoyen peut lire dossier ${row.id}`);
    if(row.statut === "TRAITEE") refuser(detail.json.reponses?.length === 1, "La réponse citoyen doit être visible");
  }
  const rules = manifest.units;
  const pass = await api(`/api/organisations/${ORG}/units/${rules.passport}/inbox?tenant=${TENANT}`, cookies.AGENT_PASSEPORTS);
  assert.equal(pass.status, 200, `Inbox Passeports HTTP ${pass.status}`);
  refuser(rows.filter(x=>Number(x.destination_unit_id)===rules.passport).every(x=>pass.json.demandes.some(d=>Number(d.id)===Number(x.id))), "Un dossier manque dans le bureau Passeports");
  const civil = await api(`/api/organisations/${ORG}/units/${rules.civil}/inbox?tenant=${TENANT}`, cookies.AGENT_ETAT_CIVIL);
  assert.equal(civil.status, 200, `Inbox État civil HTTP ${civil.status}`);
  refuser(rows.filter(x=>Number(x.destination_unit_id)===rules.civil).every(x=>civil.json.demandes.some(d=>Number(d.id)===Number(x.id))), "Un dossier manque dans le bureau État civil");
  const wrong = await api(`/api/organisations/${ORG}/units/${rules.civil}/inbox?tenant=${TENANT}`, cookies.AGENT_PASSEPORTS);
  assert.equal(wrong.status, 403, "Isolement entre les bureaux non respecté");
  const strategic = await api(`/api/organisations/${ORG}/dashboard-strategique?tenant=${TENANT}`, cookies.CONSUL);
  assert.equal(strategic.status, 200, `Dashboard Consul HTTP ${strategic.status}`);
  refuser(Number(strategic.json.indicateurs?.total) >= 4 && Number(strategic.json.indicateurs?.traitees) >= 1,
    "Dashboard stratégique ne reflète pas les dossiers");
  const deniedOps = await api(`/api/organisations/${ORG}/dashboard-operationnel?tenant=${TENANT}`, cookies.CONSUL);
  assert.equal(deniedOps.status, 403, "Consul ne doit pas avoir automatiquement la vue opérationnelle");
  const vicePath = path.join(os.tmpdir(), `association-relay-${TENANT}-credentials.txt`);
  refuser(fs.existsSync(vicePath), "Fichier protégé du VICE manquant (aucune modification)");
  const viceRaw = protectedRead(vicePath);
  const match = viceRaw.match(/^VICE\r?\nIdentifiant : ([^\r\n]+)\r?\nMot de passe temporaire : ([^\r\n]+)/m);
  refuser(match, "Identifiants VICE protégés illisibles");
  const viceCookie = await login({label:"VICE", login:match[1], password:match[2]});
  const ops = await api(`/api/organisations/${ORG}/dashboard-operationnel?tenant=${TENANT}`, viceCookie);
  assert.equal(ops.status, 200, `Dashboard Vice HTTP ${ops.status}`);
  refuser(Number(ops.json.demandes?.total) >= 4 && Number(ops.json.demandes?.traitees)>=1,
    "Dashboard Vice n'agrège pas les quatre dossiers");
  const opsStrategic = await api(`/api/organisations/${ORG}/dashboard-strategique?tenant=${TENANT}`, viceCookie);
  assert.equal(opsStrategic.status, 403, "Vice accède au dashboard stratégique");
  console.log("BORDEAUX_DOSSIERS_HTTP_PASS : citoyens isolés, deux inbox, dashboard Vice et Consul, permissions séparées.");
}
async function preparerHttp() {
  // Contrôle sans écriture avant toute tentative de création de données.
  const response=await fetch(ORIGIN+"/login.html",{redirect:"manual",signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200,"Serveur HTTP 3200 indisponible");
  const vicePath=path.join(os.tmpdir(), `association-relay-${TENANT}-credentials.txt`);
  refuser(fs.existsSync(vicePath),"Identifiants privés VICE absents : STOP avant toute écriture");
  const match=protectedRead(vicePath).match(/^VICE\r?\nIdentifiant : ([^\r\n]+)\r?\nMot de passe temporaire : ([^\r\n]+)/m);
  refuser(match,"Fichier protégé du compte VICE invalide");
}
async function installer() {
  await preparerHttp();
  const c=pg(); await c.connect();
  try {
    const tenantId=await identite(c);
    const rules=await regles(c,tenantId);
    if(fs.existsSync(MANIFEST)) {
      const m=JSON.parse(protectedRead(MANIFEST));
      const rows=await verifierDonnees(c,m);
      await verificationHttp(c,m,rows);
      console.log("BORDEAUX_DEMO_ALREADY_READY : aucune écriture supplémentaire.");
      return;
    }
    const existing=await c.query(`SELECT COUNT(*)::int n FROM demandes WHERE organisation_id=$1 AND tenant_id=$2 AND metadata->>'fixtureKey'=$3`, [ORG,tenantId,KEY]);
    refuser(existing.rows[0].n===0, "Dossiers déjà présents sans manifeste : arrêt pour éviter doublons");
    refuser(!fs.existsSync(CREDS), "Fichier d'identifiants existant sans manifeste : arrêt");
    const permCodes=["VIEW_INCOMING","VIEW_CASE","TAKE_CASE","PROCESS_CASE","RESPOND_CASE","VIEW_UNIT","VIEW_STRATEGIC_DASHBOARD"];
    const perms=await c.query("SELECT code,id FROM permissions WHERE actif=true AND code=ANY($1::text[])", [permCodes]);
    const p=Object.fromEntries(perms.rows.map(x=>[x.code,Number(x.id)]));
    for(const code of permCodes) refuser(p[code],`Permission absente : ${code}`);
    const capCodes=["TAKE_CASES","PROCESS_CASES","RESPOND_CASES"];
    const caps=await c.query("SELECT code,id FROM capabilities WHERE actif=true AND code=ANY($1::text[])",[capCodes]);
    const capMap=Object.fromEntries(caps.rows.map(x=>[x.code,Number(x.id)]));
    for (const code of capCodes) refuser(capMap[code],`Capacité absente: ${code}`);
    const subjects=[
      ["SAMBA","Samba","CitoyenDemo", "USAGER"], ["AWA","Awa","CitoyenneDemo", "USAGER"],
      ["AGENT_PASS","Moussa","AgentPasseportsDemo","MEMBRE"], ["AGENT_CIVIL","Fatou","AgentEtatCivilDemo","MEMBRE"],
      ["CONSUL","Consul","StrategiqueDemo","MEMBRE"]
    ];
    const generated=subjects.map(([key,first,last,relation])=>({key, first, last, relation,
      login:`bordeaux.demo.v1.${key.toLowerCase()}@sateer.test`,
      password:crypto.randomBytes(32).toString("base64url") + "A1!"}));
    for(const u of generated) u.hash=await hacherMotDePasse(u.password);
    // Une transaction unique contient également la création des comptes : aucun état partiel.
    const m={key:KEY,tenant:TENANT,orgId:ORG,people:{},personIds:[],demandIds:[],roleIds:[],unitCapabilityIds:[],
      units:{ passport:Number(rules.PASSEPORT.unit_id),civil:Number(rules.ETAT_CIVIL.unit_id) }};
    await c.query("BEGIN");
    try {
      // Empêche deux exécutions concurrentes sur cette même recette.
      await c.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [ORG, 2606]);
      const repeat=await c.query(`SELECT COUNT(*)::int n FROM demandes WHERE organisation_id=$1 AND tenant_id=$2 AND metadata->>'fixtureKey'=$3`,[ORG,tenantId,KEY]);
      assert.equal(repeat.rows[0].n,0,"Recette concurrente détectée");
      for(const u of generated){
        const r=await c.query(`INSERT INTO personnes(prenom,nom,profil,pays_residence,departement)
          VALUES($1,$2,'BORDEAUX_DEMO_SYNTHETIQUE','France','Bordeaux') RETURNING id`,[u.first,u.last]);
        const id=Number(r.rows[0].id);m.people[u.key]=id;m.personIds.push(id);
        await c.query("INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,$3)",[id,ORG,u.relation]);
        await c.query("INSERT INTO auth_accounts(personne_id,identifiant,mot_de_passe_hash,actif) VALUES($1,$2,$3,true)",[id,u.login,u.hash]);
      }
      // Un rôle distinct par agent et par bureau; aucun rôle existant n'est élargi.
      for(const entry of [{key:"AGENT_PASS",unitId:m.units.passport},{key:"AGENT_CIVIL",unitId:m.units.civil}]){
        const r=await c.query(`INSERT INTO organisation_roles(organisation_id,code,nom,description,scope,metadata)
          VALUES($1,$2,$3,$4,'UNIT',$5::jsonb) RETURNING id`,[ORG,`BORDEAUX_DEMO_${entry.key}_V1`, `Agent démonstration ${entry.key}`,
            "Rôle strictement synthétique pour les dossiers de démonstration", JSON.stringify({fixtureKey:KEY})]);
        const id=Number(r.rows[0].id);m.roleIds.push(id);
        for(const code of ["VIEW_INCOMING","VIEW_CASE","TAKE_CASE","PROCESS_CASE","RESPOND_CASE","VIEW_UNIT"])
          await c.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)",[id,p[code]]);
        await c.query(`INSERT INTO relations_personne_organisation_unit(personne_id,organisation_unit_id,role,role_id,principal,actif)
          VALUES($1,$2,$3,$4,true,true)`,[m.people[entry.key],entry.unitId,`BORDEAUX_DEMO_${entry.key}`,id]);
      }
      const consulRole=await c.query(`INSERT INTO organisation_roles(organisation_id,code,nom,description,scope,metadata)
        VALUES($1,'BORDEAUX_DEMO_CONSUL_V1','Consul stratégique démonstration','Rôle synthétique, lecture stratégique uniquement','ORGANISATION',$2::jsonb) RETURNING id`,
        [ORG,JSON.stringify({fixtureKey:KEY})]);
      const consulRoleId=Number(consulRole.rows[0].id);m.roleIds.push(consulRoleId);
      await c.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)",[consulRoleId,p.VIEW_STRATEGIC_DASHBOARD]);
      await c.query("INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,true)",
        [m.people.CONSUL,ORG,consulRoleId]);
      // Les unités appartiennent exclusivement au tenant de recette. Ajouter uniquement
      // les capacités requises pour la démonstration du traitement, jamais d'UPDATE de droits.
      for(const unitId of [m.units.passport,m.units.civil]) for(const code of capCodes){
        const prior=await c.query("SELECT id,actif FROM organisation_unit_capabilities WHERE organisation_unit_id=$1 AND capability_id=$2",[unitId,capMap[code]]);
        refuser(!prior.rowCount || prior.rows[0].actif,"Capacité préexistante désactivée: refus de réactivation implicite");
        if(!prior.rowCount){const created=await c.query("INSERT INTO organisation_unit_capabilities(organisation_unit_id,capability_id,actif) VALUES($1,$2,true) RETURNING id",[unitId,capMap[code]]);m.unitCapabilityIds.push(Number(created.rows[0].id));}
      }
      const rows=[
        {person:"SAMBA", category:"PASSEPORT", object:"[DEMO BORDEAUX] Première demande de passeport", priorite:"NORMALE", status:"NOUVELLE", unit:m.units.passport},
        {person:"AWA", category:"PASSEPORT", object:"[DEMO BORDEAUX] Passeport - demande prioritaire", priorite:"URGENTE", status:"NOUVELLE", unit:m.units.passport},
        {person:"SAMBA", category:"ETAT_CIVIL", object:"[DEMO BORDEAUX] Demande de copie d'acte de naissance", priorite:"NORMALE", status:"EN_COURS", agent:m.people.AGENT_CIVIL, unit:m.units.civil},
        {person:"AWA", category:"CARTE_CONSULAIRE", object:"[DEMO BORDEAUX] Renouvellement carte consulaire", priorite:"NORMALE", status:"TRAITEE", agent:m.people.AGENT_PASS, unit:m.units.passport}
      ];
      for(const d of rows){
        const created=await c.query(`INSERT INTO demandes(tenant_id,organisation_id,personne_id,categorie,objet,description,statut,priorite,
          assignee_a,canal,metadata,destination_unit_id,orientee_par,motif_orientation,date_orientation,date_cloture)
          VALUES($1,$2,$3,$4,$5,$6,$7::varchar,$8,$9,'MON_CONSULAT',$10::jsonb,$11,NULL,$12,NOW(),
          CASE WHEN $7::varchar='TRAITEE' THEN NOW() ELSE NULL END) RETURNING id`,
          [tenantId,ORG,m.people[d.person],d.category,d.object,"Contenu fictif exclusivement destiné à la démonstration du pilote Bordeaux.",
            d.status,d.priorite,d.agent||null,JSON.stringify({fixtureKey:KEY,synthetic:true}),d.unit,"Orientation automatique selon la règle P6 de démonstration"]);
        const id=Number(created.rows[0].id);m.demandIds.push(id);
        const events=[{a:m.people[d.person],before:null,after:"NOUVELLE",action:"CREATION",comment:"Demande fictive du citoyen."},
          {a:null,before:"NOUVELLE",after:"NOUVELLE",action:"ORIENTATION_AUTOMATIQUE",comment:`Règle P6 : ${d.category}.`}];
        if(d.status!=="NOUVELLE") events.push({a:d.agent,before:"NOUVELLE",after:"EN_COURS",action:"PRISE_EN_CHARGE",comment:"Dossier pris en charge par l'agent synthétique."});
        if(d.status==="TRAITEE")events.push({a:d.agent,before:"EN_COURS",after:"TRAITEE",action:"REPONSE_ENVOYEE",comment:"Réponse de démonstration transmise au citoyen."});
        for(const e of events) await c.query(`INSERT INTO demande_history(tenant_id,demande_id,auteur_personne_id,ancien_statut,nouveau_statut,action,commentaire)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,[tenantId,id,e.a,e.before,e.after,e.action,e.comment]);
        await c.query(`INSERT INTO demande_orientations(demande_id,ancienne_unit_id,nouvelle_unit_id,orientee_par,motif)
          VALUES($1,NULL,$2,NULL,$3)`,[id,d.unit,`Règle P6 ${d.category} — dossier fictif.`]);
        if(d.status==="TRAITEE"){
          await c.query(`INSERT INTO demande_reponses(tenant_id,demande_id,auteur_personne_id,contenu,type,visible_citoyen)
            VALUES($1,$2,$3,$4,'REPONSE',true)`,[tenantId,id,d.agent,"[DÉMONSTRATION] Votre demande de carte consulaire a été traitée. Aucune démarche réelle n'a été effectuée."]);
          await c.query(`INSERT INTO notifications(tenant_id,personne_id,organisation_id,type,titre,message,reference_type,reference_id,canal,statut,metadata)
            VALUES($1,$2,$3,'REPONSE_DEMANDE','Votre demande a reçu une réponse',$4,'DEMANDE',$5,'SATEER','NON_LUE',$6::jsonb)`,
            [tenantId,m.people[d.person],ORG,`Réponse de démonstration disponible : ${d.object}`,id,JSON.stringify({fixtureKey:KEY})]);
        }
      }
      await c.query("COMMIT");
    } catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}
    // Les secrets sont séparés de Git et du fichier manifeste.
    fs.mkdirSync(STORE,{recursive:true,mode:0o700});
    fs.chmodSync(STORE,0o700);
    fs.writeFileSync(CREDS,generated.map(u=>{
      const labels={SAMBA:"CITOYEN_SAMBA",AWA:"CITOYEN_AWA",AGENT_PASS:"AGENT_PASSEPORTS",AGENT_CIVIL:"AGENT_ETAT_CIVIL",CONSUL:"CONSUL"};
      return `${labels[u.key]}\nIdentifiant : ${u.login}\nMot de passe : ${u.password}`;}).join("\n\n")+"\n",{mode:0o600,flag:"wx"});
    fs.writeFileSync(MANIFEST,JSON.stringify(m,null,2),{mode:0o600,flag:"wx"});
    const actual=await verifierDonnees(c,m);
    await verificationHttp(c,m,actual);
    console.log("=== BORDEAUX_DOSSIERS_PERSISTANTS_PASS ===");
    console.log(`Dossiers conservés : ${m.demandIds.join(", ")}`);
    console.log(`Identifiants privés : ${CREDS}`);
  } finally{await c.end();}
}
installer().catch(e=>{console.error("BORDEAUX_DOSSIERS_STOP:",e.stack||e.message);process.exitCode=1;});

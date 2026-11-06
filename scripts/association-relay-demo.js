"use strict";

// Synthetic association relay fixture and API scenario. Only sateer_test and
// the selected P6 pilot tenant are accepted. Cleanup is explicit and targeted.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Pool } = require("pg");

const DATABASE = "sateer_test";
const SYSTEM_ID = "7699611241381229531";
const TENANT = "P6V_3B5AC5AB9DB04657";
const FIXTURE_KEY = `association-relay-${TENANT}`;
const ROOT = path.join(os.tmpdir(), FIXTURE_KEY);
const MANIFEST = `${ROOT}.json`;
const CREDENTIALS = `${ROOT}-credentials.txt`;
const VICE_CREDENTIALS = CREDENTIALS; // Compte Vice-Consul de recette autonome, sans dépendance P6 temporaire.
const BASE = process.env.SATEER_DEMO_ORIGIN || "http://127.0.0.1:3200";

function guardEnv() {
  if (process.env.PGDATABASE !== DATABASE || process.env.PGHOST !== "::1" || Number(process.env.PGPORT) !== 5432)
    throw new Error("Refus : utiliser explicitement PGDATABASE=sateer_test PGHOST=::1 PGPORT=5432.");
}
function pool() { guardEnv(); return new Pool({database:DATABASE,host:"::1",port:5432,user:process.env.PGUSER||process.env.USER,password:process.env.PGPASSWORD}); }
async function verifyInstance(db) {
  const r=await db.query("SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) system_id");
  assert.equal(r.rows[0]?.db,DATABASE,"Base interdite."); assert.equal(r.rows[0]?.system_id,SYSTEM_ID,"Instance PostgreSQL interdite.");
}
function writePrivate(file,value,exclusive=true) { fs.writeFileSync(file,value,{encoding:"utf8",mode:0o600,flag:exclusive?"wx":"w"});fs.chmodSync(file,0o600); }
function readCredentials(file,role) {
  assert.equal(fs.statSync(file).mode&0o777,0o600,`Fichier d’identifiants non protégé: ${role}`);
  const lines=fs.readFileSync(file,"utf8").split(/\r?\n/), i=lines.findIndex(x=>x.trim()===role);
  assert(i>=0,`Identifiants introuvables: ${role}`);
  const login=lines.slice(i+1).find(x=>x.startsWith("Identifiant : "))?.slice(14).trim();
  const password=lines.slice(i+1).find(x=>x.startsWith("Mot de passe temporaire : "))?.slice(26).trim();
  assert(login&&password,`Identifiants incomplets: ${role}`);return {login,password};
}
function writeManifest(m) { writePrivate(MANIFEST,JSON.stringify(m,null,2)+"\n",false); }

async function setup() {
  const db=pool(), token=crypto.randomBytes(7).toString("hex").toUpperCase();
  assert(!fs.existsSync(MANIFEST)&&!fs.existsSync(CREDENTIALS),"Fixture déjà préparée; aucune donnée ni fichier remplacé.");
  const accounts=[
    {role:"RESPONSABLE_ASSOCIATIF",login:`association.${token.toLowerCase()}.responsable@sateer.test`,password:`Asso!${crypto.randomBytes(18).toString("base64url")}`},
    {role:"MEMBRE_ASSOCIATION",login:`association.${token.toLowerCase()}.membre@sateer.test`,password:`Asso!${crypto.randomBytes(18).toString("base64url")}`},
    {role:"VICE",login:`association.${token.toLowerCase()}.vice@sateer.test`,password:`Vice!${crypto.randomBytes(18).toString("base64url")}`}
  ];
  let manifest={version:1,state:"PREPARING",token,tenant:TENANT,organisationId:null,issuerId:null,vicePersonId:null,viceRoleId:null,vicePermissionRolePermissionId:null,
    associationRoleId:null,people:[],accounts:[],invitationIds:[],relationId:null,channelId:null,publicationId:null,authorizationId:null,relayId:null,
    manifestPath:MANIFEST,credentialsPath:CREDENTIALS,createdAt:new Date().toISOString()};
  try {
    // No manifest or credentials are created before the authorized PostgreSQL
    // instance has been verified. Avoid blocking a retry on a preflight error.
    await verifyInstance(db);
    writePrivate(MANIFEST,JSON.stringify(manifest,null,2)+"\n");
    writePrivate(CREDENTIALS,accounts.map(x=>`${x.role}\nIdentifiant : ${x.login}\nMot de passe temporaire : ${x.password}`).join("\n\n")+"\n");
    const client=await db.connect();
    try {
      await client.query("BEGIN");
      // Sélectionner uniquement le Consulat de recette déjà connu. Ne pas
      // dépendre d'un ancien compte ni d'un fichier temporaire du scénario P6.
      const issuer=await client.query(`
        SELECT t.id tenant_id,o.id organisation_id
        FROM tenants t JOIN organisations o ON o.tenant_id=t.id
        WHERE t.code=$1 AND o.id=70 AND o.type='CONSULAT'
      `,[TENANT]);
      assert.equal(issuer.rowCount,1,"Consulat synthétique #70 introuvable sur le tenant P6 autorisé.");
      const anchor=issuer.rows[0];
      manifest.issuerId=Number(anchor.organisation_id);
      // Aucun rôle, mot de passe ni compte P6 existant n'est modifié.
      assert.equal(manifest.issuerId,70,"Le Consulat synthétique attendu doit être l'organisation #70.");
      const required=await client.query(`
        SELECT code,id FROM permissions WHERE code=ANY($1::text[]) AND actif=TRUE
      `, [["MANAGE_ORGANISATION_RELATIONSHIPS","RELAY_ASSOCIATION_COMMUNICATION","TARGET_COMMUNICATION"]]);
      assert.deepEqual(new Set(required.rows.map(x=>x.code)),
        new Set(["MANAGE_ORGANISATION_RELATIONSHIPS","RELAY_ASSOCIATION_COMMUNICATION","TARGET_COMMUNICATION"]),
        "Permissions de recette incomplètes.");
      const syntheticViceRole=await client.query(`
        INSERT INTO organisation_roles(organisation_id,code,nom,description,scope,metadata)
        VALUES($1,$2,'Émetteur synthétique relais associatif',
          'Rôle de recette isolé, sans modification du Vice-Consul de P6.',
          'ORGANISATION',$3::jsonb) RETURNING id
      `,[manifest.issuerId,`ASSOCIATION_RELAY_ISSUER_${token}`,JSON.stringify({fixture:FIXTURE_KEY,token})]);
      manifest.viceRoleId=Number(syntheticViceRole.rows[0].id);
      const syntheticVice=await client.query(`
        INSERT INTO personnes(prenom,nom,profil)
        VALUES('Vice-Consul', $1, 'AGENT_CONSULAIRE_SYNTHETIQUE') RETURNING id
      `,[`Association Relay ${token}`]);
      manifest.vicePersonId=Number(syntheticVice.rows[0].id);
      await client.query(`
        INSERT INTO relations_personne_organisation(personne_id,organisation_id,type)
        VALUES($1,$2,'AGENT_CONSULAIRE_SYNTHETIQUE')
      `,[manifest.vicePersonId,manifest.issuerId]);
      await client.query(`
        INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif)
        VALUES($1,$2,$3,TRUE)
      `,[manifest.vicePersonId,manifest.issuerId,manifest.viceRoleId]);
      const scopedGrants=await client.query(`
        INSERT INTO role_permissions(role_id,permission_id,actif)
        SELECT $1,p.id,TRUE FROM permissions p
        WHERE p.code=ANY($2::text[]) AND p.actif=TRUE
        RETURNING id
      `,[manifest.viceRoleId,["MANAGE_ORGANISATION_RELATIONSHIPS","TARGET_COMMUNICATION"]]);
      assert.equal(scopedGrants.rowCount,2,"Les deux permissions Vice de recette sont requises.");
      manifest.vicePermissionRolePermissionId=Number(scopedGrants.rows[0].id);

      const org=await client.query("INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'ASSOCIATION',$2) RETURNING id",[
        `Association synthétique pilote SATEER ${token} — aucune organisation réelle`,anchor.tenant_id]);
      manifest.organisationId=Number(org.rows[0].id);
      const associationRole=await client.query(`INSERT INTO organisation_roles(organisation_id,code,nom,description,scope,metadata)
        VALUES($1,$2,'Responsable communication','Permission synthétique dédiée aux invitations et relais autorisés.','ORGANISATION',$3::jsonb) RETURNING id`,
      [manifest.organisationId,`ASSOCIATION_RELAY_MANAGER_${token}`,JSON.stringify({fixture:FIXTURE_KEY,token})]);
      manifest.associationRoleId=Number(associationRole.rows[0].id);
      for(const a of accounts.filter(x=>x.role!=="VICE")){
        const person=await client.query("INSERT INTO personnes(prenom,nom,profil) VALUES($1,$2,'MEMBRE_ASSOCIATION_SYNTHETIQUE') RETURNING id",
          [a.role==="RESPONSABLE_ASSOCIATIF"?"Responsable":"Membre",`Association ${token}`]);
        const personId=Number(person.rows[0].id);manifest.people.push({id:personId,role:a.role});
        await client.query("INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,'MEMBRE_ASSOCIATION_SYNTHETIQUE')",[personId,manifest.organisationId]);
        if(a.role==="RESPONSABLE_ASSOCIATIF") await client.query("INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,TRUE)",[personId,manifest.organisationId,manifest.associationRoleId]);
      }
      await client.query(`INSERT INTO role_permissions(role_id,permission_id,actif)
        SELECT $1,id,TRUE FROM permissions WHERE code=ANY($2::text[]) AND actif=TRUE`,[manifest.associationRoleId,["MANAGE_ORGANISATION_RELATIONSHIPS","RELAY_ASSOCIATION_COMMUNICATION"]]);
      // Les deux premières personnes sont responsable et membre associatif.
      // La troisième est l'émetteur synthétique du Consulat, créé plus haut.
      manifest.people.push({id:manifest.vicePersonId,role:"VICE"});
      assert.deepEqual(manifest.people.map(x=>x.role),accounts.map(x=>x.role));
      await client.query("COMMIT");
    } catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;} finally{client.release();}
    writeManifest(manifest);
    const {creerCompteAuthentificationDatabase}=require("../auth-database");
    for(let i=0;i<accounts.length;i++){
      const created=await creerCompteAuthentificationDatabase(manifest.people[i].id,accounts[i].login,accounts[i].password);
      assert.equal(created.succes,true,`Compte synthétique refusé: ${accounts[i].role}`);
      manifest.accounts.push({id:Number(created.compte.id),personId:manifest.people[i].id,role:accounts[i].role,login:accounts[i].login});writeManifest(manifest);
    }
    manifest.state="READY";writeManifest(manifest);
    process.stdout.write(JSON.stringify({status:"FIXTURE_READY",database:DATABASE,systemId:SYSTEM_ID,tenant:TENANT,issuerId:manifest.issuerId,
      associationId:manifest.organisationId,representativePersonId:manifest.people[0].id,memberPersonId:manifest.people[1].id,
      viceRoleId:manifest.viceRoleId,scopedVicePermission:"MANAGE_ORGANISATION_RELATIONSHIPS",associationPermissions:["MANAGE_ORGANISATION_RELATIONSHIPS","RELAY_ASSOCIATION_COMMUNICATION"],
      credentialsPath:CREDENTIALS,viceCredentialsPath:VICE_CREDENTIALS,cleanupManifest:MANIFEST},null,2)+"\n");
  } catch(error){if(fs.existsSync(MANIFEST)){manifest.state="SETUP_FAILED_REVIEW";writeManifest(manifest);}throw error;} finally{await db.end();}
}

async function login(credentials) {
  const r=await fetch(`${BASE}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifiant:credentials.login,motDePasse:credentials.password})});
  const body=await r.json().catch(()=>({}));assert.equal(r.status,200,`Connexion refusée (${r.status}): ${body.statut||""}`);
  const set=typeof r.headers.getSetCookie==="function"?r.headers.getSetCookie():[r.headers.get("set-cookie")||""];
  const cookie=set.map(x=>x.split(";")[0]).find(x=>x.startsWith("sateer_session="));assert(cookie,"Session absente");return cookie;
}
async function api(cookie,path,options={}) {
  const r=await fetch(`${BASE}${path}`,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{}),Cookie:cookie}});
  const body=await r.json().catch(()=>null);return {status:r.status,body};
}
function ok(result,status,label){assert.equal(result.status,status,`${label}: HTTP ${result.status}, attendu ${status}; ${JSON.stringify(result.body)}`);}
function loadManifest(){const m=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));assert.equal(m.state,"READY");return m;}

async function test() {
  const check = pool();
  try { await verifyInstance(check); } finally { await check.end(); }
  const m=loadManifest(),vice=readCredentials(VICE_CREDENTIALS,"VICE"),assoc=readCredentials(CREDENTIALS,"RESPONSABLE_ASSOCIATIF"),member=readCredentials(CREDENTIALS,"MEMBRE_ASSOCIATION");
  const cookies={vice:await login(vice),assoc:await login(assoc),member:await login(member)},q=`?tenant=${encodeURIComponent(TENANT)}`;
  const issuer=`/api/organisations/${m.issuerId}`,association=`/api/organisations/${m.organisationId}`;
  const common={tenantCode:TENANT};
  // Reprise idempotente de la phase d'invitation : si la tentative a déjà
  // enregistré l'invitation, sa création n'est PAS rejouée (HTTP 409 attendu).
  assert(m.invitationIds.length<=1,"État d'invitations inattendu : arrêt sans duplication.");
  assert.equal(m.relationId,null,"La relation est déjà enregistrée : arrêt pour inspection.");
  assert.equal(m.channelId,null,"Le canal est déjà enregistré : arrêt pour inspection.");
  assert.equal(m.publicationId,null,"La publication est déjà enregistrée : arrêt pour inspection.");
  let invitationId;
  if (m.invitationIds.length === 1) {
    invitationId=Number(m.invitationIds[0]);
    console.log(`REPRISE_INVITATION_EXISTANTE_OK: ${invitationId}`);
  } else {
    const invitation=await api(cookies.vice,`${issuer}/association-partners/invitations`,{method:"POST",body:JSON.stringify({...common,associationOrganizationId:m.organisationId})});
    ok(invitation,201,"Création de l'invitation de recette");
    invitationId=Number(invitation.body.invitation.id);
    m.invitationIds.push(invitationId);writeManifest(m);
  }
  assert(Number.isSafeInteger(invitationId)&&invitationId>0,"Identifiant d'invitation invalide.");
  const inviteList=await api(cookies.assoc,`${association}/communication-invitations${q}`);ok(inviteList,200,"Réception de l'invitation par l'association");
  const pending=inviteList.body.invitations.find(x=>Number(x.id)===invitationId);
  assert(pending&&pending.statut==="EN_ATTENTE","Invitation attendue absente ou déjà traitée : aucune seconde invitation.");
  const accepted=await api(cookies.assoc,`${association}/communication-invitations/${invitationId}/decision`,{method:"POST",body:JSON.stringify({...common,decision:"ACCEPTER"})});ok(accepted,200,"Acceptation et activation de la relation");
  const relations=await api(cookies.vice,`${issuer}/association-partners${q}`);ok(relations,200,"Relation visible au Consulat");
  const connected=relations.body.associations.find(x=>Number(x.id)===m.organisationId);assert(connected&&connected.relation_active,"Relation active absente");m.relationId=Number(connected.relation_id);writeManifest(m);

  const channel=await api(cookies.vice,`${issuer}/channels`,{method:"POST",body:JSON.stringify({...common,code:`ASSO_${m.token}`,nom:"Informations officielles pour l’association",description:"Canal synthétique de recette."})});
  ok(channel,201,"Création du canal synthétique");m.channelId=Number(channel.body.canal.id);writeManifest(m);
  for(const actor of ["assoc","member"]) ok(await api(cookies[actor],`${association}/association-channels/${m.channelId}/subscribe${q}`,{method:"POST"}),200,`Préférence de notification ${actor}`);

  const publish=await api(cookies.vice,`${issuer}/publications`,{method:"POST",body:JSON.stringify({...common,titre:`Information officielle synthétique ${m.token}`,
    contenu:`Contenu officiel synthétique ${m.token}. Ne concerne aucune personne ni organisation réelle.`,categorie:"INFORMATION",priorite:"NORMALE",
    audienceType:"ASSOCIATION",audienceValeur:String(m.organisationId),communicationChannelId:m.channelId})});
  ok(publish,201,"Publication ciblée vers l’association connectée");m.publicationId=Number(publish.body.publication.id);writeManifest(m);
  const otherTarget=await api(cookies.vice,`${issuer}/publications`,{method:"POST",body:JSON.stringify({...common,titre:`Cible interdite ${m.token}`,
    contenu:"Cette publication doit être refusée car le Consulat lui-même n’est pas une association destinataire.",categorie:"INFORMATION",priorite:"NORMALE",
    audienceType:"ASSOCIATION",audienceValeur:String(m.issuerId)})});ok(otherTarget,422,"Publication vers une organisation non ciblée refusée");
  const otherTenant=await api(cookies.vice,`${issuer}/association-partners/invitations`,{method:"POST",body:JSON.stringify({tenantCode:"TENANT_INEXISTANT",associationOrganizationId:m.organisationId})});
  assert([403,404].includes(otherTenant.status),`Contexte tenant étranger refusé (HTTP ${otherTenant.status})`);
  const notifsBefore=await (async()=>{const db=pool();try{await verifyInstance(db);const r=await db.query(`SELECT personne_id,count(*)::int n FROM notifications WHERE tenant_id=(SELECT id FROM tenants WHERE code=$1)
    AND organisation_id=$2 AND reference_type='PUBLICATION' AND reference_id=$3 AND type='PUBLICATION_CANAL' GROUP BY personne_id`,[TENANT,m.issuerId,m.publicationId]);return r.rows;}finally{await db.end();}})();
  assert.equal(notifsBefore.length,2,"Le canal a notifié seulement le responsable et le membre abonnés et autorisés.");

  const feed=await api(cookies.assoc,`${association}/association-communications${q}`);ok(feed,200,"Réception des communications autorisées");
  const official=feed.body.publications.find(x=>Number(x.id)===m.publicationId);assert(official,"La publication n’apparaît pas dans le fil associatif");
  assert.equal(Number(official.publie_par),m.vicePersonId,"Auteur institutionnel original conservé");
  assert.equal(official.relay_allowed,false,"Le relais n’est pas autorisé par défaut");
  const excluded=await api(cookies.assoc,`${association}/association-relays`,{method:"POST",body:JSON.stringify({...common,publicationId:m.publicationId})});ok(excluded,404,"Relais refusé avant autorisation explicite");

  const authorization=await api(cookies.vice,`${issuer}/publications/${m.publicationId}/association-relay-authorizations/${m.organisationId}${q}`,{method:"PUT",body:JSON.stringify({...common,enabled:true})});ok(authorization,200,"Autorisation explicite de relais par le Consulat");
  const notTarget=await api(cookies.vice,`${issuer}/publications/${m.publicationId}/association-relay-authorizations/${m.issuerId}${q}`,{method:"PUT",body:JSON.stringify({...common,enabled:true})});ok(notTarget,422,"Refus d’une cible qui n’est pas une association autorisée");
  const memberRelay=await api(cookies.member,`${association}/association-relays`,{method:"POST",body:JSON.stringify({...common,publicationId:m.publicationId})});ok(memberRelay,403,"Membre sans permission de relais refusé");
  const associateFeed=await api(cookies.assoc,`${association}/association-communications${q}`);ok(associateFeed,200,"Autorisation de relais visible à l’association");
  const allowed=associateFeed.body.publications.find(x=>Number(x.id)===m.publicationId);assert.equal(allowed.relay_allowed,true);
  const relay=await api(cookies.assoc,`${association}/association-relays`,{method:"POST",body:JSON.stringify({...common,publicationId:m.publicationId,associationComment:"Commentaire synthétique distinct du texte officiel."})});
  ok(relay,201,"Relais du responsable associatif habilité");m.relayId=Number(relay.body.relais.id);writeManifest(m);
  ok(await api(cookies.assoc,`${association}/association-relays`,{method:"POST",body:JSON.stringify({...common,publicationId:m.publicationId})}),409,"Relais en doublon refusé");
  const memberView=await api(cookies.member,`${association}/association-relays${q}`);ok(memberView,200,"Lecture du relais par le membre autorisé");
  assert.equal(memberView.body.relais.length,1,"Un seul relais visible au membre");
  const memberItem=memberView.body.relais[0];assert.equal(Number(memberItem.original_author_id),m.vicePersonId,"Auteur officiel conservé chez le membre");
  assert.equal(memberItem.contenu,publish.body.publication.contenu,"Contenu officiel non modifié");assert.equal(memberItem.association_comment,"Commentaire synthétique distinct du texte officiel.");
  const wrongTenant=await api(cookies.member,`${association}/association-relays?tenant=TENANT_INEXISTANT`);ok(wrongTenant,200,"Contexte tenant inexistant ne divulgue rien");assert.equal(wrongTenant.body.relais.length,0);
  const crossOrg=await api(cookies.vice,`${association}/association-communications${q}`);ok(crossOrg,403,"Accès au fil associatif refusé au Vice-Consul non membre");
  const afterRelay=await (async()=>{const db=pool();try{await verifyInstance(db);return await db.query(`SELECT count(*)::int n FROM notifications WHERE tenant_id=(SELECT id FROM tenants WHERE code=$1) AND organisation_id=$2
    AND reference_type='PUBLICATION' AND reference_id=$3 AND type='PUBLICATION_CANAL'`,[TENANT,m.issuerId,m.publicationId]);}finally{await db.end();}})();
  assert.equal(afterRelay.rows[0].n,2,"Le relais n’a créé aucune notification en doublon");

  const revoke=await api(cookies.vice,`${issuer}/association-partners/${m.relationId}${q}`,{method:"DELETE"});ok(revoke,200,"Révocation de la relation et des autorisations actives");
  const hidden=await api(cookies.member,`${association}/association-relays${q}`);ok(hidden,200,"Après révocation, le relais n’est plus exposé au membre");assert.equal(hidden.body.relais.length,0);
  const afterRevoke=await api(cookies.assoc,`${association}/association-relays`,{method:"POST",body:JSON.stringify({...common,publicationId:m.publicationId})});ok(afterRevoke,404,"Après révocation, tout relais ultérieur est refusé");

  // Restore the connected demo state for visual review, retaining the same
  // single relay and source publication. Authorization is explicitly renewed.
  const reinvite=await api(cookies.vice,`${issuer}/association-partners/invitations`,{method:"POST",body:JSON.stringify({...common,associationOrganizationId:m.organisationId})});ok(reinvite,201,"Restauration de la relation pour la recette visuelle");m.invitationIds.push(Number(reinvite.body.invitation.id));writeManifest(m);
  const reaccept=await api(cookies.assoc,`${association}/communication-invitations/${reinvite.body.invitation.id}/decision`,{method:"POST",body:JSON.stringify({...common,decision:"ACCEPTER"})});ok(reaccept,200,"Réacceptation pour l’état final de démonstration");
  const reauthorize=await api(cookies.vice,`${issuer}/publications/${m.publicationId}/association-relay-authorizations/${m.organisationId}${q}`,{method:"PUT",body:JSON.stringify({...common,enabled:true})});ok(reauthorize,200,"Réautorisation explicite conservant le relais existant");
  const finalMember=await api(cookies.member,`${association}/association-relays${q}`);ok(finalMember,200,"Relais rétabli pour recette visuelle");assert.equal(finalMember.body.relais.length,1);
  const db=pool();try{await verifyInstance(db);const refs=await db.query("SELECT id,publie_par,titre,statut FROM publications WHERE id=ANY($1::int[]) ORDER BY id",[[40,41]]);assert.deepEqual(refs.rows.map(x=>Number(x.id)),[40,41],"Publications #40/#41 conservées");}finally{await db.end();}
  writeManifest(m);
  process.stdout.write(JSON.stringify({status:"ASSOCIATION_RELAY_API_PASS",database:DATABASE,systemId:SYSTEM_ID,tenant:TENANT,issuerId:m.issuerId,associationId:m.organisationId,
    publicationId:m.publicationId,relayId:m.relayId,notifications:2,checks:["invitation/acceptation","ciblage","réception","cible non autorisée","droit de relais distinct","absence de doublon","auteur et contenu officiels conservés","révocation","isolation d’organisation/tenant","restauration de la recette visuelle"]},null,2)+"\n");
}

async function cleanup() {
  // Intentionally blocked until the full live PostgreSQL dependency graph
  // has been inspected and a separate scoped deletion script is approved.
  // The original cleanup deleted organisations before accounts/roles and
  // did not account for all dependent sessions, notifications and records.
  throw new Error("NETTOYAGE_BLOQUE: conserver la fixture pour la recette visuelle; aucun DELETE automatique autorisé.");
}

async function verify() {
  const m=loadManifest(),db=pool();try{await verifyInstance(db);const r=await db.query(`SELECT org.id,org.nom,org.type,rel.statut,rel.actif,pub.id publication_id,pub.publie_par,
      (SELECT count(*)::int FROM communication_publication_relays x WHERE x.publication_id=pub.id AND x.target_organisation_id=org.id) relay_count
    FROM organisations org JOIN tenants t ON t.id=org.tenant_id
    LEFT JOIN organisation_relationships rel ON rel.source_organisation_id=org.id AND rel.target_organisation_id=$2 AND rel.tenant_id=t.id AND rel.type='COMMUNITY_MEMBER'
    LEFT JOIN publications pub ON pub.id=$3 AND pub.organisation_id=$2
    WHERE org.id=$1 AND t.code=$4`,[m.organisationId,m.issuerId,m.publicationId,TENANT]);assert.equal(r.rowCount,1);process.stdout.write(JSON.stringify({status:m.state,database:DATABASE,systemId:SYSTEM_ID,record:r.rows[0],credentialsPath:CREDENTIALS,cleanupManifest:MANIFEST})+"\n");}finally{await db.end();}
}

const action=process.argv[2];
(async()=>{if(action==="setup")await setup();else if(action==="test")await test();else if(action==="verify")await verify();else if(action==="cleanup")await cleanup();else throw new Error("Usage: node scripts/association-relay-demo.js setup|test|verify|cleanup");})().catch(error=>{process.stderr.write(`ASSOCIATION_RELAY_DEMO_FAILED:${error.stack||error}\n`);process.exitCode=1;});

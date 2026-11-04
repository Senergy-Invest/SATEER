"use strict";

// Test API P3.1 isolé : toutes les données synthétiques sont insérées dans une
// transaction ouverte sur sateer_test, puis annulées dans finally.
process.env.PGDATABASE = "sateer_test";

const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const path = require("node:path");
const express = require("express");
const database = require("../database");
const executerRequeteOriginal = database.executerRequete;
const sendFileOriginal = express.response.sendFile;
const listenOriginal = express.application.listen;

const COLONNES_REQUISES = [
  ["tenants", "id"], ["tenants", "code"], ["tenants", "nom"], ["tenants", "type"], ["tenants", "actif"],
  ["organisations", "id"], ["organisations", "nom"], ["organisations", "type"], ["organisations", "tenant_id"],
  ["personnes", "id"], ["personnes", "prenom"], ["personnes", "nom"], ["personnes", "profil"],
  ["relations_personne_organisation", "personne_id"], ["relations_personne_organisation", "organisation_id"], ["relations_personne_organisation", "type"],
  ["organisation_relationships", "tenant_id"], ["organisation_relationships", "source_organisation_id"],
  ["organisation_relationships", "target_organisation_id"], ["organisation_relationships", "type"],
  ["organisation_relationships", "statut"], ["organisation_relationships", "actif"], ["organisation_relationships", "date_fin"],
  ["publications", "id"], ["publications", "tenant_id"], ["publications", "organisation_id"],
  ["publications", "publie_par"], ["publications", "titre"], ["publications", "contenu"],
  ["publications", "categorie"], ["publications", "priorite"], ["publications", "audience_type"],
  ["publications", "audience_valeur"], ["publications", "medias"], ["publications", "statut"],
  ["publications", "statut_diffusion_diaspora"],
  ["communication_publication_targets", "tenant_id"], ["communication_publication_targets", "publication_id"],
  ["communication_publication_targets", "organisation_id"], ["communication_publication_targets", "target_organisation_id"],
  ["auth_accounts", "personne_id"], ["auth_accounts", "identifiant"],
  ["auth_accounts", "mot_de_passe_hash"], ["auth_accounts", "actif"],
  ["auth_sessions", "compte_id"], ["auth_sessions", "empreinte_jeton"],
  ["auth_sessions", "date_expiration"], ["auth_sessions", "date_revocation"],
  ["auth_sessions", "date_derniere_utilisation"],
  ["countries", "id"], ["countries", "nom"], ["territories", "id"], ["territories", "nom"],
  ["communication_channels", "id"], ["communication_channels", "tenant_id"],
  ["communication_channels", "organisation_id"]
];

let client;
let serveur;
let transactionOuverte = false;
let fixture;
let requetesDansTransaction = 0;
let cheminMediaSynthétique;

async function fermerServeur() {
  if (!serveur) return;
  await new Promise((resolve, reject) => serveur.close(error => error ? reject(error) : resolve()));
  serveur = null;
}

async function main() {
  client = await database.obtenirClientDatabase();

  const cible = await client.query("SELECT current_database() AS nom");
  assert.equal(cible.rows[0]?.nom, "sateer_test",
    "Refus d'écrire : la connexion PostgreSQL n'est pas sateer_test.");
  console.log("OK - base PostgreSQL confirmée : sateer_test");

  const tables = [
    "tenants", "organisations", "personnes", "relations_personne_organisation",
    "organisation_relationships", "publications", "communication_publication_targets",
    "auth_accounts", "auth_sessions", "countries", "territories", "communication_channels"
  ];
  const existantes = await client.query(
    "SELECT name, to_regclass('public.' || name) IS NOT NULL AS present FROM unnest($1::text[]) AS name",
    [tables]
  );
  const tablesManquantes = existantes.rows.filter(row => !row.present).map(row => row.name);
  assert.deepEqual(tablesManquantes, [],
    "Refus d'écrire : le schéma P3.1 ou ses dépendances ne sont pas installés dans sateer_test.");

  const nomsColonnes = COLONNES_REQUISES.map(x => x[0]);
  const colonnes = COLONNES_REQUISES.map(x => x[1]);
  const presentes = await client.query(
    `WITH attendues(table_name,column_name) AS (
       SELECT * FROM unnest($1::text[],$2::text[])
     )
     SELECT a.table_name,a.column_name
     FROM attendues a LEFT JOIN information_schema.columns c
       ON c.table_schema='public' AND c.table_name=a.table_name AND c.column_name=a.column_name
     WHERE c.column_name IS NULL`,
    [nomsColonnes, colonnes]
  );
  assert.deepEqual(presentes.rows, [],
    "Refus d'écrire : des colonnes requises par le test API sont absentes de sateer_test.");

  await client.query("BEGIN");
  transactionOuverte = true;
  // Routeur, authentification et services capturent cet exécuteur commun :
  // toutes leurs requêtes utilisent le client qui porte la transaction.
  const processIdTransaction = client.processID;
  database.executerRequete = (sql, valeurs = []) => {
    assert.equal(transactionOuverte, true, "Toute requête applicative doit rester dans la transaction isolée.");
    assert.equal(client.processID, processIdTransaction, "Une requête applicative a changé de connexion PostgreSQL.");
    requetesDansTransaction += 1;
    return client.query(sql, valeurs);
  };

  const suffixe = `${process.pid}_${randomBytes(8).toString("hex")}`;
  const tenantCode = `P31TEST_${suffixe}`;
  fixture = {
    tenantCode,
    tenantIds: [],
    organisationIds: [],
    personneIds: [],
    publicationIds: [],
    identifiantsComptes: []
  };
  const tenantResult = await client.query(
    "INSERT INTO tenants(code,nom,type) VALUES($1,$2,$3) RETURNING id",
    [tenantCode, `Tenant synthétique P3.1 ${suffixe}`, "TEST_ISOLE"]
  );
  const tenantId = tenantResult.rows[0].id;
  fixture.tenantIds.push(Number(tenantId));

  async function creerOrganisation(libelle) {
    const result = await client.query(
      "INSERT INTO organisations(nom,type,tenant_id) VALUES($1,$2,$3) RETURNING id",
      [`Organisation synthétique ${libelle} ${suffixe}`, "TEST_ISOLE", tenantId]
    );
    const id = Number(result.rows[0].id);
    fixture.organisationIds.push(id);
    return id;
  }

  async function creerPersonne(libelle, organisationId) {
    const personne = await client.query(
      "INSERT INTO personnes(prenom,nom,profil) VALUES($1,$2,$3) RETURNING id",
      ["Compte", `Synthétique ${libelle} ${suffixe}`, "P3_1_TEST"]
    );
    const personneId = Number(personne.rows[0].id);
    fixture.personneIds.push(personneId);
    await client.query(
      "INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,$3)",
      [personneId, organisationId, "MEMBRE_TEST"]
    );
    return personneId;
  }

  const organisationEmettriceA = await creerOrganisation("émettrice A");
  const organisationEmettriceB = await creerOrganisation("émettrice B");
  const organisationCibleA = await creerOrganisation("cible A");
  const organisationCibleB = await creerOrganisation("cible B");
  const destinataire = await creerPersonne("destinataire", organisationCibleA);
  const nonCible = await creerPersonne("non-cible", organisationCibleB);

  await client.query(
    `INSERT INTO organisation_relationships
       (tenant_id,source_organisation_id,target_organisation_id,type,statut,actif)
     VALUES ($1,$2,$3,'TEST_P3_1','ACTIVE',TRUE),($1,$4,$5,'TEST_P3_1','ACTIVE',TRUE)`,
    [tenantId, organisationCibleA, organisationEmettriceA,
      organisationCibleB, organisationEmettriceB]
  );

  async function creerPublication(organisationId, titre) {
    const mediaId = randomUUID();
    const result = await client.query(
      `INSERT INTO publications
         (tenant_id,organisation_id,publie_par,titre,contenu,categorie,priorite,
          audience_type,audience_valeur,medias,statut,statut_diffusion_diaspora)
       VALUES ($1,$2,$3,$4,$5,'INFORMATION','NORMALE','ORGANISATIONS',NULL,$6::jsonb,'PUBLIEE','NON_DEMANDEE')
       RETURNING id`,
      [tenantId, organisationId, destinataire, titre, `Contenu synthétique ${suffixe}`,
        JSON.stringify([{ type: "IMAGE", format: "jpeg", id: mediaId, url: "synthetic-test-only" }])]
    );
    const id = Number(result.rows[0].id);
    fixture.publicationIds.push(id);
    return { id, mediaId };
  }

  const titreA = `Publication synthétique A ${suffixe}`;
  const titreB = `Publication synthétique B ${suffixe}`;
  const publicationA = await creerPublication(organisationEmettriceA, titreA);
  const publicationB = await creerPublication(organisationEmettriceB, titreB);
  await client.query(
    `INSERT INTO communication_publication_targets
       (tenant_id,publication_id,organisation_id,target_organisation_id)
     VALUES ($1,$2,$3,$4),($1,$5,$6,$7)`,
    [tenantId, publicationA.id, organisationEmettriceA, organisationCibleA,
      publicationB.id, organisationEmettriceB, organisationCibleB]
  );

  const { creerCompteAuthentificationDatabase, authentifierCompteDatabase } = require("../auth-database");
  async function creerSessionSynthétique(personneId, role) {
    const identifiant = `p31test.${role}.${suffixe}@sateer.test`;
    fixture.identifiantsComptes.push(identifiant);
    const motDePasse = `P3Test!${randomBytes(32).toString("base64url")}`;
    const compte = await creerCompteAuthentificationDatabase(personneId, identifiant, motDePasse);
    assert.equal(compte.succes, true, `Création du compte synthétique ${role}`);
    const connexion = await authentifierCompteDatabase(identifiant, motDePasse);
    assert.equal(connexion.succes, true, `Ouverture de session synthétique ${role}`);
    return connexion.jeton;
  }

  const jetonDestinataire = await creerSessionSynthétique(destinataire, "destinataire");
  const jetonNonCible = await creerSessionSynthétique(nonCible, "non-cible");

  // Démarre le serveur applicatif réel sur un port éphémère choisi par l'OS.
  // Le test n'écoute donc ni sur 3000 ni sur 3100.
  process.env.PORT = "0";
  express.application.listen = function () {
    serveur = listenOriginal.call(this, 0, "127.0.0.1");
    return serveur;
  };
  cheminMediaSynthétique = path.resolve(__dirname, "..", "storage", "publication-media", `${publicationA.mediaId}.jpeg`);
  express.response.sendFile = function (fichier) {
    if (path.resolve(fichier) !== cheminMediaSynthétique) return this.status(404).end();
    return this.status(200).type("image/jpeg").send(Buffer.from("SATEER_SYNTHETIC_MEDIA"));
  };
  const serverSource = require("node:fs").readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert(!/app\.(?:get|all)\(\s*["']\/api\/organisations\/:organisationId\/publications\/:publicationId["']/.test(serverSource),
    "Aucune route GET directe de publication par ID ne doit contourner le fil protégé.");
  const mediaRouteStart = serverSource.indexOf('app.get("/api/organisations/:organisationId/publications/:publicationId/media/:mediaId"');
  const mediaRouteEnd = mediaRouteStart < 0 ? -1 : serverSource.indexOf("\n);", mediaRouteStart);
  assert(mediaRouteStart >= 0 && mediaRouteEnd > mediaRouteStart,
    "La route API de média P3.1 doit être déclarée.");
  const mediaRouteSource = serverSource.slice(mediaRouteStart, mediaRouteEnd);
  assert(mediaRouteSource.includes("exigerSession")
    && mediaRouteSource.includes("listerPublicationsVisiblesPourPersonneDatabase")
    && mediaRouteSource.includes("if (!pub) return res.status(404).end()"),
  "La route API d'accès direct au média doit exiger une session et contrôler la visibilité de la publication.");
  require("../server");
  await new Promise((resolve, reject) => {
    serveur.once("listening", resolve);
    serveur.once("error", reject);
  });
  const adresse = serveur.address();
  const baseUrl = `http://127.0.0.1:${adresse.port}`;
  const cheminA = `/api/organisations/${organisationEmettriceA}/communication-feed?tenant=${tenantCode}`;
  const cheminB = `/api/organisations/${organisationEmettriceB}/communication-feed?tenant=${tenantCode}`;

  const lectureAutorisee = await fetch(baseUrl + cheminA, {
    headers: { cookie: `sateer_session=${jetonDestinataire}` }
  });
  assert.equal(lectureAutorisee.status, 200, "Le destinataire connecté peut appeler le fil API.");
  const filAutorise = await lectureAutorisee.json();
  assert(filAutorise.publications.some(p => Number(p.id) === publicationA.id),
    "Le destinataire autorisé lit la publication qui lui est adressée.");
  console.log("OK - destinataire autorisé : publication lisible via l’API");

  const lectureNonCible = await fetch(baseUrl + cheminA, {
    headers: { cookie: `sateer_session=${jetonNonCible}` }
  });
  assert.equal(lectureNonCible.status, 200, "Le compte authentifié peut consulter son fil API.");
  const filNonCible = await lectureNonCible.json();
  assert(!filNonCible.publications.some(p => Number(p.id) === publicationA.id),
    "Un compte authentifié non ciblé ne reçoit pas la publication.");
  console.log("OK - compte authentifié non ciblé : publication masquée côté API");

  const sansSession = await fetch(baseUrl + cheminA);
  assert.equal(sansSession.status, 401, "Le fil API refuse une requête sans session.");
  console.log("OK - absence de session : API refuse la requête (HTTP 401)");

  const cheminMediaA = `/api/organisations/${organisationEmettriceA}/publications/${publicationA.id}/media/${publicationA.mediaId}?tenant=${tenantCode}`;
  const mediaAutorisé = await fetch(baseUrl + cheminMediaA, {
    headers: { cookie: `sateer_session=${jetonDestinataire}` }
  });
  assert.equal(mediaAutorisé.status, 200,
    "Le destinataire autorisé lit un média synthétique par l'API directe de publication.");
  assert.equal(await mediaAutorisé.text(), "SATEER_SYNTHETIC_MEDIA",
    "La réponse média provient du stub synthétique, sans lecture du stockage.");
  console.log("OK - ressource API par ID : média synthétique visible au destinataire ciblé");

  const mediaNonCible = await fetch(baseUrl + cheminMediaA, {
    headers: { cookie: `sateer_session=${jetonNonCible}` }
  });
  assert.equal(mediaNonCible.status, 404,
    "Un compte authentifié non ciblé ne peut pas lire le média par ID.");
  console.log("OK - ressource API par ID : compte non ciblé refusé (HTTP 404)");

  const mediaSansSession = await fetch(baseUrl + cheminMediaA);
  assert.equal(mediaSansSession.status, 401,
    "La route média directe refuse une requête sans session.");
  console.log("OK - ressource API par ID : absence de session refusée (HTTP 401)");

  const autreOrganisation = await fetch(baseUrl + cheminB, {
    headers: { cookie: `sateer_session=${jetonDestinataire}` }
  });
  assert.equal(autreOrganisation.status, 200, "Le compte authentifié peut demander le fil de l’autre organisation.");
  const filAutreOrganisation = await autreOrganisation.json();
  assert(!filAutreOrganisation.publications.some(p => Number(p.id) === publicationA.id),
    "Une publication d’une organisation n’apparaît pas dans le fil d’une autre.");
  assert(!filAutreOrganisation.publications.some(p => Number(p.id) === publicationB.id),
    "Le compte d’une organisation ne reçoit pas la cible d’une autre organisation.");
  const mediaAutreOrganisation = await fetch(
    baseUrl + `/api/organisations/${organisationEmettriceB}/publications/${publicationB.id}/media/${publicationB.mediaId}?tenant=${tenantCode}`,
    { headers: { cookie: `sateer_session=${jetonDestinataire}` } }
  );
  assert.equal(mediaAutreOrganisation.status, 404,
    "L'accès direct par ID ne traverse pas l'isolation entre organisations.");
  console.log("OK - isolation organisationnelle : aucun contenu d’une autre cible");
  assert(requetesDansTransaction > 0, "Les requêtes HTTP/authentification sont passées par le client transactionnel.");
  console.log(`OK - ${requetesDansTransaction} requêtes applicatives sur le client de la transaction`);
}

async function verifierAbsenceResidus() {
  if (!fixture) return;
  const cible = await database.executerRequete("SELECT current_database() AS nom");
  assert.equal(cible.rows[0]?.nom, "sateer_test",
    "La vérification des résidus doit rester sur sateer_test.");
  const result = await database.executerRequete(
    `SELECT
       (SELECT count(*)::int FROM tenants WHERE id=ANY($1::int[]) OR code=$2) AS tenants,
       (SELECT count(*)::int FROM organisations WHERE id=ANY($3::int[])) AS organisations,
       (SELECT count(*)::int FROM personnes WHERE id=ANY($4::int[])) AS personnes,
       (SELECT count(*)::int FROM relations_personne_organisation WHERE personne_id=ANY($4::int[])) AS rattachements,
       (SELECT count(*)::int FROM organisation_relationships WHERE source_organisation_id=ANY($3::int[]) OR target_organisation_id=ANY($3::int[])) AS relations_organisations,
       (SELECT count(*)::int FROM publications WHERE id=ANY($5::int[])) AS publications,
       (SELECT count(*)::int FROM communication_publication_targets WHERE publication_id=ANY($5::int[])) AS cibles,
       (SELECT count(*)::int FROM auth_accounts WHERE identifiant=ANY($6::text[])) AS comptes,
       (SELECT count(*)::int FROM auth_sessions s JOIN auth_accounts a ON a.id=s.compte_id WHERE a.identifiant=ANY($6::text[])) AS sessions`,
    [fixture.tenantIds, fixture.tenantCode, fixture.organisationIds,
      fixture.personneIds, fixture.publicationIds, fixture.identifiantsComptes]
  );
  const residus = Object.entries(result.rows[0]).filter(([, count]) => Number(count) !== 0);
  assert.deepEqual(residus, [], "Des données synthétiques subsistent après le ROLLBACK.");
  console.log("OK - nouvelle connexion : aucun résidu synthétique après ROLLBACK");
}

async function nettoyer() {
  let erreurNettoyage;
  let rollbackConfirme = !transactionOuverte;
  try { await fermerServeur(); } catch (error) { erreurNettoyage = error; }
  express.application.listen = listenOriginal;
  express.response.sendFile = sendFileOriginal;
  if (client) {
    let detruireConnexion = false;
    if (transactionOuverte) {
      try {
        await client.query("ROLLBACK");
        transactionOuverte = false;
        rollbackConfirme = true;
        console.log("OK - ROLLBACK confirmé sur le client transactionnel");
      } catch (error) {
        erreurNettoyage ||= error;
        detruireConnexion = true;
      }
    }
    client.release(detruireConnexion ? new Error("Rollback non confirmé : destruction de la connexion pour forcer l'annulation PostgreSQL.") : undefined);
    client = null;
  }
  database.executerRequete = executerRequeteOriginal;
  if (fixture && rollbackConfirme) {
    try { await verifierAbsenceResidus(); } catch (error) { erreurNettoyage ||= error; }
  } else if (fixture && !rollbackConfirme) {
    erreurNettoyage ||= new Error("Nettoyage non confirmé ; vérification des résidus impossible.");
  }
  try { await database.fermerDatabase(); } catch (error) { erreurNettoyage ||= error; }
  if (erreurNettoyage) throw erreurNettoyage;
}

main()
  .catch(error => {
    process.exitCode = 1;
    const diagnostic = error?.message || error?.code || error?.name || String(error);
    console.error("ÉCHEC P3.1 API :", diagnostic);
  })
  .finally(async () => {
    try { await nettoyer(); }
    catch (error) {
      process.exitCode = 1;
      console.error("ÉCHEC nettoyage P3.1 :", error.message);
    }
  });

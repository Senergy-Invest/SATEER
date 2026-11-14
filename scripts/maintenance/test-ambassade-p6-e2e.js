"use strict";
/**
 * A7 : recette Ambassade dans la transaction P6 existante.
 * Invocable uniquement par le harnais P6 après création des comptes synthétiques.
 * Réutilise les routes SATEER sans nouvelle API ni droit institutionnel permanent.
 * Ne confond pas l'ancien canal MON_CONSULAT avec un nouveau canal Mon Ambassade.
 */
module.exports = async function recetteAmbassade(ctx) {
  const {assert, api, status, ok, client, fixture, TENANT, base, RUN}=ctx;
  if (process.env.PGDATABASE !== 'sateer_test' || process.env.SATEER_P6_AMBASSADE_TEST !== '1')
    throw new Error('A7_REQUIS_RECETTE_SYNTHETIQUE');
  const orgId=fixture.orgId;
  const org=await client.query('SELECT type, tenant_id FROM organisations WHERE id=$1', [orgId]);
  assert.equal(org.rows[0]?.type,'AMBASSADE','Type Ambassade réellement inséré');
  assert.equal(Number(org.rows[0]?.tenant_id),fixture.tenantId);
  ok(true,'A7 organisation fictive réellement de type AMBASSADE dans PostgreSQL');
  const summaryRoute=`/api/ambassade-operations/${orgId}/summary?tenant=${encodeURIComponent(TENANT)}`;
  let r=await api(base,summaryRoute,'GET',undefined,fixture.cookies.vice,false);
  status(r,200,'A7 supervision opérationnelle autorisée depuis une Ambassade');
  assert.equal(r.json?.statut,'OPERATIONS_AMBASSADE');
  assert.equal(Number(r.json.vue.organisationId),orgId);
  assert.equal(r.json.vue.tenantCode,TENANT);
  assert.ok(r.json.vue.demandes.total>=1,'La demande soumise au début de P6 apparaît');
  assert.ok(r.json.vue.demandes.enCours>=1,'Une simple réponse ne clôture pas le dossier : EN_COURS demeure');
  assert.ok(r.json.vue.unites.some(u=>Number(u.id)===fixture.passport));
  assert.ok(r.json.vue.unites.some(u=>Number(u.id)===fixture.civil));
  assert.equal(r.json.vue.orientationInterPostes,'NON_CONFIGUREE');
  assert.ok(!/prenom|courriel|description|mot_de_passe|messageCitoyen/i.test(JSON.stringify(r.json.vue)));
  ok(true,'A7 bilan et bureaux réels agrégés sans contenu de dossier');
  status(await api(base,summaryRoute,'GET',undefined,null,false),401,'A7 résumé interdit sans session');
  status(await api(base,summaryRoute,'GET',undefined,fixture.cookies.citizen,false),403,
    'A7 simple usager sans analytics : 403');
  status(await api(base,summaryRoute,'GET',undefined,fixture.cookies.pass,false),403,
    'A7 droit agent limité à une unité : 403');
  status(await api(base,summaryRoute,'GET',undefined,fixture.cookies.other,false),403,
    'A7 acteur rattaché à un autre poste : 403');
  status(await api(base,`/api/ambassade-operations/${fixture.org2}/summary?tenant=${TENANT}`,
    'GET',undefined,fixture.cookies.vice,false),403,'A7 autre organisation : 403');
  status(await api(base,`/api/ambassade-operations/${orgId}/summary?tenant=${TENANT}_X`,
    'GET',undefined,fixture.cookies.vice,false),403,'A7 autre tenant : 403');
  status(await api(base,summaryRoute,'POST',{},fixture.cookies.vice,false),404,
    'A7 l’API de supervision ne permet pas de mutation');

  const context=await api(base,`/api/context?tenant=${TENANT}`,'GET',undefined,fixture.cookies.vice,false);
  status(context,200,'A7 contexte de session vrai');
  assert.ok(context.json?.organisations?.some(o=>Number(o.id)===orgId&&o.type==='AMBASSADE'));
  ok(true,'A7 contexte de session rattaché à AMBASSADE, sans organisation imposée');
  const overview=await api(base,`/api/organisations/${orgId}/units/overview?tenant=${TENANT}`,
    'GET',undefined,fixture.cookies.vice,false);
  status(overview,200,'A7 bureaux servis par le Core Workspace');
  assert.ok(overview.json?.unites?.some(u=>Number(u.id)===fixture.passport&&u.canOpenWorkspace===true));
  ok(true,'A7 accès au Workspace dérivé des permissions réelles');
  const ws=await api(base,`/api/organisations/${orgId}/units/${fixture.passport}/workspace?tenant=${TENANT}`,
    'GET',undefined,fixture.cookies.pass,false);
  status(ws,200,'A7 agent Ambassade accède au Workspace métier de son bureau');
  status(await api(base,`/api/organisations/${orgId}/units/${fixture.passport}/workspace?tenant=${TENANT}`,
    'GET',undefined,fixture.cookies.citizen,false),403,'A7 citoyen ne peut ouvrir un Workspace');

  const publishedTitle=`A7_INFORMATION_AMBASSADE_${RUN}`;
  const post=`/api/organisations/${orgId}/publications`;
  status(await api(base,post,'POST',{
    tenantCode:TENANT,titre:publishedTitle,contenu:'Information entièrement fictive A7.',
    categorie:'INFORMATION',priorite:'NORMALE',audienceType:'TOUS'
  },fixture.cookies.citizen,false),403,'A7 citoyen non autorisé à publier');
  status(await api(base,post,'POST',{
    tenantCode:TENANT,titre:publishedTitle,contenu:'Information entièrement fictive A7.',
    categorie:'INFORMATION',priorite:'NORMALE',audienceType:'TOUS'
  },fixture.cookies.other,false),403,'A7 autre poste non autorisé à publier');
  r=await api(base,post,'POST',{
    tenantCode:TENANT,titre:publishedTitle,contenu:'Information entièrement fictive A7.',
    categorie:'INFORMATION',priorite:'NORMALE',audienceType:'TOUS'
  },fixture.cookies.vice,false);
  status(r,201,'A7 publication autorisée dans le moteur Communication');
  const pub=await client.query('SELECT id,organisation_id,tenant_id,statut,audience_type FROM publications WHERE titre=$1',[publishedTitle]);
  assert.equal(pub.rowCount,1);
  assert.equal(pub.rows[0].statut,'PUBLIEE');
  assert.equal(Number(pub.rows[0].organisation_id),orgId);
  assert.equal(Number(pub.rows[0].tenant_id),fixture.tenantId);
  assert.equal(pub.rows[0].audience_type,'TOUS');
  ok(true,'A7 publication canonique enregistrée dans la transaction synthétique');
  r=await api(base,`/api/institution-communications/${orgId}/publications?tenant=${TENANT}`,
    'GET',undefined,fixture.cookies.citizen,false);
  status(r,200,'A7 publication lisible par un membre Ambassade autorisé');
  assert.ok(r.json?.publications?.some(p=>p.titre===publishedTitle));
  ok(true,'A7 Communication commune réutilisée sans divulgation hors audience');
  status(await api(base,`/api/institution-communications/${orgId}/publications?tenant=${TENANT}`,
    'GET',undefined,fixture.cookies.other,false),403,'A7 autre poste ne lit pas le fil Ambassade');
  status(await api(base,`/api/institution-communications/${orgId}/publications?tenant=${TENANT}`,
    'GET',undefined,null,false),401,'A7 fil institutionnel interdit sans session');
  r=await api(base,summaryRoute,'GET',undefined,fixture.cookies.vice,false);
  status(r,200,'A7 bilan actualisé après publication');
  assert.equal(r.json.vue.publications.publiees,1);
  ok(true,'A7 l’indicateur A5 reflète la publication réellement créée');
  const page=await fetch(base+'/ambassade.html');
  assert.equal(page.status,200);const html=await page.text();
  assert.ok(html.includes('ambassade-parcours-ui.js')&&html.includes('ambassade-operations-ui.js'));
  ok(true,'A7 façade Ambassade sert les parcours A5 et A6');
  const editor=await fetch(base+'/publication-institutionnelle.html');
  assert.equal(editor.status,200);const editorHtml=await editor.text();
  assert.ok(editorHtml.includes('institution-publication-context.js'));
  ok(true,'A7 éditeur Communication réutilisé dans la page servie');
  console.log('A7_AMBASSADE_E2E_SESSION_WORKSPACE_PUBLICATION_PASS');
};

'use strict';
/* Contrats statiques — ne remplacent PAS les tests HTTP authentifiés ni les tests PostgreSQL. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const channels = source('communication-channels-router.js');
const associations = source('association-communication-router.js');
const notifications = source('communication-notifications.js');
const server = source('server.js');
const fixture = source('scripts/association-relay-demo.js');

test('les routes canaux et associations sont montees dans l API', () => {
  for (const module of ['communication-channels-router','association-communication-router']) {
    assert.match(server, new RegExp('app\\.use\\("/api/organisations",\\s*require\\("\\./'+module+'"\\)\\)'));
  }
});
test('abonnement canal : session, rattachement, organisation et tenant explicites', () => {
  assert.match(channels, /router\.get\("\/:organisationId\/channels",exigerSession,contexte,rattachement/);
  assert.match(channels, /router\.post\("\/:organisationId\/channels\/:channelId\/subscribe",exigerSession,contexte,rattachement/);
  assert.match(channels, /router\.delete\("\/:organisationId\/channels\/:channelId\/subscribe",exigerSession,contexte,rattachement/);
  assert.match(channels, /communication_channel_subscriptions[\s\S]*ON CONFLICT\(channel_id,personne_id\) DO UPDATE SET actif=true/);
  assert.match(channels, /c\.visibility='PUBLIC'/);
});
test('creation de canal reservee a TARGET_COMMUNICATION dans une organisation', () => {
  assert.match(channels, /router\.post\("\/:organisationId\/channels",\.\.\.exigerPermission\("TARGET_COMMUNICATION","ORGANISATION"\)/);
  assert.match(channels, /VISIBILITE_NON_IMPLEMENTEE/);
});
test('notifications atomiques : abonnes actifs, audience, anti-doublon', () => {
  assert.match(notifications, /pg_advisory_xact_lock/);
  assert.match(notifications, /pub\.statut='PUBLIEE'/);
  assert.match(notifications, /sub\.actif=TRUE/);
  for(const audience of ['TOUS','DEPARTEMENT','PROFIL','ASSOCIATION','ORGANISATIONS']) {
    assert(notifications.includes("pub.audience_type='"+audience+"'"), audience);
  }
  assert.match(notifications, /NOT EXISTS\s*\(\s*SELECT 1 FROM notifications existing/);
  assert.match(notifications, /existing\.reference_id=pub\.id/);
});
test('relais : droit distinct et autorisation explicite par publication', () => {
  assert.match(associations, /exigerPermission\("RELAY_ASSOCIATION_COMMUNICATION",\s*"ORGANISATION"\)/);
  assert.match(associations, /exigerPermission\("TARGET_COMMUNICATION",\s*"ORGANISATION"\)/);
  assert.match(associations, /communication_publication_relay_authorizations/);
  assert.match(associations, /auth\.revoked_at IS NULL/);
  assert.match(associations, /rel\.statut='ACTIVE'/);
});
test('la recette associative historique n est PAS auto nettoyable', () => {
  assert.match(fixture, /NETTOYAGE_BLOQUE/);
  assert.match(fixture, /async function setup\(\)/);
  assert.match(fixture, /async function test\(\)/);
});

# SATEER Diaspora D2-B/B — choix géographiques volontaires

## Objectif et frontières

Le citoyen choisit manuellement une ou plusieurs zones d'intérêt (ville, département ou région) et garde la faculté de se désabonner. L'organisation émettrice déclare au plus **une zone cible** avant la soumission de sa publication. Le Bureau SATEER voit cette zone lors de la revue, et la zone reste figée après la soumission.

**Il n'y a ni GPS, ni géolocalisation en arrière-plan, ni donnée de résidence déduite, ni diffusion commerciale payante.** L'abonnement géographique n'accorde aucun droit de lecture institutionnel et ne transmet aucune liste nominative aux associations.

## Sémantique des publications

La publication demeure `PUBLIEE`, avec `audience_type='TOUS'`, puis soumise au Bureau SATEER et validée suivant D2A. Un ciblage géographique D2BB ne change pas la visibilité du fil général D1. Il limite uniquement les **notifications D2BA** et le contenu de « Mes suivis ».

Une notification exige simultanément : (1) diffusion `DIFFUSEE`, (2) publication générale textuelle sans médias, (3) source et tenant autorisés, (4) thème ou association suivi volontairement, (5) si une cible existe, préférence active pour le même territoire exact, (6) quota maximum trois notifications Diaspora par personne sur 24 h et (7) absence de notification de cette publication à cette personne. La notification est insérée dans la même transaction que l'approbation, avec audit et rollback en cas d'échec.

MVP d'appariement : **égalité stricte d'identifiant de territoire** ; Bordeaux et Gironde sont deux territoires distincts. L'héritage ville/département/région et les préférences géographiques plus complexes nécessitent un futur contrat explicite. Aucune activation automatique par domicile.

## Schéma versionné

Migration `database/048_diaspora_geo_consent.sql` :
- `diaspora_geo_preferences(tenant_id,personne_id,territory_id,actif,...)`, unicité sur triplet ;
- `diaspora_publication_geo_targets(publication_id,tenant_id,organisation_id,territory_id,defini_par,...)`, portée publication/tenant/organisation contrôlée par FK composite ;
- référence au catalogue canonique `territories` sans données de seed ni compte ajouté ; aucune modification des canaux Communication existants.

La migration est appliquée **seulement sur `sateer_test`**, après contrôle du cluster PostgreSQL et autorisation explicite. Les scripts ne touchent pas aux migrations de Bordeaux ni à ses données.

## Contrats HTTP

Toutes les routes exigent `exigerSession`, le tenant validé et les conditions du Core.

- `GET /api/diaspora/geo-options?tenant=...&q=Bordeaux` — recherche catalogue, sans utilisateur nominatif exposé.
- `GET /api/diaspora/geo-preferences?tenant=...` — zones du **compte de la session**.
- `PUT /api/diaspora/geo-preferences/:territoryId?tenant=...` — `{ "actif": true|false }`, avec contrôle Origin.
- `PUT /api/organisations/:organisationId/diaspora/geo-target/:publicationId?tenant=...` — `{ "territoryId": integer|null }`, droit organisationnel `TARGET_COMMUNICATION` et verrou de publication ; après soumission : 409.
- `GET /api/organisations/:organisationId/diaspora/source-publications` et `review-queue` enrichis de `geoTerritoryId`, `geoTerritoryName` (valeurs `null` si aucun ciblage).

## Architecture et maintenance

Le Core garde la propriété des identités, organisations, permissions, territoires et audits. D2BB reste un module isolable en `diaspora-geo-service.js` + `diaspora-geo-http.js`. L'opt-in thématique D2BA et le moteur d'approbation D2A restent distincts. La migration est versionnée. **Il n'y a aucun accès SQL croisé non contractuel entre expériences** : les tables Dia sont propriétaires des préférences et des cibles, et les lectures transversales passent par les fonctions D2BA explicitement mises à jour.

Tests : 21 tests unitaires de contrat, PostgreSQL temporaire `ROLLBACK` et HTTP authentifié sur trois comptes fictifs. Vérifier les non-régressions D1, D2A, D2BA, les SHAs Bordeaux et Ambassade, le SHA distant du commit et l'état Git propre. Sauvegarder les secrets uniquement dans `~/.sateer-recette` avec permissions 0600, jamais dans les rapports.

## Limites et suite

Cette tranche ne gère ni proximité GPS, ni hiérarchie automatique des territoires, ni consentements publicitaires, ni intégration SMS/WhatsApp, ni gestion d'événements physiques. Aucun crédit de notification n'est reporté et aucun abonnement n'envoie des messages rétroactivement. La prévisualisation est une recette fictive, pas un service de production.

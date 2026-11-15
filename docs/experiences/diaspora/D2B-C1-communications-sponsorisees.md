# SATEER Diaspora D2-B/C1 — communications sponsorisées consenties

## Objectif

Ajouter une catégorie **sponsorisée** à une publication ordinaire déjà `PUBLIEE` et `TOUS`, **avant soumission**, et permettre au citoyen de consentir séparément aux notifications commerciales. Le Bureau SATEER conserve toutes les décisions. Le sponsor est **obligatoirement l'organisation source authentifiée** et le marquage est affiché de manière visible dans le fil général et la file du Bureau.

**Hors périmètre :** paiements, publicités achetées, contrats annonceurs, marques tierces, SMS, e-mails marketing, profilage automatisé, géolocalisation, campagnes politiques et campagnes de santé. Aucun crédit publicitaire ni revenu n'est simulé comme acquis.

## Distinction entre consulter et être notifié

- Les publications `DIFFUSEE`, `TOUS` restent consultables dans le fil général D1 ; la mention « Communication sponsorisée » est visible même sans consentement. **La consultation volontaire n'est pas un consentement à une prospection.**
- Le fil « Mes suivis » exclut les sponsorisées si l'accord commercial est absent ou retiré.
- La notification sponsorisée exige cumulativement : approbation D2-A, suivi D2-B/A (thème ou association), correspondance de zone D2-B/B s'il y a une cible, **opt-in commercial D2-B/C1 actif**, source autorisée, anti-doublon, quota Diaspora maximal trois/24 h **et quota sponsorisé maximal un/24 h**.
- Aucun envoi rétroactif après activation ; retrait immédiat des futures alertes.
- Tous les contrôles sont faits côté serveur et dans la même transaction PostgreSQL que la validation du Bureau. Si le fan-out échoue, l'approbation est annulée.

## Données et sécurité

Migration versionnée `database/049_diaspora_sponsor_consent.sql` :
- `diaspora_sponsor_optins` : tenant, personne, booléen non présumé, horodatages, version de consentement.
- `diaspora_sponsored_publications` : publication, tenant, organisation, **sponsor = émetteur** vérifié par contrainte `CHECK`, clé étrangère de portée publication/tenant/organisation. Pas de compte, droit, abonnement ou campagne initiale créé par migration.

Core propriétaire de session, permission et identité ; le module Sponsor ne connait que l'ID de session et ne publie jamais de liste nominative. Aucun accès public à la table des opt-ins. Le consentement se modifie exclusivement via `PUT /api/diaspora/sponsor-consent?tenant=...` `{ "actif": true|false }` avec session, appartenance tenant, origine et audit. Lecture via `GET /api/diaspora/sponsor-consent`.

Marquage source : `PUT /api/organisations/:organisationId/diaspora/sponsorisation/:publicationId?tenant=...` `{ "sponsorise": true|false }`, avec `TARGET_COMMUNICATION/ORGANISATION` et verrou transactionnel de la publication. Après soumission : refus `409`. La file D2-A projette clairement le sponsor et sa nature.

## Régression et exploitation

Ne jamais rouvrir les branches gelées Bordeaux et Ambassade. Aucun changement aux canaux institutionnels, aux moteurs de routage ni à Energy. Tests : D1/D2-A/D2-B/A/D2-B/B ; tests D2B-C1 ; SQL sur tables temporaires `ROLLBACK` ; recette HTTP des trois acteurs fictifs existants ; consentement OFF puis ON puis OFF, trois publications fictives ; audit, doublons, SHA distant ; revue visuelle dans le navigateur.

**Recette uniquement sur `sateer_test` avec autorisation explicite et instance PostgreSQL autorisée.** La conformité légale des futures campagnes commerciales réelles, la preuve juridique du consentement, la facturation et la politique de modération demandent une validation distincte avant mise en production.

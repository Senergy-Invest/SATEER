# SATEER Diaspora — D2B-A : abonnements volontaires et validation associative

## Périmètre livré

La tranche D2B-A ajoute une capacité **opt-in Diaspora** distincte des canaux
institutionnels `communication_channels` de Bordeaux/Ambassade. Elle ne crée
ni tenant, ni compte, ni rôle, ni habilitation implicite.

- Répertoire d'associations explicitement **VERIFIEE** / **SUSPENDUE** par le
  Bureau de Communication SATEER ; source et décision auditées.
- Suivi volontaire des **associations vérifiées** et de six thèmes contrôlés :
  EVENEMENT, FORMATION, EMPLOI, ENTREPRENEURIAT, CULTURE, COMMUNAUTE.
- Lecture « Mes informations suivies » ; les publications ont toujours le statut
  `PUBLIEE`, `statut_diffusion_diaspora = DIFFUSEE`, audience `TOUS`.
- Une **notification personnelle** quand un contenu suivi est approuvé,
  dans la même transaction PostgreSQL ; jamais à la soumission.
- Anti-doublon physique par index partiel sur `(tenant_id, personne_id,
  reference_id)`, en plus de `SELECT DISTINCT` et du refus de recréer une
  notification déjà envoyée via `PUBLICATION_CANAL`.
- Plafond strict de **3 notifications Diaspora par personne et par 24 heures** ;
  les contenus supplémentaires demeurent lisibles dans le fil.
- L'abonné peut se désabonner ; pas de notification rétroactive sur les
  publications approuvées pendant une période de désabonnement.

## Frontières métier

La vérification éditoriale SATEER d'une association n'est **pas** un agrément
administratif, consulaire ou associatif officiel. Une organisation ne reçoit pas
la liste nominative des abonnés ; le registre et le suivi sont des données
personnelles protégées par session, tenant et permissions du Core.

Les campagnes **commerciales/sponsorisées** et les médias sont hors périmètre.
D2B-A cible seulement les **notifications** des contenus publics `TOUS` : ce
n'est pas encore une diffusion de publication privée à des destinataires
nominativement sélectionnés. Pour cela, prévoir un contrat de consentement
et de ciblage distinct avec opt-in commercial explicite.

Les univers restent une **présentation différée** : aucun registre Univers ni
refonte Mon SATEER dans ce lot. Mon Consulat et Mon Ambassade restent inchangés.

## API

### Citoyen (session authentifiée + rattachement au tenant exact)

- `GET /api/diaspora/subscriptions?tenant=...`
- `PUT /api/diaspora/subscriptions/theme/:theme?tenant=...` `{ "actif": true|false }`
- `PUT /api/diaspora/subscriptions/association/:id?tenant=...` `{ "actif": true|false }`
- `GET /api/diaspora/followed-feed?tenant=...`

### Bureau SATEER (type d'organisation `SATEER` + droits **organisationnels**
`TARGET_COMMUNICATION` ET `MANAGE_PUBLICATIONS`)

- `GET /api/organisations/:organisationId/diaspora/association-directory?tenant=...`
- `POST /api/organisations/:organisationId/diaspora/association-directory/:associationId?tenant=...`
  `{ "statut": "VERIFIEE"|"SUSPENDUE" }`

La transition D2A `approve` conserve son contrat HTTP. Elle appelle désormais
`notifierAbonnesDiaspora` avec **le client de sa transaction**, puis écrit son
entrée `audit_trail` et confirme. Si le fan-out échoue, toute la transaction
est annulée. La soumission et le rejet ne notifient personne.

## SQL & migrations

`database/047_diaspora_optin.sql` : deux tables nouvelles, index et FK
composites, contraintes de cibles et de thèmes, index partiel anti-doublon.
Migration volontaire, non incluse dans le démarrage historique, à exécuter
**seulement dans `sateer_test`** après garde de l'identité du cluster et
confirmation explicite. Aucun seed, abonné ni approbation par défaut.

## Tests & recette

1. `node --test scripts/test-diaspora-d2b.js` — permissions, opt-in, XSRF,
   fan-out atomique et rollback.
2. `node --test scripts/test-diaspora-d1-feed.js scripts/test-diaspora-d2a.js scripts/test-diaspora-d2a-sql-typing.js`
   — D1 et D2A.
3. `node scripts/test-diaspora-d2b-pgtemp.js` sur `sateer_test` — vrai SQL
   PostgreSQL mais sur tables **TEMP**, avec rollback systématique.
4. `node scripts/test-diaspora-d2b-e2e.js <dossier prive>` — **uniquement après
   autorisation écrite sur Mac** : deux publications fictives D2B et réutilisation
   des comptes D2A déjà créés. Vérifie double opt-in = une seule notification,
   suppression des abonnements = zéro notification, lecture générale préservée,
   réabonnement sans effet rétroactif, et audit.

## Reprise & maintenance

- Code Express CommonJS sans dépendances externes nouvelles.
- Contrats API et SQL nommés ; aucune requête SQL transverse non scopée.
- Le worktree indépendant `work/diaspora-d1-*` est préservé ; aucun force-push.
- Le script livre après tests et recette E2E réussis seulement, puis contrôle
  explicitement `git ls-remote` du commit GitHub.
- Réexécution prudente : le manifeste D2B privé reprend les publications
  fictives déjà identifiées plutôt que d'en multiplier les copies.

## Limitations à lever après D2B-A

Inscription à des événements, segmentation géographique consentie,
opt-in séparé pour messages commerciaux, étiquetage sponsorisé, fréquence
configurable par type, gestion du cycle de vie et vérification documentaire
des associations. Le plafond de 3 notifications/24h s'applique globalement à
l'opt-in Diaspora pour ce pilote et pourra devenir une politique configurable.

## R2 — Typage PostgreSQL du registre associatif (recette du 15/11/2026)

La recette HTTP authentifiée a mis en évidence `SQLSTATE 42P08`, provenant de
la réutilisation du paramètre `$3` en colonne `VARCHAR(16)` et dans une
comparaison `$3::text`. La requête `verifierAssociation` utilise désormais
`$3::varchar(16)` dans les deux emplacements et des types explicites pour
les identifiants.

Le test unitaire détecte la régression de typage, complété avant la recette
par un test réel PostgreSQL **uniquement sur tables temporaires et session
isolée**. La migration 047 déjà appliquée est vérifiée en lecture seule ;
elle n'est pas réappliquée pendant R2. L'exécuteur refuse toute modification
non reconnue du worktree et n'autorise le push qu'après la recette complète.

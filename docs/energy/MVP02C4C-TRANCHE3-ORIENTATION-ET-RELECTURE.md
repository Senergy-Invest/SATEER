# SATEER Energy — MVP02/C4C, tranche 3 : orientation et diagnostic de relecture

## État de référence et principe de livraison

Base **déjà publiée** : branche `work/energy-mvp01`, SHA GitHub `0d4b56bbf58f0f13953d500e2f502c1b1c9669f4` (C4C2 clôturé). Cette tranche 3 n'est qu'un **candidat** tant que son script Mac, ses tests, son verdict visuel et le SHA distant de son éventuel commit ne sont pas vérifiés. Ne pas confondre réussite de tests simulés ici et exécution sur le Mac.

## Pourquoi C4C3 ?

C4C2 affichait une liste des contributions C2 à examiner. Il manquait deux précisions concrètes :

1. Un propriétaire de site pouvait voir une proposition `EN_REVUE` dont le `reviewer_grant_id` ne désigne plus aucune affectation C1 `ACTIF` habilitée à revoir. C4C3 **signale la situation**, sans prétendre que l'auteur est en retard ni attribuer automatiquement la proposition à un autre agent.
2. Un contributeur pouvait retrouver une proposition dans C4C2 mais devait ensuite rechercher manuellement le parcours C2. C4C3 propose un **lien vers la section du parcours C2 existant** (`#fileRevue` ou `#mesPropositions`) uniquement quand `pourMoi` est vrai. Le lien n'est **pas** un lien profond à l'identifiant d'une proposition : C2 exige encore que la personne choisisse une responsabilité autorisée, et que le serveur la vérifie. Une vue sans relecteur actif offre un renvoi vers C1, mais ne garantit pas que l'acteur peut émettre une invitation. Aucun bouton C4C3 ne crée une mission, une affectation ou une décision.

L'ancienneté affichée est clarifiée : date **et heure locales** de modification et `Moins de 24 h` lorsque le nombre de tranches complètes de 24 heures est nul. Aucun SLA, alerte de retard, garantie ni KPI de consommation.

## Contrat HTTP additif inchangé en version

`GET /api/energy/pilotage/v1/sites/:siteId/actions?tenant=...&grantId=...&statut=TOUTES|EN_REVUE|A_CORRIGER&suivi=TOUS|SANS_RELECTEUR_ACTIF&offset=...`

- `suivi` est **optionnel**, défaut `TOUS` pour assurer la compatibilité C4C2 ; valeur inconnue : `400 SUIVI_INVALIDE`.
- `SANS_RELECTEUR_ACTIF` est **réservé au propriétaire du site sans grantId** : un collaborateur, même responsable et actif, reçoit `404 PERIMETRE_NON_AUTORISE`. L'absence de session, d'appartenance tenant et de grant actif reste refusée par le garde C4C1/C4C2.
- Filtre serveur **avant** `LIMIT 51/OFFSET` pour préserver la pagination ; périmètre `WITH RECURSIVE scope` construit **après autorisation C1**. Un relecteur est qualifié d'actif uniquement si une ligne `energy_scope_grants` existe avec `id = p.reviewer_grant_id`, même site + tenant + propriétaire, `statut='ACTIF'`, `role_scope <> 'OCCUPANT'`.
- Nouvel attribut par ligne `suiviRelecture`: `RELECTEUR_ACTIF`, `SANS_RELECTEUR_ACTIF` pour une proposition `EN_REVUE`, ou `NON_APPLICABLE` pour `A_CORRIGER`. **Aucun identifiant/nombre de personne** ni id de grant du relecteur dans le JSON.
- `pourMoi` est conservé, sans permission induite : auteur de la proposition `A_CORRIGER` ou relecteur C1 actif pour `EN_REVUE` ; l'API C2 reste seule décisionnaire des mutations.
- Les anciennes URL C4C2 sans `suivi` continuent de fonctionner. Les routes sont **GET seulement**, `Cache-Control: private, no-store`.

## Frontières logicielles

```
Session Core (préexistante, inchangée)
  → API /api/energy/pilotage/v1 (GET, tenant, site, grants C1)
  → energy-dashboard-store.js (SQL paramétré, site/tenant/propriétaire/périmètre C1)
  → energy-dashboard-actions-domain.js (statuts, ancienneté, projection)
  → public/energie-actions.{html,js,css} (filtre propriétaire et liens vers C1/C2)
                                         ↓ navigation simple, aucune écriture
                  /energie-responsabilites.html (C1 préexistant)
                  /energie-collecte.html (C2 préexistant)
```

Aucune migration, aucune table ajoutée, aucun second modèle d'inventaire, aucune écriture métier et aucun nouveau rôle. Le code de `public/energie-collecte.*` et `public/energie-responsabilites.*` est **inchangé**. Le champ `reviewer_grant_id` est canonique de C2 ; C4C3 ne réassigne ni ne répare les propositions orphelines. C1/C2 font foi pour les décisions et invitations.

## Tests et recette utilisateur

- **Node** : C4C1+C4C2+C4C3, `79/79` attendus (56 historiques + 23 C4C3) ; validation des filtres, sécurité, SQL sans mutation et chaîne d'isolation.
- **17 régressions** historiques, dont `npm test`, Energy/Core/P1/Ambassade/Diaspora, sans changer `SATEER_PUBLIC_ORIGIN` au-delà de l'instance de recette.
- **PostgreSQL** : base `sateer_test`, cluster épinglé `7699611241381229531`, transaction `BEGIN READ ONLY`, zéro DDL/DML ; exécution des anciens C4C1, C4C2 puis test C4C3.
- **HTTP A/B** : serveur local `127.0.0.1:3486`, sessions fictives A/B, ancien tableau C4C1, ancienne file C4C2, nouveau filtre et refus inter-tenant.
- **Recette visuelle** : propriétaire A, filtre « en revue sans relecteur actif » ; vérifier cohérence sans nombre fictif, retour « tous les suivis », entrée C1/C2, date+heure et `moins de 24 h`, mobile, fenêtre privée et connexion Core. Sur un compte collaborateur, le filtre propriétaire doit être masqué. Tester que les accès C2 sont toujours soumis à C1/C2.
- **Git** : état propre pour les suivis, autoriser seulement les fichiers C4C3, conserver `docs/energy/REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` hors du commit ; autorisation humaine séparée après la recette. Commit/push normal, SHA GitHub **égal** au local, rapport ZIP ouvert avec `open -R`.

## Limites connues

- « Relecteur actif » signifie **un grant C1 existant et valide**, pas une personne disponible, formée ou engagée à terminer un travail.
- Le propriétaire peut détecter les propositions sans relecteur C1 valide ; il n'a pas le pouvoir de les réattribuer depuis C4C3. Les liens C1/C2 ne présélectionnent pas de dossier : il faut continuer dans les parcours existants, selon ses droits.
- `joursDepuisModification` reste une différence de **périodes de 24 heures** calculée sur le serveur au chargement. La vue ajoute l'heure locale pour la comprendre ; elle n'invente pas un calendrier de travaux.
- Pagination des unités/sites limitée (50 par page), pas de recherche globale ni de quotas de production validés. Pas d'envoi d'e-mail ni d'alerte de notification ; ces capacités nécessitent leurs contrats transversaux.
- Tests SQL prévus pour PostgreSQL `sateer_test` et données de recette ; aucune hypothèse de déploiement ou de certification en production.

## Reprise VS Code / Codex

Lire d'abord C4C1, C4C2 puis cette note. Ouvrir les trois `energy/energy-dashboard-*`, `public/energie-actions.*`, `scripts/test-energy-mvp02c4c{,2,3}.js` et tests maintenance. Avant tout changement, vérifier SHA GitHub de la branche. Ne modifier ni C1 ni C2 pour contourner les permissions. Réserver E-ARCH, E-METER et les agents IA aux chantiers **après clôture globale C4C**. Si des usages réels nécessitent de *réassigner* des relecteurs, cadrer explicitement la mutation dans **C2** et ses droits, avec audit, tests et accord métier : C4C n'est pas propriétaire de cet état.

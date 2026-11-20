# SATEER Energy — MVP02-C4C / tranche 1 : tableaux de bord participatifs

**Base obligatoire :** branche `work/energy-mvp01`, SHA `8985d2cc6e6d0ec7cb6de946ab9f2a4438e88622` (C4B clôturé). Le présent lot n'est **pas** réputé déployé ou validé tant que le rapport Mac, la recette visuelle et le SHA GitHub distant ne sont pas vérifiés.

## Intention métier

Un responsable doit connaître, pour un site ou son périmètre autorisé :
- espaces (C1), affectations C1 actives et quantités de propositions C2 en revue / à corriger / intégrées ;
- équipements du registre 051 *avec emplacement C2 déclaré* ; équipements encore non localisés au niveau site intégral du propriétaire ;
- appareillages et compteurs C4A déclarés, relations actives déclarées vers les espaces ; positions physiques d'esquisse C4B enregistrées ;
- unités du périmètre (50 par page), et nombre de tâches de qualification C2 encore à examiner.

Aucune donnée ne vient d'une mesure ou d'un capteur dans C4C. Un nombre d'appareils ou de relations **ne doit pas être interprété** comme une consommation, un câblage prouvé ou un pourcentage de qualité. Pas de KPI énergétique inventé. Les missions, échéances, campagnes et relevés sont les lots ultérieurs E-PARTICIPATION/E-METER. Les besoins de supervision plus détaillés pourront être ajoutés sans changer l'identité des entités.

## Frontières d'architecture, compréhensibles par une équipe humaine

```
Core authentification (req.auth), tenant, organisations membres
    ↓
energy-dashboard-http.js           garde d'accès, GET uniquement, paramètres validés
    ↓
energy-dashboard-store.js          lecture SQL paramétrée, autorisation avant agrégation
    ↓
051 inventaire + 055 C1 + 056 C2 + 059 C4A + 060 C4B
    ↓
energy-dashboard-domain.js         normalisation et libellés de comptes, aucun calcul kWh
    ↓
energie-pilotage.html/js/css       vue accessible, sans écriture métier
```

Aucune table C4C ajoutée dans cette tranche. Pas de second inventaire, pas de duplication de Core ni de SQL partagé entre modules. Le seul changement de `server.js` est l'enregistrement conditionnel du routeur C4C après les modules existants, sans changer leurs routes.

## Contrats HTTP (version 1)

- `GET /api/energy/pilotage/v1/sites?tenant=...&offset=...` : retourne au plus 50 vues (propriétaire ou périmètre attribué), `suivant` explicite. Un même site peut apparaître plusieurs fois pour un acteur ayant plusieurs affectations distinctes. La liste non paginée dans l'interface est limitée à la première page : elle signale cette limite.
- `GET /api/energy/pilotage/v1/sites/:siteId/synthese?tenant=...&offset=...&grantId=...` : le `grantId` est **obligatoire pour les non-propriétaires**, doit désigner un grant C1 `ACTIF` de la personne authentifiée, sur le site et le tenant demandés. Sans `grantId`, le propriétaire lit sa racine C1 ; un site non initialisé retourne des indicateurs `null` plutôt que des zéros trompeurs.
- `404 PERIMETRE_NON_AUTORISE` : site absent, différent, affectation absente/révoquée ou non autorisée, sans oracle d'existence.
- `Cache-Control: private, no-store`, `nosniff`, `no-referrer`. Toutes les routes sont GET, session Core requise, activées exclusivement en `sateer_test` avec flag `SATEER_ENABLE_ENERGY_MVP02C4C=1`.

### Interprétation des compteurs

- Les totaux sont calculés dans le **sous-arbre C1** autorisé. Les compteurs sur la ligne d'une unité concernent **cette unité seulement**, sans double comptage des descendants.
- `equipementsLocalises` compte la présence de lignes de localisation dans C2 (sans inventer une localisation depuis l'esquisse). `equipementsSansLocalisation` n'est calculé que pour le propriétaire intégral (`total 051 - localisations C2`). Aucun pourcentage de complétude n'est calculé sans dénominateur et objectif définis.
- Les relations C4A sont exclusivement `DECLARE_A_VERIFIER`, la représentation C4B ne valide aucun raccordement.
- Un compteur sans `scope_node_id` peut exister au niveau global : il **n'est pas affecté arbitrairement à un bâtiment**. C4C n'en déduit aucune mesure.

## Sécurité et non-régression

- Ne pas lire les noms, emails, documents, photos, QR, jetons, données patient ou fichiers hospitaliers : seuls les totaux d'affectations sont exposés.
- Ne pas modifier les sources 051,055,056,059,060, ni inventer de droits de mission SATEER institutionnelle. Les grants C1 restent la seule source de délimitation.
- Refus par défaut si la session, le tenant, le site ou le grant ne sont pas valides.
- Révision des performances à prévoir pour des sites >1000 unités : la requête page utilise une profondeur récursive C1 et plusieurs agrégations corrélées. Le moteur reste indexé sur `site_id`; prévoir EXPLAIN ANALYZE, cache de projections ou agrégats incrémentaux si nécessaire, sans masquer les vues partielles.

## Contrôles avant clôture

1. Vérifier Git local et distant au SHA C4B `8985d2c...`; refuser divergence, fichiers suivis modifiés ou index non vide.
2. Installation ciblée des nouveaux modules et ajout conditionnel dans `server.js` ; aucun patch de schéma, aucun écrasement de C4B.
3. `node --check` + `node --test scripts/test-energy-mvp02c4c.js` ; 17 campagnes existantes et `npm test`.
4. Test PostgreSQL **BEGIN READ ONLY** sur `sateer_test`, cluster épinglé `7699611241381229531` : pas d'INSERT, UPDATE ni DELETE.
5. E2E HTTP GET A/B, sessions fictives ; propriétaire A lit son bilan, B ne lit pas le site A. Login fictif seul, aucune écriture métier.
6. Recette navigateur `http://localhost:3484/energie-pilotage.html?tenant=ENERGY_MVP01D_RECETTE` : contrôles indicateurs, périmètres, affichage mobile, erreurs ; si inconforme, **pas de commit/push**.
7. Après accord explicite, `git add` des seuls nouveaux fichiers C4C et `server.js`, commit ciblé, push normal, SHA distant == SHA local vérifié ; rapport ZIP et Finder. Aucun reset/clean/stash/pull/rebase/force-push.

## Reprise Codex

Ouvrir dans VS Code `energy/energy-dashboard-{domain,store,http}.js`, `public/energie-pilotage.{html,js,css}`, `scripts/test-energy-mvp02c4c.js`, les deux scripts de recette et cette note. Les points d'entrée C1/C2/C4A/C4B demeurent les seuls maîtres des données. Ne pas lancer E-METER ni l'agent IA avant C4C achevé et E-ARCH prévu ensuite. Le référentiel REV2 non suivi reste hors du commit C4C tant que son lot documentaire n'est pas autorisé.

## Session Core et retour après connexion (correctif C4C)

L'écran charge `/auth-client.js` avant `energie-pilotage.js` (scripts `defer`). Il attend `window.SATEER_CONTEXT_READY`, contrat déjà employé par l'éditeur C4B, au lieu de réimplémenter le chargement `/api/context`. En l'absence de session, le client Core renvoie vers `/login.html?returnTo=...` en conservant l'URL locale et le tenant. Une connexion ne donne aucun droit supplémentaire : les API C4C revérifient le Core, l'appartenance au tenant et les grants C1 actifs.

Recette manuelle supplémentaire : ouvrir C4C depuis une fenêtre privée, constater la redirection vers la connexion, puis confirmer que le compte fictif propriétaire A retrouve le site après authentification. Ne jamais inclure le mot de passe de recette dans les journaux.

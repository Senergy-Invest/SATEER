# A6 — Accès groupé aux moteurs Workflow et Communication de l'Ambassade

Date : 13 novembre 2026. Base : branche `work/ambassade-mvp`, SHA `624ae70ae806375dbe56562b1b0e63bbb85e91e1`.

## Finalité

Raccorder la page « Mon Ambassade » aux capacités existantes, **sans réécrire les moteurs** :

1. `GET /api/organisations/:organisationId/units/overview?tenant=CODE` : la liste des seules unités visibles par les permissions du Core. Le front n'affiche un lien de Workspace que lorsque `canOpenWorkspace === true` et que l'unité appartient à l'organisation sélectionnée.
2. `/unit-workspace.html?organisation=...&unit=...&tenant=...` : le Workspace générique existant, propriétaire des API de réception, orientation interne, prise en charge et réponse. L'ouverture de lien n'est **pas une permission**, chaque opération passe les gardes backend de capacité et de rôle.
3. `GET /api/organisations/:organisationId/publications?tenant=CODE` : son succès authentifié confirme la permission `TARGET_COMMUNICATION` sur la même organisation. Sinon aucun lien de gestion n'est affiché.
4. `/publication-institutionnelle.html?organisation=...&tenant=...&from=AMBASSADE` : éditeur Communication existant. Le petit adaptateur `institution-publication-context.js` ajuste seulement le libellé et le lien de retour, si `SATEER_CONTEXT_READY` démontre un rattachement Ambassade au tenant. Bordeaux conserve son comportement si le paramètre `from` est absent.

## Garanties

- Aucune migration, aucune nouvelle API, aucune copie de données métier, aucune écriture exécutée par la façade A6.
- Rôles, permissions, capacité de réception, destination de routage et autorisation de répondre sont décidés **uniquement par les APIs génériques existantes**, jamais par la présence des liens.
- Les URL contiennent l'organisation, le tenant et l'unité, sans mot de passe ni information personnelle. Les réponses API sont insérées par `textContent`, pas HTML brut.
- La sélection d'un autre tenant ou d'une unité hors organisation ne confère aucun accès. En cas d'échec des API, la section concernée reste fermée.
- La connexion à une boîte e-mail réelle, les transferts entre postes, les habilitations officielles, le tableau de bord mondial alimenté et les règles de compétences demeurent **hors périmètre**.
- L'éditeur de publication historique contient encore des libellés orientés Consulat dans certains champs. La contextualisation A6 change le bandeau pour l'Ambassade, sans changer les règles du moteur ni les audiences.

## Tests et recette

`node scripts/test-ambassade-parcours.js` : chargement API, 401/403, absence de liens en erreur, filtrage d'unités, URL sûres, XSS, adaptation des libellés Ambassade et conservation Bordeaux.

Le lanceur réalise aussi tests A1–A5, A3d (session et droits PostgreSQL en rollback), Communication P3.1 (rollback et résidus), audit A5 et `npm test`. L'implémentation A6 ne prouve pas qu'un rôle Ambassade réel possède déjà l'ensemble des capacités configurées : elles devront être établies avec la mission.

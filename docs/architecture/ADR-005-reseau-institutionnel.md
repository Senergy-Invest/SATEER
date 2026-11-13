# ADR-005 — Réseau institutionnel : relations typées, jamais des droits

Statut : **A2.5, contrat de lecture et prototype pur, non raccordé aux API ni aux bases** (13 novembre 2026).

## Invariants

- Un ministère, une ambassade, un consulat, une association et un partenaire restent des **organisations indépendantes**. Les unités internes appartiennent à leur organisation ; pas de duplication des comptes ni de leurs dossiers.
- Le Core contient déjà `organisation_relationships`. Ne pas inventer une table « ambassade → consulat » parallèle. Avant ajout de nouveaux types, auditer les contraintes SQL existantes et migrer explicitement si nécessaire.
- Le réseau est représenté par un **graphe orienté** de relations datées et révocables. La relation `SUPERVISION` ou `ADMINISTRATIVE_TUTELLE` peut décrire un lien de structure, mais n'accorde **aucun** accès implicite aux courriers, dossiers, pièces, identités, publications internes, clés de chiffrement ou tableaux de bord.
- Une compétence territoriale ou une accréditation à plusieurs pays n'est pas une filiation. Les pays et juridictions doivent faire l'objet d'un contrat distinct à définir.
- Les agrégats ministériels viendront d'un contrat de reporting versionné et autorisé, pas de requêtes SQL transversales sur les dossiers des postes. Un poste non équipé de SATEER est « non déployé », pas « zéro activité ».

## Réutilisation concrète

`institution-relationship-graph.js` lit un ensemble de noeuds et arêtes **déjà filtrés et autorisés par l'appelant**. Il s'appuie sur la forme existante des lignes `organisation_relationships` (`tenant_id`, `source_organisation_id`, `target_organisation_id`, `type`, `statut`, `actif`, `date_debut`, `date_fin`). Les nouveaux types sont un **contrat proposé**, pas des valeurs déjà acceptées en PostgreSQL.

Convention de direction pour les nouveaux types de structure : **source = parent institutionnel**, **cible = enfant**. Cette convention n'altère ni la direction des `COMMUNITY_MEMBER` existants ni les relations de coopération.

Les seules relations prises pour produire le graphe hiérarchique sont `SUPERVISION` et `ADMINISTRATIVE_TUTELLE`. Un cycle est refusé. Les liens `COORDINATION`, `COOPERATION`, `COMMUNITY_MEMBER`, `COMMUNICATION_AUTHORIZATION` ne deviennent pas des liens parents/enfants.

`estRelationDeCommunicationCandidate` reconnaît seulement un type explicitement destiné à la communication et actif à la date concernée. **Cette fonction ne délivre pas d'autorisation** ; elle ne remplace ni le moteur Communication, ni l'autorisation d'un émetteur, ni le ciblage d'audience, ni le consentement/droit de lecture.

## Risques de compatibilité à traiter avant A3

L'implémentation actuelle `communication-targets.js` sélectionne, dans un chemin de création vers plusieurs cibles, des relations `ACTIVE` sans filtrage systématique sur `type`. Créer des relations `ADMINISTRATIVE_TUTELLE` avant d'avoir durci les requêtes peut donc produire des destinataires supplémentaires non voulus.

**Interdiction de créer ou d'activer les relations de tutelle en SQL tant que les chemins Communication concernés n'ont pas été corrigés et testés négativement.** Ne pas contourner ce risque via des permissions artificielles.

## Plan contrôlé

1. **A2.5 (ce lot)** : ajouter l'ADR, le graphe pur typé, les tests de non-héritage, sans SQL, HTTP ni mutation métier.
2. **A3a** : inspecter les contraintes de `organisation_relationships` et la cartographie des routes Communication, définir les migrations éventuelles et la validation institutionnelle des relations, avec tests synthétiques et gardes de sécurité.
3. **A3b** : sécuriser le moteur Communication existant contre les relations ne portant pas la finalité de diffusion ; tests API et PostgreSQL sur `sateer_test` avec rollback et zéro résidu ; seulement ensuite activer des liens institutionnels synthétiques.
4. **A3c** : gestion des demandes Ambassade et orientation vers le poste compétent, en préservant les contrôles d'accès aux ressources.
5. **A4** : agrégats et vue mondiale du Ministère, sans exposition des dossiers individuels.

## Vérifications

`node scripts/test-institution-relationship-graph.js` ; `node --check institution-relationship-graph.js` ; `npm test`. Aucune de ces commandes n'écrit dans PostgreSQL.

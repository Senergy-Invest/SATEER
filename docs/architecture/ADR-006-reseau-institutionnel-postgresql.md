# ADR-006 — Réseau institutionnel : persistance dans le Core existant (A3b)

Date : 2026-11-13. Statut : **implémentation backend isolée, non montée en HTTP ; écritures interdites tant que l'habilitation ministérielle n'est pas validée**.

## Constat confirmé dans le dépôt

- La migration historique `database/016_organisation_network.sql` définit déjà `organisation_relationships` avec `tenant_id`, source, cible, type `VARCHAR(100)`, statut, actif, période et métadonnées. **Pas de nouvelle table.**
- Les FKs historiques sur source/cible sont sur `organisations(id)`, pas sur `(id, tenant_id)`. L'adaptateur filtre donc les deux extrémités par tenant et l'audit détecte les anomalies. Une future contrainte composite nécessite un contrôle des données historiques et une migration versionnée séparée.
- La clé `UNIQUE(tenant_id, source_organisation_id, target_organisation_id, type)` interdit plusieurs lignes portant le même lien. Toute révocation conserve l'enregistrement ; la réactivation doit faire l'objet d'un workflow et d'une politique d'historisation dédiée, pas d'un UPSERT silencieux.
- La table `audit_trail` existante est utilisée pour journaliser les mutations transactionnelles. Les événements **ne prouvent pas** à eux seuls une immutabilité réglementaire du journal ; les garanties d'exploitation restent à préciser.

## Modèle et contrat

- `institution-relationship-graph.js` (A2.5) demeure le propriétaire de la validation des liens de structure : aucun cycle, aucun mélange de tenants, aucun héritage de droits.
- `institution-network-database.js` consomme `organisation_relationships` via SQL paramétré, construit un sous-réseau à partir d'une racine et ne retourne que la racine, ses descendants et les arêtes internes visibles.
- Pour ce premier périmètre sénégalais, seules les mutations `MINISTERE --SUPERVISION--> AMBASSADE` et `AMBASSADE --ADMINISTRATIVE_TUTELLE--> CONSULAT` sont admises. Les types de coopération ne sont pas des arêtes hiérarchiques.
- Autorisation explicite `VIEW_INSTITUTION_NETWORK` avant toute lecture ; `MANAGE_INSTITUTION_NETWORK` exigée sur **les deux organisations** avant mutation. Ces codes sont des contrats **non attribués** : l'adaptateur seul ne crée ni permission ni route publique.
- Mutations facultatives sous **transaction SERIALIZABLE**, verrou transactionnel par tenant et audit. Un lien déjà créé/révoqué n'est pas réactivé par `UPSERT`. Une référence de validation est exigée pour toute création ; une simple chaîne n'est pas une preuve d'accord ministériel.
- **Aucun partage de dossier, publication, e-mail, identité ou permission n'est dérivé des relations structurelles.**

## Inter-tenant et ministère mondial

Le registre relationnel actuel fonctionne dans un tenant. Il **ne doit pas** être utilisé pour traverser directement les bases/tenants. Le tableau de bord mondial recevra plus tard des agrégats versionnés, fournis par chaque poste habilité, et un annuaire institutionnel central validé. Un poste non intégré doit être signalé `NON_DEPLOYE`, pas `0`.

## Non livré / interdictions

- **Pas de migration, pas d'insertion de tutelle en base et pas de route HTTP activée dans A3b.**
- Aucune nomination d'administrateur, aucun octroi de privilège, aucune importation de données officielles.
- Pas de connexion aux e-mails réels, pas de modification de Bordeaux.
- La détection de cycles s'applique aux liens présents au moment de la transaction ; les permissions et validations institutionnelles réelles devront être testées en HTTP avant de brancher un routeur.
- L'audit SQL A3b est uniquement en lecture et refuse toute instance autre que `sateer_test` avec l'identifiant de cluster de la recette validée.

## Étapes de recette

1. Vérifier les contrats JS : `node scripts/test-institution-network-database.js`.
2. Auditer la vraie instance : `PGDATABASE=sateer_test node scripts/a3b-audit-schema-readonly.js`. L'audit indique les **comptages uniquement**, sans noms ni identifiants.
3. Étudier les incohérences éventuelles avant migration composite.
4. Après validation institutionnelle des habilitations, construire et tester l'API de gestion en `sateer_test` avec transaction/rollback, refus inter-tenant, refus inter-postes et conflits concurrentiels.
5. Seulement après ces preuves, permettre la configuration synthétique d'une hiérarchie et la supervision en lecture autorisée.

# ADR-003 — API institutionnelle d'activation des expériences

Statut : P3.3.3A, **montage optionnel et inactif par défaut**, 2026-11-07.

## Portée

- `GET /api/organisation-experiences/:organisationId?tenant=SN` : catalogue des activations, sous `VIEW_ORGANISATION_EXPERIENCES` (organisation uniquement).
- `PUT /api/organisation-experiences/:organisationId/:codeExperience?tenant=SN` : corps exact `{"statut":"ACTIVE"}` ou `{"statut":"INACTIVE"}`, sous `MANAGE_ORGANISATION_EXPERIENCES`.
- Identité dérivée exclusivement de la session `sateer_session`, vérifiée par `exigerSession`.
- Tenants résolus via la base, puis contrôle RBAC avec `obtenirPermissionsEffectivesDatabase` par l'adaptateur commun `verifierPermissionPersonneDatabase`.
- Pour PUT, l'en-tête `Origin` doit correspondre exactement à `SATEER_PUBLIC_ORIGIN` ; refus en son absence.
- Aucun héritage d'autorisation d'un bureau ou d'une autre organisation. Aucun rôle n'obtient automatiquement les permissions nouvelles.

## Garde du déploiement

Le montage n'est possible que si **les deux conditions sont vraies** : `PGDATABASE=sateer_test` et `SATEER_ENABLE_ORG_EXP_API=1` au démarrage du serveur. Sans elles, aucune nouvelle route n'est enregistrée. L'installateur ne définit pas ces variables, n'exécute aucun SQL et ne redémarre aucun processus.

Le catalogue `permissions` **ne contient pas encore nécessairement** les codes `VIEW_ORGANISATION_EXPERIENCES` et `MANAGE_ORGANISATION_EXPERIENCES`. Sans affectation explicite dans les rôles à portée organisationnelle, les opérations sont refusées (`403`). Une migration séparée du catalogue et un protocole de délégation seront traités lors d'une prochaine étape.

## Limites essentielles

**Le moteur d'activation n'est pas encore branché comme contrôle bloquant sur les autres routes métier de Bordeaux.** Cela évite de désactiver par inadvertance les parcours existants. Il faudra auditer, déclarer et tester ces dépendances avant de faire d'une activation un prérequis d'accès métier.

L'autorisation applicative a été testée localement. Le test HTTP bout-en-bout du routeur avec une vraie session, ainsi que les scénarios inter-tenants sur l'API montée, restent à exécuter avant toute exposition réelle.

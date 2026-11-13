# A4b — Accès sécurisé à la supervision ministérielle

- Le routeur de recette est monté derrière session et double garde, **désactivé par défaut**.
- `VIEW_MINISTRY_WORLDWIDE` n'est attribué à personne par A4b ; la tutelle n'en crée aucun droit.
- En l'absence de fournisseurs officiels, l'API ne retourne aucun annuaire ni indicateur ; elle répond `SOURCES_NON_CONFIGUREES` après les contrôles d'identité et de permission.
- Les références `(tenantCode, organisationId)` restent composites. Aucun SQL ne traverse les tenants. Le moteur A4a calcule les agrégats des seuls rapports autorisés et validés.
- A4c pourra développer l'interface à partir de cette API après validation des sources. Il ne doit pas utiliser des fixtures comme données officielles.
- Aucun changement à Bordeaux, aucune nouvelle table, aucune migration, aucun rôle ou utilisateur réel.

Base Git attendue : `work/ambassade-mvp`, commit `e8fb4a0c62d981965a93c9eca1f0c1d50482a975`.

# ADR-002 — Activation institutionnelle des expériences SATEER

Statut : **proposé, non raccordé à l'API**, 2026-11-07.

## Problème

`experience_activations` contient `tenant_id + personne_id + experience_id`. Il s'agit d'activations **personnelles** et non d'un droit d'activation pour une organisation.
`organisation_capabilities` active des capacités transversales, et non des expériences complètes.
Ces trois concepts ne doivent pas être fusionnés.

## Décision

- Ajouter un registre `organisation_experience_activations` par `tenant_id + organisation_id + experience_id`.
- Un registre vide signifie **INACTIVE** : activation expresse requise, jamais héritée du seul type d'organisation.
- Conserver intacts `experience_activations` et `organisation_capabilities`.
- Vérifier la concordance tenant/organisation par FK composite `(organisation_id, tenant_id)` et à chaque accès en SQL.
- N'accepter une mutation qu'après autorisation explicite, dans le contexte d'une session authentifiée et d'une organisation autorisée.
- La disponibilité technique d'une expérience, son activation institutionnelle, la souscription personnelle et l'autorisation de chaque opération sont quatre questions distinctes.
- L'activation ne donne **aucun droit transversal** de lecture de dossiers ou documents. Chaque API métier continue de vérifier les habilitations.
- L'identité et les données personnelles restent canoniques et non dupliquées.

## Plan de livraison

1. **P3.3.1** (ce paquet) : migration préparée + contrat JS testable + ADR, sans exécution SQL ni route HTTP.
2. P3.3.2 : étude des migrations et test transactionnel contrôlé sur `sateer_test`, ajout de règles de permissions et de l'API de configuration (authentification + autorisation organisationnelle).
3. P3.3.3 : branchement par expérience **après** migration explicite des activations Bordeaux et tests de non-régression. Ne jamais appliquer directement une politique `default deny` aux routes historiques sans préparation.
4. P3.3.4 : activation organisation A / refus organisation B, réversibilité, absence de fuite de données, tests des 6 parcours Bordeaux.

## Limites

La migration préparée comporte un index unique sur `organisations(id, tenant_id)` et une FK composite. Son application nécessite un créneau SQL contrôlé et une inspection des contraintes, volumes et rôles existants. Aucune migration de ce paquet n'est exécutée automatiquement.

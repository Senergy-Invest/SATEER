# P3.3.5BF — Journal agent en lecture seule

## Périmètre
- Une route `GET /api/pilot-procedures/dossiers/:id/journal-agent`, authentifiée, filtrée par organisation, tenant et unité réelle du dossier.
- L'écran agent montre les messages visibles par le citoyen et l'historique des actions existantes, avec `textContent` et une limite de 100 lignes pour chaque collection.
- Aucun accès aux pièces privées ni écriture métier.

## Hors périmètre
La réponse agent, la disponibilité et la remise de documents, les changements de statuts et toutes les notifications sont traités dans un lot **distinct**, avec tests d'intégrité SQL, rôles et transitions métier.

## Validation
`node scripts/maintenance/test-bordeaux-journal-agent.js` vérifie les contrats de lecture et d'isolation. Une recette HTTP authentifiée **Agent A02** et les refus multi-organisations restent nécessaires. Les tests statiques ne démontrent pas les permissions effectives.

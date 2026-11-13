# Ambassade A2.5 — Contrat de hiérarchie et collaboration

Base : branche `work/ambassade-mvp` A2, commit `908708486620d845bad25c99f4214283a844e5bc`.

## Parcours fictif prévu

Ministère du Sénégal → Ambassade France → Consulats Bordeaux, Paris ; Ministère → Ambassade Italie → Consulat Milan. L'Ambassade France peut aussi avoir une relation de coopération avec une association ou une relation de coordination avec un poste voisin. Ces deux dernières relations ne sont pas de la tutelle.

Ce lot introduit un **module de graphe pur en lecture mémoire** et ses tests : graphe multi-postes, exclusion inter-tenant, statut/date/révocation, détection des cycles, déduplication, et distinction relation structurelle / candidature à une communication. Les noeuds renvoyés ne contiennent que `id`, `nom`, `type` ; **aucun attribut ou permission de personne**.

## Ce qui N'EST PAS livré

- Aucun nouveau type SQL activé, aucune migration, aucun enregistrement de relation, aucun accès HTTP et aucun rôle assigné.
- Aucun tableau de bord ministériel réellement déployé ; pas de remontée de données personnelles.
- Aucune importation de l'organigramme officiel depuis un site web ni hypothèse de tutelle juridiquement validée.
- Aucune publication ou notification envoyée ; le moteur Communication existant reste propriétaire des flux et des habilitations.

## Garde bloquante pour A3

La relation administrative n'est pas une permission et ne peut être utilisée comme relation de diffusion. Durcir `communication-targets.js` et les autres chemins d'audience **avant de créer des liens synthétiques `ADMINISTRATIVE_TUTELLE`**.

Voir `docs/architecture/ADR-005-reseau-institutionnel.md`.

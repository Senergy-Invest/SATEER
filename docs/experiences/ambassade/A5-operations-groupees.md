# A5 — Vue opérationnelle Ambassade, intégration groupée

Base : branche `work/ambassade-mvp`, commit `faf240c77b6c50c706c2b96fa6dd840e689233f2`.

Le lot A5 ne duplique ni le Core, ni Communication, ni Workflow, ni Reporting.
Il ajoute **un adaptateur de projection de lecture** limité à l'organisation Ambassade courante, et une interface intégrée dans « Mon Ambassade ».

## Ce qui est livré

- `GET /api/ambassade-operations/:organisationId/summary?tenant=SN`, désactivé par défaut, disponible seulement sur `sateer_test` avec `SATEER_ENABLE_AMBASSADE_OPERATIONS=1`.
- Contrôles obligatoires : session `exigerSession`, tenant réel, organisation de type `AMBASSADE`, permission existante `VIEW_ORGANISATION_ANALYTICS` au niveau `ORGANISATION` (jamais héritée d'une tutelle).
- Synthèse des demandes (`total`, `nouvelles`, `enCours`, `traitees`, `sansDestination`, `urgentesOuvertes`), nombre de publications publiées, liste des seuls bureaux actifs. Pas de personnes, courriers, dossiers individuels, médias ni pièces.
- Affichage avec `textContent`, et messages distincts absence de droit, route inactive ou service indisponible.
- Tests de route, projection, UI et audit PostgreSQL `READ ONLY`, plus toutes les recettes précédentes A3d/P3.1.

## Limites assumées

- Pas de permission ou compte créé, pas de rôle attribué, pas d'activation de l'expérience institutionnelle, pas de lien administratif ou de tenant extérieur modifié.
- Les chiffres ne couvrent que l'activité stockée sur **l'organisation Ambassade de l'utilisateur**, pas celle des consulats subordonnés. La tutelle ne donne jamais droit de consulter leurs demandes.
- Aucune orientation inter-postes, aucune délivrance d'e-mails, aucun moteur d'IA ou transfert automatique. Le nombre de demandes sans bureau est un indicateur de besoin, pas une règle de routage.
- Pour l'autorisation de transfert des demandes Ambassade → Consulat, recueillir les compétences et conventions réelles avant toute mutation ; toute écriture doit être auditée et testée transactionnellement.
- La supervision ministérielle mondiale reste une expérience distincte sous sources explicitement validées.

## Recette

L'installateur Mac vérifie la branche et le SHA GitHub, copie seulement les fichiers ciblés, applique trois insertions vérifiées, lance les tests et l'audit sur le cluster de recette connu, vérifie le diff Git, crée un seul commit, pousse sans forcer et vérifie le SHA distant. En cas d'échec pré-commit, restauration uniquement des fichiers du paquet après contrôle de leur contenu.

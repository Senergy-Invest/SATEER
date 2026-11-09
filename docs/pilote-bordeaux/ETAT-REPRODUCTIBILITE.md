# État reproductibilité — schéma et habilitations du pilote Bordeaux

## Constat

- P3.3.5Q a ajouté sur **`sateer_test` uniquement** les colonnes `validation_explicite BOOLEAN NOT NULL DEFAULT FALSE`, `date_validation TIMESTAMPTZ`, `date_publication TIMESTAMPTZ` sur `organisation_procedure_catalogue`.
- P3.3.5T a ajouté la permission `MANAGE_PROCEDURES` et une **attribution de recette nominative** pour éditer les brouillons.
- P3.3.5V a attribué `MANAGE_PUBLICATIONS` à la personne de recette `322`, organisation `70`, avec rapport de retrait conservé hors dépôt.
- Ces opérations ont été faites par des scripts temporaires sur le Mac ; il manquait une migration versionnée correspondante dans l'archive P3.3.5X.

## Ce que ce lot crée

- `database/042_procedure_catalogue_validation_explicite.sql` — schéma additif, défaut non-validé pour toute fiche historique ; aucune fiche revalidée implicitement.
- `database/043_permission_manage_procedures.sql` — existence du **code de permission uniquement** ; aucun rôle ni relation créé.

**Ces deux fichiers SQL sont des propositions de migrations à relire avec la politique réelle de migrations du dépôt. Ils ne sont PAS exécutés par P3.3.5Y.** Vérifier schéma réel, permissions et ordre de versionnement. Une éventuelle application devra être explicitement autorisée et testée sur une base vide puis sur `sateer_test`.

## Non-portabilité à respecter

Les identifiants de personnes, de rôles et d'organisations de recette ne doivent jamais être semés automatiquement sur d'autres tenants. Conserver hors Git les rapports locaux d'attribution/retrait. Ne jamais confondre « permission présente dans le référentiel » et « permission accordée à un compte ».

## Après consolidation

Tester l'installation sur un environnement isolé de zéro : création des objets, migration idempotente, refus de publication sans `MANAGE_PUBLICATIONS`, distinction de l'édition `MANAGE_PROCEDURES`, refus intertenant, conservation des anciennes fiches non publiées. Renseigner dans `POINT-DE-REPRISE.md` les tests réellement exécutés et les commits, sans marquer cette étape finie par anticipation.

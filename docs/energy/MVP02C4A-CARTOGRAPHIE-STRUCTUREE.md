# SUNU Courant — MVP02-C4A : trois cartes structurées, zéro raccordement inféré

**État à la livraison du paquet : CANDIDAT, NON ENCORE VALIDÉ SUR MAC.** 19 novembre 2026. Branche `work/energy-mvp01`, base GitHub C3B `6571ca18aa2dee410aa03af804a766f5c0547095`. Contrat REV3 et audit du 19/11/2026 prévalent. Toute validation C4A nécessite le rapport de tests sur `sateer_test` et le SHA distant vérifié après le push.

## Objectif et parcours utilisateurs

**Découverte autonome** : un ménage, une PME ou une entreprise peut enregistrer simplement ses équipements (MVP01/MVP02/C2), sans plan, plaque, photo, mesure, tableau ni contrat. Il peut demander une prise de contact, sans présumer une mission acceptée. **Accompagnement professionnel après contrat** : gestionnaire énergie SATEER, à distance ou sur site selon le contrat et les besoins, peut dessiner les espaces et réseaux, faire contribuer les collaborateurs et préparer une vérification. L'activation par *contrat signé et mission habilitée* n'est **pas encore disponible** : C4A ne doit donc être exposé **qu'en RECETTE sur `sateer_test` au propriétaire Core**. Aucune permission professionnelle réelle créée ou présumée. Le dispositif contractuel, consentements et équipes habilitées sera un lot distinct.

La saisie de **photo appareil + photo plaque** et l'extraction locale OCR existantes (052/053) restent privées, hors routes C4A. Pour les prestations contractuelles ultérieures : prise de photo avec consentement, extraction assistée, signalement des incertitudes, vérification technique humaine. Distinguer valeur OCR proposée, valeur lue et contrôlée, et valeur réellement mesurée ; une plaque ne prouve ni consommation ni efficacité.

## Trois cartes sans duplication

| Carte | Source canonique | Exemple |
|---|---|---|
| **Physique / organisation** | `energy_scope_nodes` C1 (055), liens `parent_id`; localisation fine C2 `energy_scope_equipment_locations` (056) | Hôpital → urgences, laboratoire, maternité, étages, bureaux. Un service peut être une unité organisationnelle, pas nécessairement un bâtiment. |
| **Électrique** | C4A `energy_topology_assets` et `energy_topology_links` (059), graphes dirigés | Source S1 → compteur M1 → TGBT → tableau secondaire T2 ; M2 **MESURE** Bâtiment A et Bâtiment B ; T2 **DESSERT** A et B. |
| **Fonctionnelle** | `energy_inventory_equipements` (051) avec `energy_topology_usages` (059) | Compresseur 145 → FROID ; même machine peut servir un deuxième usage, pas de ligne d'équipement dupliquée. |

Un tableau est un **élément d'infrastructure électrique** ; un compresseur est une **machine du registre d'équipement canonique** ; un bâtiment est un **espace C1**. Ce sont des entités distinctes. Les compteurs mesurent des périmètres pouvant couvrir plusieurs bâtiments ; plusieurs tableaux peuvent desservir un bâtiment. **Les relations ne sont pas déduites de la hiérarchie spatiale**. Les parcours électriques sont déclaratifs ; le modèle n'affirme pas qu'un compteur fait office de dispositif d'alimentation ni ne déduit de kWh.

## Contrats techniques, types et garde-fous

- Migration **059 additive**, **exclusivement** `sateer_test`, après vérification de l'identité `pg_control_system()` : `7699611241381229531`. Quatre tables et fonctions/triggers, aucune altération des migrations 050–058 ou des tenants Core.
- `energy_topology_assets` : `SOURCE`, `COMPTEUR`, `TABLEAU`, `CIRCUIT`, `DEPART` ; emplacement C1 facultatif, repère facultatif ; acteur et site propriétaire ; `fiabilite=DECLARE_A_VERIFIER` non modifiable.
- `energy_topology_links` : `ALIMENTE` vers élément électrique ou équipement 051, `MESURE` d'un compteur vers élément électrique, machine ou bâtiment, `DESSERT` d'un tableau/source/circuit/départ vers espace C1. Trois types de cibles possibles, **une et une seule cible par ligne**. Liens actifs uniques ; correction par retrait historisé, jamais suppression physique. Anti-cycle SQL sur `ALIMENTE` et verrouillage transactionnel du site.
- `energy_topology_usages` : liste de fonctions déclarées, un même équipement peut porter plusieurs usages distincts ; aucune duplication du passeport physique. Aucun calcul de consommation, d'économie, d'émission ou de dimensionnement.
- `energy_topology_events` : audit append-only ; les modifications cachées et suppressions sont interdites, y compris après révocation. Les nouveaux objets C4A sont immuables dans cette tranche ; leur édition / archivage versionné est à prévoir en C4B.
- Toutes les FK sensibles sont **composites** (site, tenant, propriétaire). Une source A ne peut alimenter une cible ou un équipement de B. Toute API nécessite une session Core, appartenance Energy, propriété du site, Origin exact pour POST, UUID structurés, refus des champs étrangers, clé d'idempotence pour création.
- API `/api/energy/topologie/v1` : `GET /sites`, `GET /sites/:id/carte?offset=...` (pagination 100 par page et résultat explicitement partiel), `POST /sites/:id/appareillages`, `POST /sites/:id/liens`, `POST /sites/:id/usages`, `POST /sites/:id/liens/:linkId/retirer`. Aucune route C4A ne lit les photos, QR, passeports, contrats ni relevés de consommation.
- UI : `/energie-cartographie.html?tenant=ENERGY_MVP01D_RECETTE` sur **3482**. Trois vues explicites, formulaires pour l'édition de données, pas encore dessin graphique. Les schémas doivent rester séparés du contrat (non implémenté) et des plans réels de sécurité électrique.

## Recette de préproduction simulée A/B

1. Contrôles Git local / SHA GitHub `6571ca1`, fichiers cibles seulement, intégrité SHA256 ZIP.
2. Tester C4A, C3B, C3A, C2, C1, B1, A2, A1, inventaire/UX, Core, P1, Ambassade, Diaspora.
3. Test PostgreSQL **en transaction ROLLBACK** : FK et contraintes, un compteur mesure deux bâtiments, un tableau dessert deux bâtiments, cycle T2→TGBT refusé, origine du lien validée, usage canonique, suppression impossible de l'audit, rollback total.
4. Seulement après la phrase `AUTORISER_MIGRATION_MVP02C4A`, migration durable 059 **dans `sateer_test` uniquement**, sans réapplication si tables présentes.
5. Serveur 3482 isolé, authentification Core A/B existante, E2E sans nouveaux comptes : A déclare un site fictif ; B ne peut voir ou manipuler sa carte ; cycle SQL et liens incohérents refusés ; retrait conservé.
6. Revue visuelle de l'interface et de l'absence de conclusions d'énergie. Saisie explicite `VALIDER_VISUEL_MVP02C4A` si conforme ; sinon aucun commit.
7. Commit ciblé après recontrôle Git, push normal, vérification explicite **SHA local == SHA GitHub**, worktree propre, rapport ZIP consolidé ouvert automatiquement dans Finder. Aucun reset, clean, pull, rebase, stash ni force-push.

## Limitations et suites annoncées

- **C4B** éditeur d'esquisses intégré : glisser-déposer de bâtiments et circuits, import éventuel d'un plan, positions de diagramme **distinctes** des positions géographiques, sauvegarde de mise en page, correction/archivage versionnés, création assistée **non automatique sans confirmation** des espaces C1. Les nouveaux lieux requièrent la permission C1 ; aucune permission implicite attribuée par simple dessin.
- **C4C** avancement hiérarchique, cartes de synthèse, contrôles des données, suivi de missions ; pas de calcul d'économie sans baseline et méthode.
- **Accès contractuel** à spécifier séparément : moteur de contrat signé vérifié, personnel SATEER réellement habilité, preuve de mandat, journal de consentement, droits de consultation/écriture distincts, expiration, révocation. Les photos, OCR et relevés n'y sont pas automatiquement versés.
- Charge / pagination sur grands sites et vraie recette **A→B→C→D** (4 identités Core distinctes) encore à démontrer. Aucune prétention à un jumeau BIM/3D, à une certification, à une mesure réelle, à un audit ISO complet ou à une sécurité électrique vérifiée.
- Pas de branche parallèle Energy qui duplique le registre Equipment, Auth, le Core ou les tables C1/C2/C3.

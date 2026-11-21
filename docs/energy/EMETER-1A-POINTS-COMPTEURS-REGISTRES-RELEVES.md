# SATEER Energy / SUNU COURANT — E-METER-1A : premier parcours de saisie manuelle

**Statut de livraison : candidat, non validé sur le Mac, aucun push GitHub.** Base E-ARCH publiée : `6f376a791e9ffb0d7c7eb558b8b2bb280bf6c4d2`, branche `work/energy-mvp01`.

## 1. Ordre figé, sans déplacement

Respecter `SATEER-ENERGY-ORDRE-DE-DEVELOPPEMENT-20261120.md` et `docs/energy/ROADMAP-MVP-REV3.md` : **E-ARCH clôturé → E-METER-1 → E-PARTICIPATION-1 → E-METER-2 (photo/OCR) → E-METER-3 (calculs) → ...**. Engineering/Simulation reste transversal, indépendant de l'expérience SUNU COURANT. Aucun calcul de consommation ni validation de rendement n'est réalisé en E-METER-1A.

**E-METER-1 est découpé en tranches verticales**, pas réduit à 1A :

- **1A (présent lot)** : point de comptage universel, compteur physique, registres/unités, relevé manuel horodaté, provenance et audit, lecture de l'historique, écran propriétaire privé ; lecture et écriture avec Core Auth et tenant.
- **Tranches suivantes du même E-METER-1** (à ouvrir seulement après validation 1A) : factures et recharges, justificatifs et pièces, import contrôlé, historique de remplacement de compteur, contrôles de qualité avancés, connecteurs pays/opérateurs versionnés. Ne pas passer à E-PARTICIPATION-1 avant de clôturer E-METER-1 selon ses critères complets.
- **E-PARTICIPATION-1** ensuite : affectations des responsables, fréquence, suivi des relevés, preuve d'inaccessibilité en sécurité, notifications. Les collaborateurs n'ont **pas** de permission E-METER-1A.

## 2. Frontières et données canoniques

| Entité | Responsabilité | Ne doit jamais impliquer |
|---|---|---|
| `energy_meter_points` | Point logique sur un site, énergie et type GENERAL/SECONDAIRE/AUTRE | Affectation automatique à un bâtiment ou à un appareil |
| `energy_meter_devices` | Compteur physique au point ; technologie ≠ mode commercial | Tarif, distributeur, télérelève obligatoire, certification |
| `energy_meter_registers` | Code distinct par compteur, unité explicite | Conversion automatique ou addition de registres incompatibles |
| `energy_meter_readings` | Valeur d'index décimale exacte, date avec fuseau, auteur, source manuelle, observation | kWh consommés, économie, facture ou mesure certifiée |
| `energy_meter_events` | Audit append-only, auteur et événement versionné | Modification silencieuse des lectures passées |

Saisie : valeur **chaîne décimale** (maximum 14 chiffres entiers, 6 décimales), pas flottant JS ; unité du registre sous forme d'instantané immutable dans le relevé. `provenance=SAISIE_MANUELLE`, `qualification=DECLARE_A_VERIFIER`. Index de plusieurs registres, remise à zéro ou remplacement de compteur ne sont pas encore interprétés ; jamais convertir une baisse d'index en consommation négative.

Un site `SANS COMPTEUR` reste possible. Un point peut couvrir plusieurs zones : **aucun kWh n'est automatiquement ventilé**. Les frontières Core/tenant/personne/site sont contrôlées côté HTTP **et PostgreSQL** par clés étrangères composites. L'API ne lit ni photographies privées, ni données de santé, ni pièces d'identité.

Les références de 051, 055, 059 restent les données existantes ; le lot ne réécrit ni C4A ni C4C. Aucun nouvel Auth ou moteur Communication. Aucun tarif national ou opérateur préinséré.

## 3. API de recette, propriétaire uniquement

Activée exclusivement si `PGDATABASE=sateer_test`, `SATEER_ENABLE_ENERGY_MVP01=1`, `SATEER_ENABLE_ENERGY_MVP02=1` et `SATEER_ENABLE_ENERGY_METER_1A=1` :

- `GET /api/energy/mesures/v1/sites?tenant=...`
- `GET /api/energy/mesures/v1/sites/:siteId/points?tenant=...`
- `POST /api/energy/mesures/v1/sites/:siteId/points?tenant=...`
- `POST /api/energy/mesures/v1/sites/:siteId/points/:pointId/compteurs?tenant=...` (premier registre atomique)
- `POST /api/energy/mesures/v1/sites/:siteId/compteurs/:meterId/registres?tenant=...`
- `POST /api/energy/mesures/v1/sites/:siteId/registres/:registerId/releves?tenant=...`
- `GET /api/energy/mesures/v1/sites/:siteId/registres/:registerId/releves?tenant=...&offset=0`

Chaque `POST` exige l'en-tête `Origin` exact et `Idempotency-Key` UUID, liste blanche de champs et session Core. Collision d'idempotence avec contenu différent = 409. Lectures et écritures refusées si site étranger, session absente ou tenant incorrect. Le propriétaire peut travailler sans C1 initialisé. Pas de délégation fictive.

## 4. Migration 061 — consentement et environnement

`database/061_energy_meter_manual.sql` est **additive** et conditionnée à `sateer_test` sur le cluster `7699611241381229531` ; les fichiers 050–060 et Core sont intacts. Un script de maintenance lance `dryrun` avec transaction SQL intégralement annulée et contrôles FK + écriture/immutabilité sous `SAVEPOINT`. L'installation persistante n'a lieu qu'après le texte d'accord `AUTORISER_MIGRATION_EMETER_1A`. Les données fictives de contrôle sont annulées et ne restent pas en base. Les relevés éventuellement saisis par le propriétaire sur l'écran de recette sont, eux, persistants **dans `sateer_test` seulement**.

Écran : `http://localhost:3488/energie-releves.html?tenant=ENERGY_MVP01D_RECETTE`. Il faut disposer de la fixture Core A/B existante. Le script fait les tests Node, **101/101 C4C**, **17/17 non-régressions**, vérifications PG et HTTP A/B, puis recueille des verdicts visuels factuels. Il requiert une autorisation **séparée** `VALIDER_EMETER_1A_ET_POUSSER` pour le commit/push ciblé, jamais force-push. Les contrôles de GitHub distant sont effectués avant et après.

Pour l'audit et Codex : versions des scripts, documentation, journaux et SHA inclus dans le rapport ZIP révélé automatiquement dans Finder. Le document REV2 non suivi est préservé hors commit.

## 5. Limites, à ne pas masquer

- **Pas encore de facture/recharge, de pièce jointe ou d'import :** E-METER-1 n'est pas complet à la clôture de 1A.
- **Pas encore de remplacement de compteur :** le schéma prévoit plusieurs compteurs historiques par point, mais l'API de 1A limite la création à un appareil actif. La transition active/inactive sera développée avec audit dans une prochaine tranche d'E-METER-1.
- **Pas encore de validation de valeur de mesure :** le contrôle porte sur le type, la précision, la date et l'intégrité, pas une certification. Contradictions entre index et preuves absentes demandent revue humaine ultérieure.
- **Pas encore de test de performance au-delà de 50 points par page :** une pagination incrémentale représentative sera requise avant un gros déploiement. Une limitation de liste est explicitement signalée, jamais interprétée comme exhaustivité.
- **Aucune garantie de sécurité terrain :** saisie seulement si affichage visible sans intervention électrique ; la photo ne sera traitée qu'en E-METER-2.
- **Pas encore de calculs scientifiques :** E-METER-3 traitera les différences d'index compatibles, coefficients, dates, anormalités, et le moteur Engineering/Simulation indépendant traitera ses propres modèles à l'étape prévue.

## 6. Critères de clôture 1A

Tests statiques et métier, PostgreSQL après vérification de cluster, GET et refus A/B, validation humaine de création/lecture et des comportements de refus, non-régressions, documentation, commit ciblé, push normal GitHub, SHA distant identique. Sans toutes ces preuves : **pas de clôture**. Ne pas engager la tranche 1B ou E-PARTICIPATION à l'avance.

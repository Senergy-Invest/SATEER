# REV3 — Passeport universel d'équipement, maintenance et diagnostics

## Modèle canonique durable (proposition de contrat, non migration livrée)

| Entité / agrégat | Champs minimaux | Règle |
|---|---|---|
| `Equipment` | `equipment_id` UUID; `tenant_id`; `owner_organisation_id`; `equipment_type`; `site_id?`; `lifecycle_state`; `created_at`; `revision` | ID permanent même en remplacement de propriétaire ; jamais déduire du numéro de série |
| `EquipmentIdentification` | marque/modèle/référence, numéro série facultatif, année, puissance, état, classe, fabricant | Toutes les propriétés métier optionnelles selon type ; masquage des identifiants sensibles |
| `EquipmentRelation` | parent/parties associées, site courant, actif installé sur, équipement remplacé par | Historique daté, liens cohérents, pas d'orphelin silencieux |
| `EquipmentEvent` | ID, equipement, `event_type`, timestamp, auteur autorisé, valeurs modifiées, motif, provenance, evidence_ref, version | Append-only logique, journal inviolable à contrôler, pas de modification furtive |
| `MaintenancePlan` | déclencheur temps/heures/cycles/mesures, procédure/version, habilitation, échéance | Historique et condition de mise à jour du plan |
| `WorkOrder` | machine, symptôme, priorité, responsable, états, intervention, cause, pièces, résultat, validation | Workflow générique SATEER + module métier Maintenance |
| `DiagnosticObservation` | mesures, unités, méthode, source, incertitude, état déclaré/mesuré/validé | Ne jamais confondre un diagnostic suggestif et une expertise sur site |

## Cycle de vie et preuve de non-perte

`CREATED → INSTALLED → ACTIVE → MAINTENANCE → ACTIVE → RETIRED/REPLACED/ARCHIVED` (transitions exactes à figer par type).

- Suppression logique des fiches courantes avec historique obligatoire ; aucune destruction physique sans règle de conservation, droit et piste d'audit.
- Rétention légale/conventionnelle, droits d'oubli et conservation d'un journal technique minimal compatibles selon base légale ; ne pas promettre l'immortalité absolue.
- Backups chiffrés, tests de restauration, export avec identifiant et versions, détection des doublons, synchronisation offline idempotente si autorisée.
- Preuves : historique d'installation, entretien, réparation, changement de propriétaire/site, relevés, reçus et rapports autorisés.
- Séparation `Equipment` / `Maintenance` / `Engineering` / `Monitoring` : une mesure peut alimenter plusieurs analyses, sans nouveau stockage canonique identique.

## Industriel

Machines de production, moteurs, groupes, transformateurs, compresseurs, froid/HVAC, chaudières, pompes, installations PV, équipements électriques. Détection de dérive et maintenance conditionnelle uniquement sur données suffisantes ; validation technicien avant instruction critique ; procédures de consignation propres aux équipements.

## Automobile et flotte

`Vehicle` = spécialisation d'Equipment (caractéristiques et contexte de flotte), pas un deuxième registre. Symptômes, carnet d'entretien, kilométrage provenance, rapports atelier et mesures OBD en lecture autorisée. Une identification par VIN est une donnée à protéger ; ne jamais l'utiliser comme clé primaire publique. Ne pas promettre réparation correcte, conformité, sûreté routière ou accès constructeur sans données/habilitations.

## Tests obligatoires des futurs MVP

Création et réouverture après redémarrage, unicité interne, déduplication de sérial, transfert de propriété isolé, retrait/archivage sans perte d'historique, refus cross-tenant, droits d'agent, concurrence, idempotence des évènements, reconstruction depuis journaux, sauvegarde/restauration, indicateurs calculés sur mesures valides.

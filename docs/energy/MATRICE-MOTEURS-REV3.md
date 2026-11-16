# SATEER Energy — Matrice consolidée REV3

# SATEER Energy REV2 — Propriété des moteurs, services, données et droits

## Règle : une responsabilité, un propriétaire, plusieurs expériences possibles

| Domaine/moteur | Propriété fonctionnelle | Réutilisé par | Hors périmètre |
|---|---|---|---|
| Core/Auth/RBAC | Identité, organisations, contextes, habilitations, audit | Tous | Calculs énergétiques |
| Communication | Publications, messages, souscriptions, notifications, campagnes informatives | Energy, PIT, AEME, ANER, ASER, SENELEC, Academy | Traitement de mesure, décision de programme |
| Workflows/Case | Dossier, états, affectations, approbation, escalade, événements | Energy, Invest, Institutions, Education | Formules scientifiques |
| Data Intake & Quality | Ingestion, parsing, unité, schéma, provenance, déduplication, erreurs, statut vérifié | Energy, Operations, Institutions, Monitoring | Décision administrative, autorité scientifique à elle seule |
| Technical/Data Operations (bureau interne) | Gestion humaine des dossiers data, validation/retours terrain, reports et synthèse | Institutions, Energy/BEI | Publier à la place d'institution sans permission |
| Site/Inventory | Site, bâtiment, étage/pièce/zone/extérieur, équipement, usages, contributeurs | SUNU, BEI, PIT, Academy (copies pédagogiques) | Rôles d'identité du Core |
| Billing/Tariffs/Usage | Compteur/recharge/facture/relevé, unités, catalogues versionnés, estimation | SUNU, institution, BEI | Gestion transactionnelle de paiement |
| Baseline/Diagnostic/Efficiency | Baseline, écarts, bilan, mesures de sobriété et confort | SUNU, BEI, programmes, Academy | Certification de gains sans données |
| Engineering/Simulation | Moteurs scientifiques déterministes, scénarios, PV/stockage/pompage | BEI, Academy, Education, Invest (sorties techniques) | Accès direct à comptes/dossiers réels depuis une sandbox |
| Projects/Assets | Projet technique, lot, EPC, réception, actifs, acteurs, maintenance | BEI, ANER, ASER, Monitoring | Investisseurs/financeurs |
| Monitoring/M&V | Relevés, IoT, alertes, performance prévue/installée/mesurée, économies vérifiées | Exploitants, Energy, BEI, Invest (KPI autorisés), Academy (cas publiés) | Hypothèse = mesure |
| Learning | Contenus, niveaux, exercices, évaluations, progression, catalogue cas autorisés | Education, Academy, institutions/agents | Deuxième moteur de simulation |
| Invest | Finance, opportunités, instruction, data room, portefeuille, droits investisseurs | SATEER Invest et passerelles contractuelles | Audit énergétique brut et contrôle technique initial |
| AI Services | Explication, classification, aide à la saisie, documentation/versioning avec garde-fous | Workflows, BEI, Data Quality, Learning | Autoriser/signer à la place des humains |

## Frontières d'événement / contrat à construire progressivement

- `EnergyCaseCreated.v1` → identités site/propriétaire/tenant et problème déclaré (référence, pas PII dupliquée).
- `InventoryContributed.v1` → contributeur habilité, provenance, version, validation par propriétaire.
- `EnergyEvidenceQualified.v1` → validateur, niveau de qualité, anomalies, corrections traçables ; aucune mutation silencieuse.
- `PreDiagnosticReviewed.v1` → BEI: version, hypothèses, limites, approuvé/refusé par agent habilité.
- `InstitutionalPackagePublished.v1` → agrégats et pièces minimales autorisées, contrat et version côté institution.
- `SimulationCaseReleased.v1` → données synthétiques/autorisation documentée, analyse risque de réidentification, version curriculum ; jamais lien direct à données privées.
- `TechnicalPackageTransferredToInvest.v1` → opt-in, version/empreinte, accès minimal, possibilité de révocation et révalidation, Invest assume son propre workflow.

Les noms ci-dessus sont des **contrats candidats** à revoir au MVP concerné, pas des API déjà livrées.

## Politique de confidentialité structurante

1. Séparation **raw/qualified/aggregated/published** ; contrôle d'accès à chaque état.
2. Aucune liste nominative d'une campagne fournie à une direction sans besoin autorisé.
3. Mineurs : pas de cas énergétiques réels ni de photos privées en accès classe ; modèles synthétiques par défaut, consentements spécifiques si applicable.
4. Traçabilité des corrections, justificatifs, versions de règle et opérateurs humains.
5. Les simulations pédagogiques sont **sandboxées et sans droit d'écriture** dans EnergyCase/Projects/Assets réels.
6. Pas de prédiction ou d'économie présentée comme garantie ; communication publicitaire et décision d'investissement distinctes.

---

## REV3 — Nouveaux propriétaires et frontières (complète la matrice REV2 ci-dessus)

| Moteur/capacité | Responsabilité unique | Consommateurs | Ne doit pas faire |
|---|---|---|---|
| Equipment Registry / Passport | Identifiant stable, référentiel équipements tous types, relations site, versions, preuves, transferts | Energy, Industrie, Automobile, Maintenance, Academy, Monitoring | Modèles Equipment indépendants par secteur ; suppression historique invisible |
| Maintenance Engine | Plans de maintenance, incidents, OT, interventions, pièces, états, éligibilité technicien, preuves | Industrie, Exploitation, Équipements, Flottes | Contrôle direct non autorisé d'équipements ; décision de sécurité autonome |
| Industrial Diagnostics | Procédures/protocoles et calculs du secteur industriel, dangers, conditions machine | BEI, Opérations, Maintenance | Capter les droits Core ou la source de vérité Equipment |
| Automotive Diagnostics Adapter | Symptômes, historique véhicule, mesures OBD autorisées, rapports technicien | Flotte, ateliers, Academy | Déployer commandes véhicule, certification sécurité automatique |
| Policy & Opportunity Intelligence | Politiques, avis, aides, marché, fonds, sources, échéances et historique | Strategy Review, Energy, Invest, Institutions | Décider de répondre, inventer l'admissibilité |
| Capability Registry | Référentiel contrôlé des modules/tests/compétences effectivement déployés | Opportunity Matching, Codex, Planning | Déduire une capacité uniquement d'un texte marketing |
| Opportunity Matching & Gap Discovery | Croiser avis ↔ capacités vérifiées ↔ projets autorisés ; classement explicable, propositions de gaps | Strategy Review, Invest, BEI, portfolio | Lire des secrets ou engager l'entreprise sans validation |
| Strategy & Opportunity Review (rôle) | Revue humaine d'éligibilité, calendrier, partenaires, validation des pistes | Direction SATEER, pôles métiers | Nouveau système RBAC, nouvelle Communication ou banque |

### Contrats candidats (non livrés)

- `EquipmentRegistered.v1`, `EquipmentLifecycleChanged.v1`, `MaintenanceEventLogged.v1`, `WorkOrderReviewed.v1`.
- `ExternalNoticeObserved.v1`, `PolicyChangeDetected.v1`, `OpportunityQualified.v1`, `OpportunityMatched.v1`, `CapabilityGapSuggested.v1`.
- `ProjectPortfolioSnapshotReleased.v1` contient **uniquement** des références et métadonnées explicitement autorisées.

### Diagramme des frontières (logique, pas nouvelle infrastructure)

Core (Auth/RBAC) → Equipments / Maintenance → adaptateurs Industrie/Automobile → Monitoring ;
Policy & Opportunity Intelligence → Data Quality → Opportunity Matching ↔ Capability Registry / projets autorisés → revue humaine → Communication/Workflow ;
Handoff opportunité financière → Invest après contrôle humain + autorisation.

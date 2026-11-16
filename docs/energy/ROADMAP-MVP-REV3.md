# SATEER Energy — Roadmap consolidée REV3

**Statut :** proposition d'ordre d'exécution cohérente avec les décisions REV1–REV3. **Les identifiants historiques MVP01–MVP14+ ne sont pas renumérotés.** Les sous-MVP explicitent la priorité sans détruire la planification REV2. Chaque jalon exige un rapport et un SHA GitHub contrôlé.

---

## A. Roadmap REV2 conservée pour la traçabilité

# SATEER Energy — Feuille de route priorisée REV2

**But :** livrer de vraies tranches verticales, sans perdre la vision et sans multiplier les chantiers parallèles. Ordre de priorité **proposé pour l'exécution** le 16/11/2026, à confronter aux prérequis du code réel lors de chaque lot. Une phase peut être découpée en MVP plus petits si ses critères ne peuvent être testés proprement.

## Phases

| Priorité | MVP | Livrable testable | Moteurs/expériences principaux | Condition de clôture |
|---|---|---|---|---|
| P0 | 00C — Référentiel et isolation | Worktree Energy isolé, REV2 documentée et versionnée, tests statiques non-régression, SHA GitHub vérifié | Core + gouvernance | Aucune modification Bordeaux/Ambassade/Diaspora/P1 |
| P0 | 01 — Besoin énergétique | 3 profils Particulier/Pro/Organisation ; demande multi-sources incluant site sans compteur, électricité/pompage ; EnergyCase traçable | SUNU Courant + EnergyCase/Workflow | Session, tenant, droits, conservation des champs et historique prouvés |
| P0 | 02 — Inventaire participatif | Site/bâtiment/étage/pièce/extérieur/équipement, liens de contribution temporaires, validation responsable, provenance | Energy Inventory + Core permissions | Tests de conflit, consentement et cloisonnement |
| P0 | 03 — Consommations et données | Facture/recharge/relevé manuel, Woyofal comme adaptateur local, baseline et étiquettes déclaré/estimé/mesuré | Billing/Usage + Catalogues + Baseline | Tarifs sourcés/versionnés, site sans compteur conservé |
| P0 | 04 — Data Quality & SATEER Operations | Intake, dédoublonnage, contrôles, rejets/requêtes de correction, revue humaine, synthèse fiable | Data Quality + Workflows + Technical Operations | Journaux, provenance, relecture et refus correctement testés |
| P1 | 05 — Prédiagnostic bâtiment | Parcours bâtiments publics/privés/PME, postes prioritaires, confort et efficacité avant solaire | Diagnostic + Efficiency + BEI light | Estimations signalées, décisions humaines, dossier exploitable |
| P1 | 06 — AEME/PIT & campagnes | Campagnes et formulaires, relais PIT avec permissions, vérification terrain, cohortes avant/après et KPI | Communication existant + Workflow + Data Operations + Campaigns | Simulation avec rôles fictifs ; jamais prétendre à un mandat AEME |
| P1 | 07 — Engineering/BEI première simulation | Premier moteur scientifique déterministe (ex. bilan appareil/puissance/énergie), scénario comparatif, revue ingénieur, rapport versionné | Engineering/Simulation + BEI | Calibration/test de référence et revue humaine |
| P1 | 08 — Éducation & Academy premières simulations | Même moteur Engineering, deux parcours pédagogiques (lycée et étudiant/pro), cas synthétiques, aucune écriture projet réel | Learning + Éducation + Academy | Isolement des datasets, profils mineurs, reproductibilité |
| P2 | 09 — ANER/ASER renouvelables et rural | Cas pompage/forage, sites isolés/hybrides, demande/projet/équipement, adaptation programme | Rural + PV + Projects + institution Workspaces | Prérequis pays/ressources, acteurs et qualité prouvés |
| P2 | 10 — SENELEC / qualité de service | Préqualification réclamation et mesures, organisation/région/agent, retour client, sans transport officiel non autorisé | CustomerCases + Workflow + FieldOps | Zéro notification à opérateur externe sans convention |
| P2 | 11 — Cycle projet et actifs | Étude validée → projet → EPC/réalisation → réception → registre d'actifs → maintenance | Project OS + Asset + Maintenance | États audités, rôles Owner/Installer/Operator/Maintainer |
| P2 | 12 — Monitoring et M&V | Mesures manuelles/API puis IoT, anomalies, baseline, économies vérifiées, tableaux de bord | Monitoring + Data Quality + M&V | Mesuré vs estimé rigoureusement distingués |
| P3 | 13 — Handoff vers Invest | Dossier technique éligible, consentement, transfert versionné, revue Invest, reporting partiel | Energy + Invest (contrats séparés) | Aucun versement ni publication automatique |
| P3 | 14+ — Extension | Campagnes avancées, BEI industrialisé, Academy complète, finance réglementée, catalogues CEDEAO, IA explicable et IoT à l'échelle | Packs spécialisés réutilisables | Livraisons isolées avec cas d'usage prouvé |

## Dépendances transversales à mettre en place très tôt

- **Au MVP01** : EnergyCase générique, provenance/consentement/site, contrats d'événements et données, séparation expérience SUNU vs moteurs, plan d'habilitation future Academy/Institutions/Invest. Ne pas réaliser ces expériences dès le MVP01.
- **Au MVP02–03** : modèle d'équipement stable et mesures provenance/unités, permettant ensuite diagnostics, simulations, maintenance, pédagogie.
- **Au MVP04** : Data Quality et équipe opérationnelle internes sont prioritaires **avant** un pilote AEME conséquent ; aucune donnée brute non contrôlée remise comme KPI fiable.
- **Au MVP06** : réutiliser Communication pour annonces et notifications, Workflow pour tâches ; institution décide et signe ; ne pas créer de moteur PIT autonome.
- **Au MVP07–08** : premier moteur scientifique utilisable par BEI et Learning, et premier cas pédagogique synthétique. L'Academy n'est pas repoussée après toute la chaîne Invest/IoT.
- **À partir de MVP09** : ASER/ANER et solaire rural ne doivent pas se résumer au ménage équipé d'un compteur ; pompage et hybridation sont des cas nativement pris en charge.
- **Depuis le début** : paramètres et référentiels pays/opérateurs distincts ; CEDEAO est une cible d'extension, pas un prétexte à complexifier MVP01.

## Critères invariants de chaque livraison

1. Architecture et propriété claire de chaque moteur, pas de duplication de Communication, Workflows, Core ou Engineering.
2. Fonction utilisable par un profil réel de recette, refus d'accès contrôlés ; scénario négatif obligatoire.
3. Hypothèses, unités et limites des mesures/simulations correctement affichées.
4. Contrats, tests, documentation et compte rendu unique versionnés.
5. Commit ciblé local, push GitHub sans force, contrôle de SHA distant, référence de reprise Codex.
6. Aucun changement régressif Bordeaux, Ambassade, Diaspora ; pas de correction de leurs branches pendant un lot Energy.

## Travaux ultérieurs non supprimés

Éclairage et appareils performants, campagnage « 3 lampes », réseaux de femmes/marchés/SONAGED, hôtellerie, industrie, qualité électrique, matériaux locaux/cool roof, froid/HVAC, solaire thermique, solaire PV, stockage, pompage, maintenance, programmes publics, audits complets, M&V, IA d'assistance, Education/Academy multi-âges, SATEER Invest et vitrine de projets. Les cas étendus seront des sous-MVP planifiés à partir des briques livrées.

---

## B. Sous-MVP et ajouts REV3 priorisés — plan directeur d'exécution

| Priorité | Jalon | Livrable vérifiable | Dépendance / garde-fou |
|---|---|---|---|
| P0 | **00D — Documentation REV3** | Un référentiel actif REV3 et son registre + SHA remote | Avant code Energy ; ne pas exécuter REV2 séparément |
| P0 | **02A — Equipment Passport** | Fiche canonique équipement, identifiant stable, versions, transfert, archives, tests | Au sein / immédiatement après MVP02 ; **tous types**, pas seulement solaire |
| P0/P1 | **04B — Veille initiale** | Registre des sources officielles, import manuel/lecture seule, dates et doublons ; première synthèse quotidienne/hebdo | Après Data Quality MVP04 ; aucune soumission automatique ; scheduler plus tard |
| P1 | **06B — Matching d'opportunités V1** | Correspondance avis avec capacités prouvées et métadonnées projets autorisées, score/critères, revue | Après registre capacités/projets ; peut commencer en manuel pour fiabiliser |
| P1 | **07B — Agent de découverte des manques** | Préconisations `capacité existante` / `projet réutilisable` / `écart à construire` | Agent encadré, prompt injection testée, aucune action externe autonome |
| P1 | **08B — Cas pédagogiques maintenance** | Simuler diagnostic/maintenance sur équipement synthétique ou projet libéré | Réutiliser moteurs Engineering & Maintenance, données mineurs protégées |
| P2 | **11A — Maintenance industrielle** | Ordres d'intervention, historique, plan de maintenance, disponibilité des machines, audits | Equipment Passport obligatoire, technicien habilité |
| P2 | **11B — Diagnostic automobile et flotte** | Carnet véhicule, symptôme/mesure, triage assisté, diagnostic validé par technicien | Adaptateur spécialisé sans écriture commande véhicule et sans duplication du Core |
| P2 | **12B — Automatisation de veille et suivi de politiques** | Jobs quotidiens/hebdo, versions de politiques, alertes échéance, signalement de flux inaccessibles | Respect accès/robots, orchestration supervisée, métriques fraîcheur et erreurs |
| P3 | **13B — Qualification Invest des opportunités** | Transfert d'opportunités financières validées vers Invest (séparé de l'analyse technique) | Pas de finance ou financement dans Energy, consentement et contrôle humains |

### Priorités produit à ne pas inverser

1. **MVP01 → 02 (+02A) → 03 → 04** : dossier, actifs durables, mesures, contrôle de la donnée.
2. **MVP04B** : veille sourcée dès le début de l'usage institutionnel, sans attendre la maturité Invest.
3. **MVP05 → 06 (+06B) → 07 (+07B) → 08 (+08B)** : premier prédiagnostic bâtiments et PIT, opportunités et apprentissage sur moteurs réutilisés.
4. **MVP09/10 → 11 (+11A/11B) → 12 (+12B) → 13 (+13B)** : autres acteurs, maintenance terrain, monitoring, Invest.

Le matching initial peut utiliser des **capacités testées existantes** et des cas synthétiques. L'agent n'invente pas un chantier disponible ; il classe les insuffisances en `GAP_A_EVALUER`. Si l'agent détecte un problème que SATEER pourrait résoudre sans module actuel, il crée un **projet de proposition** soumis à validation produit.

### Critère supplémentaire REV3 pour chaque lot

Actualiser les états du Capability Registry (`planned`/`tested`/`released`) et la note Codex avec le commit et le SHA distant. Toutes les recommandations de l'agent doivent rester reliées à la version précise de la capacité ou du projet qu'elles invoquent.

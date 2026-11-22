# E-PARTICIPATION-1 — Missions de relevés : recette validée et passation

Recette du **22 novembre 2026**, exclusivement sur `sateer_test`, tenant fictif `ENERGY_MVP01D_RECETTE`. Ce document concerne une tranche **de recette**, et ne démontre pas une exploitation en production.

## Fonctionnement et périmètre

- Le coordinateur relie explicitement un point de comptage canonique E-METER à une unité C1, puis attribue une mission de lecture au grant C1 actif de l'occupant. Les droits restent contrôlés côté serveur par Core, le tenant, le site et la chaîne de responsabilités C1 ; aucune permission globale E-METER n'est transférée.
- L'occupant soumet un **index déclaré** ; cette proposition n'est pas encore un relevé canonique. Seul le coordinateur peut l'intégrer. Après intégration, le relevé rejoint `energy_meter_readings`, qualification `DECLARE_A_VERIFIER`, provenance `SAISIE_MANUELLE`, auteur Core de l'occupant et événement d'intégration du coordinateur.
- Le journal EP1 est append-only. Le scénario ne calcule ni consommation, ni coût, ni économie, ni tarif. Aucun capteur ni intervention physique n'est supposé.
- Migration additive **066** : `energy_meter_participation_links`, `energy_meter_participation_missions`, `energy_meter_participation_events`. Aucune modification des migrations E-METER précédentes. Route `/api/energy/participation/v1` montée seulement en recette via `SATEER_ENABLE_ENERGY_EP1_R1=1` et dépendances existantes.

## Preuves locales consolidées

- Audit R0, candidat R1 (**57/57** tests), migration 066 R2 contrôlée et autorisée, puis recette R3B A/B. Rapport source R3B : `EPARTICIPATION-1-R3B-mo_qpqsd-RESULTAT.zip` ; SHA-256 `3efb0786119cdda0c6fee42a6dd9c87229af8bee056aea594b43caa7b8dcafd0`. Rapports conservés hors Git dans `~/Documents/SATEER-RAPPORTS/`.
- R3B a reçu HTTP **201** pour la liaison, l'attribution, la proposition et l'intégration ; ses contrôles de sécurité anonymes/tenant/Origin/permissions sont réussis. L'assertion du **lanceur de recette** attendait `MISSION_EXAMINEE`, alors que le résultat HTTP contenait `statut: INTEGREE`, le champ métier du store prenant le pas sur le statut générique de la route. Le script a donc quitté avant les validations post-HTTP/visuelles : ne **pas** rejouer R3B.
- Diagnostic PostgreSQL R3B en lecture seule : **9 relevés au total, 8 anciens strictement inchangés**, 15 événements E-METER dont 14 historiques inchangés, un seul compteur actif, **1 liaison**, **1 mission INTEGREE**, **4 événements EP1**. La mission a créé l'index fictif `123.45` une seule fois.
- R3C a repris **uniquement les lectures** : comparaison PostgreSQL/empreintes, tests locaux et vérifications GET HTTP des comptes fictifs A/B. Les deux comptes voient la même mission `INTEGREE` ; l'index canonique `123.45` reste `DECLARE_A_VERIFIER`. Recette visuelle attestée par l'utilisateur sur la page A avant l'autorisation Git.

## Limitations et reprise

- L'idempotence en situation d'écriture est couverte par les tests de contrat, mais le replay HTTP **après intégration réelle** n'a pas été exécuté : R3B s'est arrêté juste avant. Aucun appel d'écriture de rattrapage n'a été déclenché sur cette mission persistante.
- La recette réelle authentifiée porte sur **deux comptes fictifs A/B** ; une chaîne A→B→C→D, les révocations en cours de mission, le multi-site massif, la charge et la pagination doivent être éprouvés séparément avant un déploiement.
- `server.js` garde l'activation explicite du lot et `sateer_test` comme garde de sécurité. Les données de cette recette sont locales sur le Mac ; GitHub ne reçoit **pas** les relevés PostgreSQL ni les identifiants privés.
- La clôture commit **exactement 10 fichiers du candidat** (dont `server.js`) et la présente note, push **sans force** sur `work/energy-mvp01`, SHA distant indépendamment vérifié ; référentiel local non suivi `REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` préservé.
- Prochaine étape uniquement après revue de la roadmap SUNU Courant : E-METER-2 (acquisition optionnelle de relevés, photographie/OCR nécessitant contrôle humain) ; ne jamais traiter un index comme une consommation certifiée.

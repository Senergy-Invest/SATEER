# SATEER Energy — E-PARTICIPATION-1 — R1 candidat (non livré)

Base GitHub vérifiée avant création : `Senergy-Invest/SATEER` branche `work/energy-mvp01`, SHA `80506b4d8084bf42cd74fdfdfd87f87ea1a07598` (E-METER-1E1 clôturé).
Audit local R0 : `EPARTICIPATION-1-R0-AUDIT-20261122T172420Z-RESULTAT.zip`, final `AUDIT_R0_TERMINE_SANS_ECRITURE`, Core C1 15 nœuds, 1 coordinateur + 1 occupant actifs, 8 propositions C2, 1 point, 2 compteurs dont un seul actif, 2 registres, 8 anciens relevés, 14 événements E-METER dont un remplacement. Aucun changement observé pendant R0. Fichier REV2 non suivi conservé.

## Contrat de tranche R1

1. L'**unique propriétaire** lie explicitement un point `energy_meter_points` à un nœud de responsabilité `energy_scope_nodes`. **Aucune relation induite** par nom, photo, plan ou câblage. Liaison immuable pour R1 ; correction ultérieure seulement par opération explicite et auditée.
2. Le propriétaire choisit le registre *actif* d'un compteur et attribue une mission à une affectation C1 `RESPONSABLE` ou `OCCUPANT` **active sur le même nœud**. Aucun rôle nouveau créé et pas de hiérarchie multi-niveaux supposée testée. Le chemin de tutelle C1 actif est vérifié et verrouillé ; pas d'attribution au propriétaire lui-même.
3. Le bénéficiaire authentifié saisit un index et son instant de lecture ; il ne voit que **ses missions** et n'écrit pas dans `energy_meter_readings`. L'index proposé est dans l'état `A_REVOIR`, avec son auteur C1, le compteur et le registre d'origine.
4. Le propriétaire peut **REFUSER** en conservant la proposition et la trace, ou **INTEGRER**. L'intégration recontrôle tenant/site, tutelle active, compteur encore actif et unicité de l'instant ; elle écrit **une seule fois** dans `energy_meter_readings` 061, `provenance='SAISIE_MANUELLE'`, `qualification='DECLARE_A_VERIFIER'`, auteur de la déclaration, et `MeterReadingDeclared.v1` dans le journal existant. Le `modeSaisie='DELEGATION_EP1_V1'` est noté dans les détails. **Une intégration n'est pas une certification d'un index physique.**
5. Le remplacement E-METER-1E1 **n'entraîne aucune migration des missions** vers le nouveau compteur : une mission de l'ancien registre est déclarée obsolète en écriture ; le propriétaire peut la refuser et créer une mission neuve après remplacement. Les anciens relevés et événements ne sont jamais modifiés.
6. Appels mutateurs soumis à Auth Core, appartenance tenant, Origin exact, UUID et `Idempotency-Key`. Transactions PostgreSQL, verrou site identique E-METER, verrou grants contre révocation, rollback intégral en cas d'erreur. Pas de droit implicite pour AEME, associations, institutions ou autres tenants.

## Structure de code

- `database/066_energy_meter_participation.sql` — 3 nouvelles tables (`links`, `missions`, `events`), contraintes FK site/tenant/propriétaire, événements append-only, 1 mission ouverte par registre/affectation. **Aucune modification de schéma historique 061 ou 065.**
- `energy/energy-meter-participation-domain.js` — validation pure des liaisons, missions, soumissions et décisions.
- `energy/energy-meter-participation-store.js` — SQL paramétré, permissions/locks C1, liens, journal et insertion canonique lors de l'intégration.
- `energy/energy-meter-participation-http.js` — façade `/api/energy/participation/v1` avec session Core et origine.
- `public/energie-missions-releves.{html,js,css}` — page privée simple pour coordinateur et contributeur ; aucun document/QR/IoT.
- `server.js` — montage isolé derrière `SATEER_ENABLE_ENERGY_EP1_R1=1`, `sateer_test` et les flags C1, C2, E-METER 1A.
- `scripts/test-energy-e-participation1.js` — tests du contrat métier, refus HTTP et invariants de code/schéma.

## Limites et preuves encore nécessaires

**Statut : code candidat uniquement.** Les tests synthétiques ne prouvent pas la sûreté du SQL réel. La commande R1 installe les fichiers et le montage inactif, contrôle les régressions et exécute la migration 066 **avec ROLLBACK**. Elle ne rend pas les nouvelles tables permanentes et n'active pas l'API.

Avant toute migration persistante : valider les tests réels avec deux comptes fictifs (A propriétaire, B occupant), vérifier la liaison du point (et le fait qu'il possède désormais un *nouveau* compteur), la lecture des droits et refus A/B, idempotence et même instant, refus après révocation et remplacement, intégration atomique, cas d'échec injecté avec rollback, intégrité cryptographique des huit relevés historiques, puis recette navigateur. Le responsable C1 intermédiaire n'est **pas actif** dans le jeu R0 ; une chaîne à 3+ comptes nécessitera une recette distincte.

La première installation R1 **ne crée pas de commit/push**, n'applique pas de migration persistante et ne demande aucun compte/mot de passe. Ne pas démarrer une instance avec le flag EP1 avant migration vérifiée et autorisée. Une campagne ultérieure séparée demandera une autorisation réelle, puis clôture GitHub ciblée, push normal, SHA distant vérifié.

## Hors périmètre

Aucun calcul de consommation, comparaison d'index entre compteurs, économie, facture, tarification, OCR, photo, capture IoT, tâche planifiée, notification réelle, intervention électrique ni preuve de certification. Pas d'accès collaborateur aux API 1A réservées au propriétaire. Liste de la page limitée à 100 éléments par contexte et 50 missions ; blocage de la création si contexte partiel. Déploiement multi-campus et tests de charge non établis.

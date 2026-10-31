# SATEER — Périmètre gelé du pilote consulaire de Bordeaux

État de référence : branche `sateer/phase1-multitenant-automation-20261030`, vérifié le 31 octobre 2026.

Ce document délimite le travail avant la rencontre avec le Consul et le Vice-Consul. **Aucun nouveau module métier, aucune extension à d'autres institutions, et aucune intégration e-Consulat avant cette rencontre.** Bordeaux n'est qu'un ensemble de données de configuration modifiables, pas une hypothèse codée en dur dans SATEER Core.

## Cinq livrables à démontrer

| Cible | Éléments déjà présents dans le dépôt | Restant à démontrer |
|---|---|---|
| Phase 1 complète : capacités, rôles et permissions | Endpoints backend de création/édition/activation, autorisations, migration 019–027, nouvel écran d'administration | Recette réelle de l'écran et administration complète des membres, déplacement/désactivation d'unités depuis l'UI |
| Routage et points d'entrée configurables | Tables de demandes, fonctions de routage, allowlist de destinations, configuration Bordeaux | Interface de modification des points d'entrée / destinations et démonstration qu'une configuration suffit sans nouveau code |
| Unit Workspace générique | Page `unit-workspace.html`, boîte de réception, prise en charge, orientation, réponse, accès conditionnés aux capacités et permissions | Recette visuelle des variantes de capacités et rôles, messages de refus et états vides |
| Vice-Consul / adjoint opérationnel | Dashboard opérationnel, organigramme, cartes d'unités dynamiques, membres, charge, alertes, accès aux unités et délégations | Vérifier les indicateurs et l'utilité des alertes à partir d'un jeu de données crédible |
| Consul / chef de mission | Dashboard stratégique séparé avec activité, tendances, catégories, couverture territoriale, communication | Vérifier la pertinence de la lecture stratégique et son cloisonnement par permissions |

## Parcours bout-en-bout obligatoire

1. Un citoyen connecté crée une demande pour une organisation du pilote.
2. La demande arrive par son point d'entrée et devient visible au secrétariat.
3. Le secrétariat oriente la demande vers une unité autorisée.
4. Un agent de l'unité peut la prendre en charge puis répondre.
5. Le citoyen consulte sa réponse et son historique.
6. Le Vice-Consul supervise la charge des unités et les alertes dans son périmètre.
7. Le Consul consulte sa synthèse stratégique, distincte de la supervision opérationnelle.
8. Un citoyen ou agent non autorisé doit être refusé par le backend.
9. Le même parcours doit pouvoir être reconfiguré pour une autre structure sans dépendre des codes/noms Bordeaux dans le moteur générique.

Les tests `scripts/workflow-e2e-test.js`, `scripts/multitenant-isolation-test.js` et `scripts/multitenant-constraints-test.js` couvrent déjà une partie substantielle de ce parcours sur une base PostgreSQL de test. **Une CI verte ne remplace pas la recette visuelle avec des données et profils de démonstration.**

## État de l'administration

- Nouveau module `public/administration-organisation.html` relié à `public/organisation-consulat.html`.
- Fonctions UI : créer une unité ou sous-unité, créer un rôle, activer/désactiver un rôle, activer/désactiver une capacité d'unité, accorder/retirer une permission d'un rôle.
- Les mutations utilisent les routes déjà protégées côté serveur ; les rôles système protégés sont bloqués par le backend.
- L'édition, le déplacement et la désactivation d'unités, ainsi que l'administration des membres, restent à finaliser/recetter dans l'interface.
- L'écran nouvellement ajouté passe des contrôles statiques ; sa validation interactive en navigateur réel reste à effectuer.

## Conditions de validation avant rendez-vous

- Rejouer un scénario à cinq profils avec données Bordeaux synthétiques, réinitialisables et identifiables.
- Examiner chaque action et refus sur les écrans ; vérifier que les erreurs sont compréhensibles.
- Vérifier que les unités, rôles, permissions, capacités, destinations et accès aux dashboards sont reconfigurables sans changement de code.
- Refaire `npm run check:all` dans la CI PostgreSQL jetable et garder la PR en brouillon jusqu'à validation.
- Ne pas appliquer les migrations du pilote à la base locale `sateer` sans préflight et sauvegarde/essai de restauration.

## Hors périmètre jusqu'après la rencontre

- Intégration e-Consulat, e-ambassade ou tout autre service institutionnel externe.
- Rapprochement/validation d'identités officielles externes.
- Nouvelles fonctionnalités sociales, paiement, énergie, IoT, santé ou autres verticales SATEER.
- Généralisation RLS à toutes les tables, dont la complexité excède le critère de démonstration Bordeaux.
- Refonte graphique transversale ou ajout d'autres parcours institutionnels.

**Ordre restant :** recette de l'administration et complétude de l'interface → paramétrage du routage/points d'entrée → recette à cinq profils → cohérence des deux dashboards → démo Bordeaux.

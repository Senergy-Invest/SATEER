# SATEER — Périmètre gelé du pilote consulaire de Bordeaux

État de référence : branche `sateer/phase1-multitenant-automation-20261030`, vérifié le 31 octobre 2026.

Ce document délimite le travail avant la rencontre avec le Consul et le Vice-Consul. **Aucun nouveau module métier, aucune extension à d'autres institutions, et aucune intégration e-Consulat avant cette rencontre.** Bordeaux n'est qu'un ensemble de données de configuration modifiables, pas une hypothèse codée en dur dans SATEER Core.

## Six livrables à démontrer

| Cible | Éléments déjà présents dans le dépôt | Restant à démontrer |
|---|---|---|
| Phase 1 complète : capacités, rôles et permissions | Endpoints backend de création/édition/activation, autorisations, migration 019–027, nouvel écran d'administration | Recette réelle de l'écran et administration complète des membres, déplacement/désactivation d'unités depuis l'UI |
| Routage et points d'entrée configurables | Tables de demandes, fonctions de routage, allowlist de destinations, configuration Bordeaux | Interface de modification des points d'entrée / destinations et démonstration qu'une configuration suffit sans nouveau code |
| Unit Workspace générique | Page `unit-workspace.html`, boîte de réception, prise en charge, orientation, réponse, accès conditionnés aux capacités et permissions | Recette visuelle des variantes de capacités et rôles, messages de refus et états vides |
| Vice-Consul / adjoint opérationnel | Dashboard opérationnel, organigramme, cartes d'unités dynamiques, membres, charge, alertes, accès aux unités et délégations | Vérifier les indicateurs et l'utilité des alertes à partir d'un jeu de données crédible |
| Consul / chef de mission | Dashboard stratégique séparé avec activité, tendances, catégories, couverture territoriale, communication | Vérifier la pertinence de la lecture stratégique et son cloisonnement par permissions |
| Canal institutionnel, associations et entrées e-mail | Publications ciblées, notifications internes, modèle de relations entre organisations, historique et test E2E de diffusion | Finaliser adhésion/validation des associations, abonnements volontaires au canal et connecteur de messagerie réel ; vérifier les destinataires et le consentement |

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

## Communication institutionnelle : périmètre explicite du rendez-vous

Le Vice-Consul doit pouvoir montrer, dans une seule interface, les informations officielles diffusées aux publics SATEER concernés et le chemin des demandes vers les unités compétentes. Ce canal est **une capacité générique du Core**, pas un module consulaire spécifique.

### Déjà développé et testé sur sateer_test

- `public/canal-officiel.html` et API `/api/organisations/:organisationId/canal-officiel` : publication autorisée et ciblage TOUS, PROFIL, DEPARTEMENT, ASSOCIATION.
- Permission explicite `MANAGE_PUBLICATIONS` et permission supplémentaire `TARGET_COMMUNICATION` pour le ciblage ; le rôle de Vice-Consul n'accorde pas ces droits automatiquement.
- Publication et création de notifications internes dans la même transaction ; membres de l'organisation ciblés et associations explicitement reliées.
- Rejet de publication par un citoyen non habilité ; rejet d'une association non connectée.
- Vérification E2E que l'usager retrouve publication et notification dans Mon Consulat.
- **Aucune réception SMTP/IMAP/Graph/Gmail et aucun envoi d'e-mail, SMS, WhatsApp ou push n'est opérationnel à ce stade.**

### Restant indispensable à une démonstration complète de communication

1. Terminer le parcours de raccordement d'une association : demande ou invitation, validation par l'organisation, autorisation du canal et visibilité des publications pertinentes.
2. Permettre aux usagers SATEER de s'abonner volontairement au canal officiel indépendamment d'une appartenance administrative. Tant que ce mécanisme n'est pas réalisé, `TOUS` signifie membres de l'organisation, **pas tous les Sénégalais inscrits dans SATEER**.
3. Construire un adaptateur générique de boîte entrante e-mail : identifiant de message externe, déduplication, pièces jointes, conservation de la source, triage autorisé vers une unité, traçabilité, et réponse éventuelle. Une vraie démonstration de réception nécessite l'autorisation et un compte de messagerie pilote.
4. Vérifier le ciblage, les préférences de notification, les consentements de diffusion et le refus des accès entre organisations non autorisées.
5. Recetter tous ces parcours dans le navigateur avec des utilisateurs et une association synthétiques.

Une connexion Microsoft 365/Gmail, lorsque nécessaire, reste **un connecteur d'entrée remplaçable** et non une dépendance inscrite dans le modèle institutionnel SATEER Core.

### Critère de vérité de la démonstration

Ne pas affirmer que tous les Sénégalais sont automatiquement informés tant que les abonnements, les règles de ciblage et le mécanisme de distribution ne sont pas validés. Ne pas présenter une demande saisie manuellement comme un e-mail reçu automatiquement.

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

**Ordre restant :** administration et habilitation de communication → points d'entrée et routage → raccordement des associations → abonnement et diffusion ciblée → réception e-mail réelle avec accès autorisé → recette cinq profils et dashboards → démonstration Bordeaux.

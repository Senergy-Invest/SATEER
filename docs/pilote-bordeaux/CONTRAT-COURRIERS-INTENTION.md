# Contrat transversal — qualification des courriers avant routage

**Statut : contrat métier retenu pour Bordeaux, implémentation réelle non raccordée.** Ce document s'applique à la capacité générique de communication ; l'expérience Consulat apporte ses démarches, droits et modèles validés.

## Principe obligatoire

Une adresse e-mail officielle peut recevoir une question simple, une demande administrative ou une situation particulière. Le **thème** (passeport, état civil, carte consulaire) ne détermine jamais, à lui seul, le **type d'action**. Même un objet `[DEMARCHE:PASSEPORT]` ne prouve pas qu'un dossier doit être créé.

| Intention | Traitement cible | Invariant |
|---|---|---|
| Question générale explicite | Rechercher fiche publique exacte et modèle institutionnel approuvé ; réponse informative et lien vers Mon Consulat | Ne pas créer de dossier, ne pas envoyer librement depuis l'IA |
| Dépôt administratif explicite | Contrôler identité/complétude et règles ; créer un dossier de façon idempotente lorsque permis, puis router vers le bureau | Aucune création sur mot-clé seul |
| Suivi personnel, ambiguïté, réclamation, plusieurs thèmes | File du secrétariat, suggestion IA non décisionnaire, validation humaine | Ne pas promettre statut/délai ni publier de contenu non validé |

## Contrats à versionner avant raccordement réel

- `IncomingMessage` : `tenant`, `organisation`, `mailbox`, identifiant fournisseur, `messageId`, objet/corps normalisé, date, empreinte, références sécurisées de pièces, provenance.
- `IntentDecision` : version de règle, intention, catégorie et sous-démarche, motifs, `humanReviewRequired`, source et horodatage ; l'IA propose mais la politique décide.
- `KnowledgeResolution` : code/version de fiche, statut **explicitement validé + publié**, champs autorisés, correspondance exacte (première demande ≠ renouvellement), URL publique de consultation.
- `ProcessingOutcome` : `FAQ_DRAFTED`, `FAQ_SENT` **seulement après acquittement de l'envoi**, `CASE_CREATED`, `ROUTED`, `NEEDS_SECRETARIAT`, `RETRYABLE_ERROR` ; idempotence obligatoire.

Les messages entrants ne justifient pas tous un dossier consulaire. Réponse répétée, boucle d'auto-répondeurs, doublon et erreur transitoire doivent être testés. La boîte officielle actuelle reste utilisable et son accès nécessite un accord séparé.

## Tests minimaux de non-régression

1. « Quels documents pour renouveler mon passeport ? » → `INFORMATION`, pas de dossier, pas de routage.
2. Objet `[DEMARCHE:PASSEPORT] Information`, même question → `INFORMATION`, pas de dossier.
3. « Je souhaite déposer mon dossier » → proposition `DEMANDE`, sans création tant que conditions non vérifiées.
4. « Je souhaite préparer une carte consulaire » → ambigu, secrétariat.
5. « Mon dossier est bloqué » → individuel, secrétariat.
6. Aucune fiche active validée → pas de réponse qualifiée d'officielle.
7. Duplicata fournisseur → pas de nouveau dossier ni de second e-mail.
8. Refus intertenant / interorganisation ; citoyen ne peut accéder à la boîte du secrétariat.
9. Aucune connexion réelle ni envoi externe tant que l'institution n'a pas autorisé et testé le connecteur.

## Implémentation existante au 9 novembre 2026

Le pilote dispose d'un classificateur déterministe, d'une API et d'une UI de **simulation** : `public/sateer-mail-intent-core.js`, `bordeaux-email-demo-http.js`, `sateer-mail-guidance-core.js`. Le backend importe actuellement un module situé dans `public/` ; documenter et tester un contrat partagé avant déplacement. Les e-mails réels et réponses IA autonomes ne sont **pas** activés.

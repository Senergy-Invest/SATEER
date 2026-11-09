# Proposition — adaptateur générique d’ingestion d’e-mails

**Statut : conception uniquement.** Aucun connecteur, dépendance, route, stockage ou migration n’est ajouté par cette note. Aucun accès à une boîte réelle n’a été effectué.

## Responsabilités et frontières

Créer à terme une capacité générique `email-ingestion` qui reçoit des messages de boîtes explicitement autorisées et les soumet à une **qualification d’intention avant toute création de dossier**. Le routage ne dépend jamais du seul sujet ni de mots-clés. La qualification s’appuie sur un contrat partagé et versionné ; l’expérience Consulat reste une configuration, non un moteur du Core. Seules les demandes administratives vérifiées peuvent appeler la création de dossier puis le moteur de routage autorisé.

Contrats internes proposés :

- **Configuration de boîte** : organisation, tenant, point d’entrée/unité initiale, fournisseur/protocole, secret référencé par identifiant externe au dépôt, statut, règles de conservation et curseur de synchronisation. Aucun secret en clair dans PostgreSQL, logs, UI ou dépôt.
- **Message entrant normalisé** : ID fournisseur stable, boîte, expéditeur, destinataires, date, sujet, texte nettoyé, pièces référencées, empreinte/idempotency key, statut de traitement et trace d’erreur. Garder uniquement les données nécessaires selon la politique institutionnelle.
- **Contrat de qualification (avant routage)** : `INFORMATION_GENERALE` (FAQ exacte et publiée → proposition de réponse approuvée + lien public Mon Consulat, **aucun dossier**), `DEMANDE_ADMINISTRATIVE` (vérifier les prérequis → création contrôlée et idempotente de dossier `EMAIL` → routage), ou `AMBIGU/INDIVIDUEL/EXCEPTION` (file de qualification du secrétariat, avec assistance IA non décisionnaire). Une classification n’autorise à elle seule ni envoi ni création.
- **Contrat de réponse FAQ** : informations institutionnelles actives explicitement validées, correspondance exacte avec la démarche (première demande ≠ renouvellement), modèles d’e-mails approuvés, lien public sans installation/connexion pour l’information générale, traçabilité et prévention des doublons/boucles. En l’absence de source fiable, ne pas improviser.
- **Contrat de dossier** : seuls les courriers classés en demande administrative après contrôles peuvent créer un dossier avec canal `EMAIL`, identifiant source et pièces contrôlées ; appel au moteur de routage existant ; résultat traçable vers le bureau ou le secrétariat.

## Connexion et récupération

Commencer par un adaptateur derrière une interface `MailboxConnector` (lecture des nouveaux messages, acquittement/curseur, fermeture, erreurs typées). IMAP avec TLS et OAuth/mot de passe d’application géré par un coffre de secrets est une option ; une API fournisseur avec webhook signé peut être préférable si disponible. Ne choisir aucun fournisseur avant de connaître le mode réellement autorisé.

Le connecteur doit récupérer par lots bornés, valider taille/type des messages et pièces, rejeter les chemins/noms non sûrs, analyser le MIME sans exécuter de contenu, et déposer les pièces dans un stockage privé chiffré. Le texte HTML doit être converti en contenu sûr avant présentation. Les pièces ne doivent jamais être servies depuis `public/`.

## Dédoublonnage, transactions et reprise

Utiliser une clé stable `(mailbox_id, provider_message_id)` avec contrainte unique et une empreinte secondaire si le fournisseur ne garantit pas l’identifiant. Enregistrer un état durable `REÇU → PRÉQUALIFIÉ → FAQ_RÉPONDUE` **ou** `REÇU → PRÉQUALIFIÉ → DEMANDE_CRÉÉE → ROUTÉ` **ou** `REÇU → À_QUALIFIER_SECRÉTARIAT`, avec états d’erreur/reprise et traces. `FAQ_RÉPONDUE` exige un envoi effectif confirmé ; `FAQ_PROPOSÉE` doit être un état distinct tant qu’aucun envoi n’a eu lieu. Horodatages, tentatives et corrélation obligatoires. L’opération de prise en charge doit être idempotente : réessayer ne crée ni deuxième demande ni seconde copie de pièces.

Ne pas prétendre qu’une transaction PostgreSQL couvre une boîte distante ou le stockage de fichiers. Utiliser une boîte de réception persistante/outbox ou une orchestration à étapes compensables : réserver le message, écrire et vérifier les fichiers, créer demande/historique et liens en transaction, puis avancer le curseur/acquitter ; reprendre les états incomplets sans perdre la trace. La politique d’acquittement doit éviter la perte de messages.

## Sécurité, permissions et défaillances

- Une configuration de boîte est créée/activée par permission administrative organisationnelle ; elle est limitée à son tenant, organisation et point d’entrée.
- Les agents voient les demandes/pièces selon les permissions actuelles du workflow et du coffre, jamais selon leur seule connaissance d’un ID.
- Réduire les données de l’expéditeur exposées, protéger les secrets au repos, renouveler/révoquer les accès, expurger les journaux et conserver les traces d’administration.
- Quota, limitation, timeout, retry avec backoff et circuit d’arrêt protègent le système d’une boîte indisponible ou d’un message malformé. Le workflow manuel doit rester disponible lorsque l’ingestion échoue.
- Tracer l’ID de message et de demande sans consigner le corps, les pièces, secrets ou données excessives.

## Tests synthétiques

Prévoir un serveur IMAP/API simulé ou un adaptateur fake local, sans messagerie réelle : message nominal, pièce fictive, doublon, pièce trop volumineuse/interdite, message malformé, timeout, erreur de routage puis reprise, arrêt après chaque étape, permissions interorganisationnelles et nettoyage confirmé des lignes/fichiers synthétiques. Ces tests doivent utiliser des marqueurs dédiés dans `sateer_test` et un stockage temporaire isolé.

## Étapes proposées après validation

1. Confirmer protocole, coffre de secrets et règles de conservation avec l’administrateur de la boîte.
2. Définir le schéma versionné et le contrat de demande `EMAIL` ; faire revoir le modèle de menace.
3. Choisir une dépendance seulement après comparaison avec l’API officielle disponible et validation de maintenance/licence.
4. Implémenter un adaptateur local simulable, puis ses tests d’idempotence et reprise.
5. Raccorder le moteur de routage et l’interface de supervision des erreurs.
6. Valider sur environnement synthétique isolé avant toute autorisation distincte de connexion à une boîte réelle.

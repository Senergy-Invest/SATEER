# Préparation du scénario E2E P7

Ce document décrit un scénario à implémenter/exécuter uniquement après validation des prérequis. Aucun test P7 n’a été lancé pendant sa rédaction.

## Préconditions bloquantes

1. Utiliser exclusivement `sateer_test` et vérifier `current_database()` avant la première écriture.
2. Vérifier que les migrations 029–033 nécessaires existent déjà dans l’environnement ; ne pas les appliquer dans le cadre d’un test.
3. Utiliser une personne, un compte, un identifiant de démarche et un document entièrement synthétiques.
4. Confirmer la clé de test configurée sans afficher ni lire sa valeur ; le fichier doit être régulier, non symlink et de permissions privées, comme l’exige `identity-documents-crypto.js`.
5. Confirmer l’existence des répertoires de test privés requis par le code sous `~/.sateer-private/sateer_test`, avec modes restrictifs. Ne pas lire leur contenu. Pour une exécution reproductible, prévoir une racine de stockage temporaire dédiée au test ; cette évolution du code nécessite validation.
6. Configurer `SATEER_PUBLIC_ORIGIN` pour les routes protégées par contrôle d’origine. Ne jamais utiliser l’instance existante ; le serveur E2E doit écouter sur loopback et un port libre.
7. Vérifier rôles, permissions d’accès au dossier et capacité de routage du bureau dans la configuration synthétique.

Si l’un de ces prérequis n’est pas démontrable, ne pas lancer le scénario avec écriture.

## Parcours et assertions attendus

1. Créer un citoyen synthétique isolé et l’authentifier.
2. Charger un catalogue de démarche configuré pour l’organisation de test ; vérifier que l’absence d’appartenance ou le mauvais tenant donne un refus.
3. Ajouter un document fictif non sensible, au format et à la taille autorisés, au coffre chiffré ; vérifier que seul son propriétaire peut le lister/télécharger.
4. Préparer la démarche ; vérifier les pièces requises/manquantes.
5. Envoyer avec consentement explicite et sélectionner uniquement le document synthétique. Contrôler la demande, l’historique, la copie chiffrée et le lien de pièce jointe.
6. Vérifier qu’un agent habilité de l’unité destinataire peut lister et télécharger la pièce ; un agent d’une autre unité, un autre tenant et un utilisateur non authentifié doivent être refusés, y compris par accès direct avec les IDs connus.
7. Répondre, vérifier le suivi citoyen, puis terminer le scénario.

## Nettoyage et preuve

Le test doit garder un run ID unique et les IDs exacts de personne, compte, demande, fichiers coffre et copies de dossier. Les transactions SQL doivent être vérifiées indépendamment des requêtes HTTP et des écritures disque. En `finally`, révoquer les sessions, supprimer les lignes synthétiques dans l’ordre FK, supprimer les fichiers synthétiques uniquement par leurs IDs exacts, puis interroger une nouvelle connexion et vérifier zéro résidu pour chaque marqueur. Un échec de nettoyage doit faire échouer le test et afficher seulement les catégories/IDs de run non sensibles, jamais le contenu des documents.

Le test doit inclure le cas d’échec après écriture disque mais avant insertion SQL, et le cas d’échec après création du dossier. Aucun document personnel réel ne doit être importé ou consulté.

## État actuel

Les routes P7 et le chiffrement sont présents, mais les gardes de `pilot-procedures-http.js` et `private-files-http.js` désactivent ces capacités hors de `sateer_test`. Le code attend des répertoires privés et une clé déjà configurés. Le catalogue est stocké par organisation, mais sa configuration Bordeaux n’a pas été vérifiée. Aucun script E2E P7 ni validation de nettoyage des fichiers n’est actuellement attesté.

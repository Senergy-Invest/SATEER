# Tests et environnements

## Règles

- Aucun test PostgreSQL ne s’exécute sur `sateer`. Les tests avec écritures sont réservés à `sateer_test`.
- Avant une exécution, vérifier la base réellement connectée avant toute écriture, les migrations/prérequis, la portée synthétique des données, les ports utilisés et le nettoyage.
- Une garde sur le nom de base ne valide pas à elle seule l’hôte ou l’instance. L’environnement de test doit être explicitement isolé et autorisé.
- Un test présent dans le dépôt n’est pas réputé réussi tant que sa commande n’a pas été lancée et son résultat consigné.
- Vérifier les résidus par identifiants de test dédiés après le nettoyage. Les transactions PostgreSQL ne couvrent ni une requête HTTP utilisant une autre connexion, ni les fichiers écrits sur disque.
- Ne jamais lire de secrets, documents privés ou données réelles pour préparer les tests. Ne pas redémarrer les serveurs utilisés par les personnes.

## Commandes et effets connus

| Commande | Effet selon le script | État de la dernière mission |
|---|---|---|
| `npm test` | Contrôles statiques de sécurité et contexte ; pas d’accès PostgreSQL prévu. | Déjà réussi précédemment ; non relancé dans le lot courant. |
| `npm run test:p3.1` | Test API qui écrit des données synthétiques sur `sateer_test`, utilise un serveur HTTP local éphémère et nettoie/contrôle ses marqueurs. | Réussi précédemment ; non relancé. |
| `npm run test:workflow` | Crée cinq personnes synthétiques liées au Consulat configuré, comptes, sessions et une demande ; démarre `server.js` sur un port libre loopback ; nettoie dans une transaction. Garde `current_database() = sateer_test` avant les écritures. | Exécuté avec succès. Le script a confirmé la cible, les parcours API et le nettoyage des comptes/rattachements. Pas de contrôle indépendant des résidus après sortie. |
| `npm run test:integration` | Écrit sur `sateer_test`, mais sélectionne une personne préexistante sans compte, lui ajoute temporairement un rôle et un compte ; port HTTP fixe par défaut 3187. Nettoie le compte et l’affectation, mais conserve la personne préexistante. | Non exécuté : touche temporairement une identité déjà présente et le port par défaut peut être occupé. Correction minimale avant exécution : créer une personne synthétique propre, la supprimer, et utiliser un port libre explicitement choisi. |
| `npm run test:multitenant` | Crée deux tenants, organisations, personnes, rôles et comptes aléatoires sur `sateer_test`, puis sert l’API sur port loopback éphémère. Le nettoyage est séquentiel, sans transaction globale ni contrôle final des résidus. | Non exécuté : nettoyage non atomique ; un échec peut interrompre les suppressions suivantes. Correction minimale : nettoyage transactionnel, vérification des IDs/run marker résiduels et maintien d’une portée exclusivement synthétique. |

## Résultat du parcours workflow

La commande `npm run test:workflow` a été exécutée sur PostgreSQL `sateer_test`. Le script a confirmé avant écriture le nom de la base et les unités, permissions, capacités et allowlist. Il a ensuite réussi les appels HTTP synthétiques : création et lecture citoyen, refus citoyen sur l’inbox, réception et orientation par le secrétariat, refus du secrétariat à traiter l’unité, prise en charge et réponse par l’agent, refus de lecture du détail privé, dashboard opérationnel Vice-Consul et dashboard stratégique Consul avec refus croisés.

Le script a affiché la suppression réussie des demandes, notifications, comptes, sessions et rattachements synthétiques. Cette exécution valide ce circuit API avec la configuration rencontrée dans `sateer_test` ; elle ne valide ni l’interface navigateur, ni P7, ni les e-mails, ni la configuration d’un autre environnement.

## État des migrations

Cette note ne constate pas l’état courant des migrations en base. Les scripts ou parcours qui en dépendent doivent échouer sans écrire si leur schéma/configuration manque. Toute application de migration reste une opération distincte soumise à autorisation.

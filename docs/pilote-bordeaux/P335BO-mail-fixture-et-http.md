# SATEER Bordeaux — P3.3.5BO : courriers entrants simulés

## Portée

Cette campagne teste **les modules existants** de préqualification par intention, d'empreinte de dédoublonnage et de consultation HTTP du secrétariat. Elle ajoute deux fichiers de tests seulement et ne modifie pas le code métier. Elle ne connecte aucune boîte réelle, n'envoie aucun courrier, ne crée aucun dossier, n'effectue aucune publication et ne déclenche aucun routage automatique.

## Contrôles

- Lecture d'une source de courriers fictifs, accusés de lecture fictifs, reprise après interruption et dédoublonnage par boîte et Message-ID.
- Sujet `[DEMARCHE:PASSEPORT]` contenant une question : intention `INFORMATION` avant catégorie `PASSEPORT` ; aucun dossier créé.
- Intention `DEMANDE` et cas individuel `SECRETARIAT` distincts ; validation humaine obligatoire.
- Absence de sources fiables : aucun conseil automatique de pièces ; correspondance uniquement avec une fiche active et explicitement validée.
- Échec transitoire du connecteur fictif, tenant étranger, identifiant de message invalide : non-acquittement.
- Vraies routes Express du lecteur **synthétique**, servies sur `127.0.0.1` avec un port choisi par le système, données et permissions simulées, **sans aucune connexion SQL** ; refus anonyme, refus de la vue opérationnelle au Consul fictif, contrôle organisation/tenant et lecture seule.

## Limites explicites

Il s'agit d'un **adaptateur fictif dans le harnais**, pas d'un connecteur de production. Le test de redémarrage simule un état mémorisé dans la même exécution, **sans démontrer une persistance durable entre processus**. L'ingestion réelle exige d'abord la confirmation de l'administrateur du Consulat : fournisseur/protocole de messagerie, boîte autorisée, méthode d'authentification, gestion des pièces, conservation et permissions. Ne jamais injecter de secrets dans Git, des rapports ou des paramètres de ligne de commande.

La future capacité générique `email-ingestion` devra être isolée du Core et du moteur de workflow, avec contrats versionnés, persistance idempotente, outbox, curseur acquitté après stockage sûr, validation humaine et contrôle d'accès par organisation/tenant. Les courriers opérationnels du Consulat restent accessibles depuis sa messagerie existante : SATEER n'a pas vocation à la remplacer.

## Critère du commit

Les tests ci-dessus, les suites de non-régression du pilote et le contrôle Git/GitHub doivent réussir avant un commit des **deux fichiers de tests et de cette documentation seulement**, puis push non forcé et vérification du SHA distant. Aucun autre fichier modifié localement ne doit être indexé.

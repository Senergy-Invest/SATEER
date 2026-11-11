# P3.3.5BM — Diffusion ciblée : recette SQL non persistante

## Objectif
Exécuter la fonction métier `notifierAbonnesPublication` avec un vrai moteur PostgreSQL,
mais **sans écrire dans les tables persistantes** et sans envoyer de publication.

## Périmètre du contrôle
- Canaux PUBLIC et abonnements actifs
- Ciblage `TOUS`, `DEPARTEMENT`, `PROFIL`, `ASSOCIATION`, `ORGANISATIONS`
- Anti-doublon lors du rejeu
- Désabonnement, relation associative révoquée, canal désactivé
- Publication non validée et isolation de tenant

## Isolation
Le test impose :
- La base `sateer_test` sur l'instance PostgreSQL de recette identifiée par son `system_identifier`
- Une seule connexion PostgreSQL
- `BEGIN`, `SET LOCAL search_path = pg_temp, pg_catalog`
- Dix tables `CREATE TEMP TABLE ... ON COMMIT DROP` avec données entièrement fictives
- Appel de la vraie fonction JavaScript de notification avec le client transactionnel
- `ROLLBACK` systématique ; déconnexion = rollback par PostgreSQL si le processus s'interrompt

L'empreinte Git de `communication-notifications.js` est vérifiée. Un changement de la fonction
nécessite une nouvelle revue avant exécution. Ne jamais employer ce harnais avec une fonction
qui effectue des opérations sur une seconde connexion ou vise explicitement `public.<table>`.

## Limites
Ce test est plus probant qu'une inspection statique de SQL, mais il ne prouve **pas** :
- Le parcours HTTP authentifié de publication et de réception
- La livraison push, e-mail ou mobile d'une notification
- La capacité d'une association à accepter une invitation et relayer via les routes HTTP
- La sécurité effective des comptes de démonstration A01/A02/A04

La recette historique `scripts/association-relay-demo.js` ne doit pas être lancée automatiquement :
elle écrit dans `sateer_test` et son nettoyage est bloqué.

## Reproductibilité
`PGDATABASE=sateer_test PGHOST=::1 PGPORT=5432 SATEER_PROJECT_ROOT="$HOME/SATEER" node scripts/maintenance/test-bordeaux-notifications-pgtemp.js`

Suivant la règle du projet : test PASS -> commit local ciblé -> push non forcé -> SHA distant confirmé.

# Bordeaux P335BR — Correctifs de clôture : Vice-Consul et Secrétariat

## Décisions métier

- Le Vice-Consul dispose d'un lien visible vers le **catalogue**, après réponse positive de l'API d'administration. Aucun privilège n'est déduit de la présence du lien : l'API reste souveraine.
- Son accès aux courriers fictifs fonctionne même lorsque la page P2 a été ouverte sans paramètres URL, grâce au contexte organisation/tenant résolu et autorisé par le dashboard. Les contextes contradictoires restent refusés.
- Le Secrétariat a un compte de **recette** dédié et une page d'accueil propre, accessible depuis Mon SATEER après vérification serveur.
- La permission `VIEW_CONSULAR_MAIL_DEMO` donne uniquement la lecture/préqualification des messages `DEMO_SYNTHETIQUE` pour l'organisation 70 et le tenant Bordeaux. Le Vice-Consul garde son accès via `VIEW_OPERATIONAL_DASHBOARD`.
- Aucun nouveau connecteur, stockage d'e-mails réels, envoi SMTP, création de dossier ou publication n'est activé.

## Provisionnement

- Migration `database/044_bordeaux_mail_demo_permission.sql`, permission créée idempotemment.
- Compte fictif local `p6v.3b5ac5ab9db04657.secretariat@sateer.test`, secret choisi au clavier et hashé avec `auth-passwords.js`. **Jamais stocker de mot de passe en Git, JSON, rapport ou argument de processus.**
- Création atomique de personne, relation à l'organisation 70, rôle de recette à portée organisationnelle et attribution unique de permission ; vérification des droits avant `COMMIT`.
- Le script de provisionnement vérifie la base, l'instance et l'organisation de recette avant toute écriture ; refuse un compte ou rôle préexistant, pour éviter tout écrasement.
- Les changements SQL locaux ne sont pas des données à pousser sur GitHub ; seul le mécanisme et sa migration sont versionnés.

## Validation et limites

- Exécuter les tests de simulation des permissions et les suites de non-régression.
- Sur le serveur 3200 rechargé, tester la connexion du nouveau compte : `/api/auth/me` 200, `/api/bordeaux-email-demo/access` et `/messages` 200, dashboards opérationnel/stratégique et administration catalogue 403 ; puis déconnexion.
- Le titulaire doit ouvrir sa page et vérifier les scénarios visuellement. Compte/permissions de recette et interface : cela **ne constitue pas** une connexion à la boîte officielle.
- Les parcours Citoyen, Association, Agent et Consul ont été déclarés validés lors de P335BP ; ne pas les rejouer tant qu'aucune régression n'est détectée.

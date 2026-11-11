# P335BN — Recette HTTP associative sur transaction PostgreSQL isolée

## Portée

Le test `scripts/maintenance/test-bordeaux-association-http-rollback.js` démarre une instance Express sur `127.0.0.1` avec port alloué par l'OS, **sans redémarrer** les serveurs 3200/3300. Il passe par les **véritables routes HTTP**. Tous les comptes, rôles, organisations, canaux, publications, abonnements, notifications et relais synthétiques sont créés dans une transaction PostgreSQL unique épinglée au client du harnais. Les éventuelles transactions internes des routes deviennent des SAVEPOINTS ; `ROLLBACK` est obligatoire avant le succès. Un second client contrôle l'absence de résidus.

## Tests

- Connexion de trois comptes fictifs : Vice-Consul, responsable associatif, membre sans droit de relais ; refus des accès anonymes.
- Invitation, acceptation et connexion d'une association fictive ; abonnement de deux personnes.
- Publication ciblée `ASSOCIATION`, **2 notifications et aucune duplication**.
- Lecture et attribution de l'auteur original, relais interdit par défaut, autorisation explicite, refus du membre non habilité.
- Relais autorisé et visible, contenu officiel inchangé, doublon refusé.
- Isolation tenant et organisation ; révocation puis disparition du relais et impossibilité de relais ultérieur.
- ROLLBACK ; contrôle des tenants, organisations, personnes, comptes et sessions résiduels depuis une nouvelle connexion.

## Garde-fous

Base et instance PostgreSQL connues et explicitement vérifiées (`sateer_test`, `::1:5432`, system_identifier autorisé). Tenant aléatoire spécifique au test : aucune écriture ciblant l'organisation Bordeaux #70. En échec, aucun commit Git ni push n'est autorisé. Le harnais de test couvre les opérations SQL qui passent par le module `database.js` partagé de SATEER. Toute future nouvelle connexion applicative indépendante devra être détectée et faire l'objet d'une adaptation avant de réutiliser ce harnais.

## Exclusion des courriers entrants

Les tests locaux du module de simulation e-mail sont exécutés dans la campagne, mais **aucune boîte e-mail réelle n'est connectée**. Après ce lot : valider les contrats d'ingestion avec un adaptateur local simulé, puis obtenir l'autorisation de connexion à la messagerie officielle sans la remplacer.

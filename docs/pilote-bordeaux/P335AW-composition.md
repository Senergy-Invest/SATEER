# SATEER Bordeaux — composition du pilote (P3.3.5AW)

## Responsabilités

- `server.js` : bootstrap Express et point d'entrée historique ; il installe les capacités par le registre de composition.
- `pilot-module-registry.js` : **adaptateur de composition uniquement**. Il regroupe les branchements P6/P7, e-mail de démonstration et administration des agents sans requête SQL, permission métier ou logique d'activation générique.
- `pilot-procedures-recette-http.js` : routes isolées de démonstration de catalogue (seulement `sateer_test`, instance locale et drapeau explicite), authentification de session + vérification côté route du rôle et droit Vice-Consul sur l'organisation de recette.
- `pilot-procedures-recette-core.js` : machine d'états en mémoire, non persistante, des opérations `VALIDER`, `PUBLIER`, `RETIRER` simulées. La publication institutionnelle réelle n'est pas invoquée.
- `public/sateer-bordeaux-recette-nav.js` : liens d'interface de la seule recette Bordeaux. **Ce n'est pas un contrôle d'autorisation**.

## Configuration et limites

La simulation reste **désactivée par défaut**. Sa composition n'est possible que si `PGDATABASE=sateer_test` et `SATEER_ENABLE_BORDEAUX_PROCEDURE_RECETTE=1`. Le routeur applique de surcroît les restrictions de requête locale et d'organisation/tenant. Ne jamais copier ce drapeau dans une instance de production.

Il s'agit d'une isolation **fonctionnelle**, pas d'un microservice ou d'une isolation d'infrastructure : les routes partagent le processus Node et l'authentification de l'instance de recette. Les droits sont toujours contrôlés côté API. Le catalogue officiel et les notifications restent indépendants de la machine d'états temporaire.

## Tests reproductibles

Depuis la racine du dépôt :

```bash
node scripts/test-pilot-module-registry.js
node --test scripts/maintenance/test-bordeaux-procedures-recette.js scripts/maintenance/test-bordeaux-recette-navigation.js
node --check server.js
node --check pilot-module-registry.js
```

Le test du registre couvre l'ordre historique des composants, le garde du drapeau d'activation, l'absence d'activation sur une autre base et le branchement de la session obligatoire. Les tests unitaires de recette valident les transitions temporaires, pas les sessions réelles de navigateur. Ces dernières nécessitent une recette HTTP distincte avec les rôles autorisés/non autorisés.

## Contraintes de maintenance

Conserver les contrats et les noms explicites. Ne pas ajouter de SQL ou de décision métier dans le registre. Éviter de commiter globalement `server.js`, car il peut contenir des évolutions distinctes (expériences, workflow). Modifier et tester chaque domaine dans son propre lot ; ne pas faire dépendre la maintenance d'une IA.

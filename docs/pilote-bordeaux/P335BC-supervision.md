# Bordeaux — Supervision et registre (P3.3.5BC)

## Responsabilités

- `pilot-procedures-http.js` : endpoints GET `/api/pilot-procedures/supervision/*`.
- `public/registre-demandes-vice-consul.html`, `sateer-vice-cases.js` : liste, recherche, pagination et détail en lecture seule.
- `public/sateer-vice-layout.js` : synthèse du tableau de bord, statut des bureaux, urgences, navigation.
- `public/sateer-p2.js` : événement de rafraîchissement du tableau de bord.
- `public/dashboard-vice-consul.html` : chargement des feuilles de style et du script de synthèse.

## Frontières

- Authentification sur les routes serveur, puis permission `VIEW_OPERATIONAL_DASHBOARD` à la portée `ORGANISATION`.
- Chaque requête protège `organisation_id` **et** `tenant`. Ni le numéro d'unité ni l'identifiant du dossier ne permettent un accès hors périmètre.
- Consultation uniquement : aucune route mutatrice dans `/supervision/*`; pas de lecture de pièces privées.
- Les anciennes données de dossiers ne constituent pas une preuve de traitement réel multi-profils.
- Le journal des agents `journal-agent` et les opérations documentaires sont exclus de ce lot.

## Tests et limites

```bash
node --test scripts/maintenance/test-bordeaux-supervision.js
node --test scripts/maintenance/test-bordeaux-catalogue-rbac.js
```

Les tests de contrat fonctionnent sans PostgreSQL. Les contrôles anonymes ne démontrent pas la matrice HTTP authentifiée. Avant démonstration, redémarrer de manière maîtrisée l'instance 3200 avec sa configuration d'origine et vérifier A01 autorisé, agent non habilité refusé, Consul selon permissions explicites, autre tenant/organisation refusé ; ne pas tester avec de vraies données personnelles non autorisées.

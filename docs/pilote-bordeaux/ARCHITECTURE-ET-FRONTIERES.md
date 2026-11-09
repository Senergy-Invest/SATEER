# Architecture — doctrine et frontières à auditer

**Doctrine souhaitée**, ne pas confondre cette cible avec une architecture entièrement existante.

## Couches logiques

1. **Core générique** : identités, organisations, tenants/territoires, relations, permissions, données canoniques, audit.
2. **Capacités transversales** : communication/publications, ingestion d'e-mails, dossiers/workflows, documents, notifications, reporting, IA en tant que service. Pas de duplication métier par expérience.
3. **Moteurs isolables** : spécialisés, intégrés par API/événements versionnés ; pas de dépendance SQL croisée.
4. **Expériences** : façades configurables comme Mon Consulat et plus tard Ambassade / Diaspora. Une expérience n'est ni un tenant ni une base isolée.

Monolithe modulaire acceptable ; ne pas imposer 100 microservices. Conserver des contrats explicites pour extraction ultérieure.

## Points d'entrée retrouvés dans les archives fournies — à confirmer sur le dépôt actuel

| Fichier existant | Rôle observé / à valider |
|---|---|
| `server.js` | Bootstrap HTTP global ; vérifier son rôle exact et limiter l'accumulation des routes directes |
| `pilot-module-registry.js` | Adaptateur d'enregistrement P6/P7, **pas** un moteur d'expériences ni une isolation runtime (documenté dans le fichier) |
| `auth-authorization.js` | Contrôle générique de permission selon organisation/unité ; toujours associer identité de session, tenant et ressource |
| `pilot-procedures-http.js` | Catalogue, dossiers, journal et accès de supervision : identifier frontières à découpler progressivement |
| `pilot-routing-rules.js` | Règles métier de routage ; séparer intention e-mail et destination administrative |
| `bordeaux-email-demo-http.js` | Interface HTTP courrier de démonstration ; ne pas confondre avec le futur connecteur réel |
| `sateer-mail-guidance-core.js` | Recherche de fiches guidant les brouillons e-mail ; vérifier les garanties de publication |
| `public/consulat.js` et `public/p7-admin.js` | Interfaces citoyenne et administration des démarches ; ne doivent pas décider seules des permissions |
| `docs/architecture/email-ingestion.md` | Proposition existante d'adaptateur générique (conception seulement, non connectée) |

## Critères de séparation à vérifier

- Une seule source des permissions. **Refus serveur** pour tout accès sans organisation/tenant/ressource autorisés.
- Une seule source officielle pour une fiche de démarche validée et publiée, avec versions et auteur habilité ; mêmes données pour Mon Consulat et les réponses e-mail.
- Ingestion e-mail indépendante du prestataire ; aucune boîte réelle ou secret codé en dur ; idempotence de bout en bout.
- Un statut administratif (`NOUVELLE`, `EN_COURS`, `TRAITEE`) ne se substitue pas au statut documentaire (`PRET_A_RETIRER`, `REMIS`).
- Interface d'agent, tableau de supervision et expérience citoyenne consomment des contrats documentés, sans SQL dans le navigateur.
- Les données de recette et le rôle de publication de recette sont identifiables et révocables.

## Stratégie d'évolution

Avant extraction de modules : (a) tests d'isolation et de contrats, (b) interfaces explicites, (c) propriétaire des données défini, (d) métriques et migrations, (e) décision architecturale écrite. Ne jamais déplacer les fichiers uniquement pour embellir les dossiers.

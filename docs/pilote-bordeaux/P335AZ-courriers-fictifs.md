# Bordeaux — Qualification des courriers fictifs (P3.3.5AZ)

## Objet et périmètre

La page `public/email-secretariat-demo.html` présente un poste de qualification **uniquement pour des courriers synthétiques**. Il ne s'agit ni d'un connecteur IMAP/Graph/Gmail, ni d'une boîte institutionnelle, ni d'une IA opérationnelle. Le programme n'envoie aucun courriel, ne crée aucun dossier, et ne déclenche aucune orientation en bureau.

## Responsabilités des fichiers

- `public/sateer-mail-intent-core.js` : classification déterministe, réutilisable en Node et dans le navigateur ; ses résultats sont des **suggestions**, jamais des décisions exécutables.
- `sateer-mail-guidance-core.js` : sélection prudente d'une fiche de démarche active, explicitement validée et non ambiguë ; génération d'un **brouillon à valider par un humain**, sans action de sortie.
- `bordeaux-email-demo-http.js` : routes authentifiées en lecture seule pour les courriers **DEMO_SYNTHETIQUE**, la qualification et le conseil ; contexte du pilote Bordeaux.
- `public/email-secretariat-demo.js`, `.html`, `public/sateer-mail-desk.css` : présentation, requêtes de consultation et avertissements de recette. Aucun choix de l'interface n'est une autorisation serveur.

## Contrats et protections

L'intention proposée est `INFORMATION`, `DEMANDE` ou `SECRETARIAT`. Toutes les qualifications exposent `envoiAutorise=false`, `creationDossierAutorisee=false` et `routageAutomatiqueAutorise=false`. Les brouillons exigent une fiche active, validée, une catégorie compatible, une correspondance unique et une liste de pièces exhaustive. En cas d'ambiguïté ou d'échec, le système n'invente aucune condition officielle.

Le routeur utilise l'authentification de SATEER et les contrôles déjà présents dans sa version antérieure. Ces garanties doivent être vérifiées par tests HTTP authentifiés avant tout usage avec des messages externes. **Une vraie boîte consulaire et l'autorisation d'envoyer des réponses n'ont pas été raccordées.**

## Reproduction des tests

```bash
node --test scripts/maintenance/test-bordeaux-courriers-recette.js
node --check bordeaux-email-demo-http.js
node --check public/email-secretariat-demo.js
```

Le test ne nécessite ni PostgreSQL ni serveur HTTP. Le contrôle HTTP anonyme ne remplace pas les tests d'autorisation avec session et organisation. Ne jamais utiliser un courrier réel ou un secret de boîte pour cette recette.

## Évolutions futures (hors lot)

Connexion d'une boîte officielle uniquement avec autorisation explicite, connecteur isolé, journal d'audit, permissions de lecture/réponse, règles de conservation, consentement et tests multi-organisations. Ne pas implémenter ces points dans le socle de démonstration actuel.

# Contrats métier et contrôles de non-régression — Bordeaux

**Document de référence pour concevoir les tests ; statut d'exécution à renseigner après tests réels.**

## Règles essentielles

| Contrat | Condition de réussite |
|---|---|
| Publication officielle | Seul `MANAGE_PUBLICATIONS` autorise validation/publication ; un brouillon enregistré n'est pas officiel |
| Gestion des brouillons | `MANAGE_PROCEDURES` peut créer/modifier des brouillons sans obtenir de droit de publication |
| Lecture du catalogue | Lecture et écriture vérifiées séparément ; organisation/tenant toujours présents |
| Recette | Pas d'attestation prétendant vérification réelle des pièces fictives ; publier uniquement dans un contexte de recette explicite |
| Dossier reçu | La règle de routage peut affecter un bureau tout en laissant le statut `NOUVELLE` tant que l'agent n'a pas pris en charge |
| Simple réponse agent | Ne clôture pas le dossier ; notification et historique visibles |
| Document prêt | Dossier encore ouvert ; statut documentaire distinct ; ne pas annoncer de remise |
| Document remis | Clôture uniquement après confirmation autorisée, auditée |
| Lecture journal | Agent du bureau autorisé ; citoyen/autre organisation/autre bureau refusé ; lecture après clôture |
| Supervision | Vice-Consul : registre côté serveur paginé ; autre organisation/tenant refusé |
| Question par e-mail | Identifier **intention avant thème** ; une FAQ ne crée ni dossier ni routage automatique |
| Réponse e-mail validée | Uniquement fiche exacte, active, explicitement validée et publiée ; ne pas inventer tarifs/pièces/horaires |
| E-mail réel | Autorisation spécifique de la boîte, idempotence, journalisation, zéro boucle d'auto-réponse, récupération en cas d'échec |

## Batterie minimale à rendre reproductible

- [ ] Authentification et contextes organisation/tenant ; refus croisés (citoyen/agent/superviseur).
- [ ] Publication ciblée, abonnements, association relai autorisée et refus non autorisé.
- [ ] Dossiers `#132` (historique), `#133` (urgence), `#137` (à prendre) dans `sateer_test` avec contrôles non destructifs ; ne pas les utiliser en tests qui modifient l'état.
- [ ] Flux synthétique sur **nouveaux** dossiers jetables : création → orientation → prise en charge → information → prêt → remis, et contrôle chronologie.
- [ ] Catalogue : brouillon / validation de recette séparée / publication de recette / révision / dépublication / refus sans permission.
- [ ] Six cas de courrier fictif : question pièces, dépôt, suivi individuel, ambigu, objet normalisé contenant FAQ, carte consulaire à préparer.
- [ ] Sécurité web : contenus de courriers échappés (XSS), pas d'API permissive, pagination en base, filtres, pas d'IDOR.
- [ ] Qualité : `node --check` ou TypeScript, tests unitaires, test HTTP authentifié, tests de migration sur base jetable, revue de diff Git.

## Exécution

À chaque série, conserver : date, commande (sans secret), base et branche, nombre de tests, PASS/FAIL, différences observées, commit ou révision. Ne pas qualifier de « test réel » une simulation isolée.

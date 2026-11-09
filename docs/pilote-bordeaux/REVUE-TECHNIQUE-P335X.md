# Revue technique P3.3.5X — pilote Consulat Bordeaux

**Date d'observation : 9 novembre 2026.** Base examinée : archive `SATEER-P3.3.5X-revue-code-20261109-154110-164771.zip`, branche déclarée `work/bordeaux-pilot`, `HEAD 0c0245d27c64`. La revue est **hors ligne** ; pas d'accès au dépôt actuel ni aux comptes ni à la base lors de l'analyse. Les affirmations ci-dessous distinguent constat du code et preuve de recette transmise.

## Périmètre et état Git

- 15 fichiers suivis modifiés signalés, dont 14 patches exportés. La modification de `AGENTS.md` est **hors export** et doit être examinée par un mainteneur ; ne pas la committer ou l'écraser par défaut.
- 47 nouveaux fichiers textuels exportés et 288 entrées écartées dans le ZIP, notamment les sauvegardes. Les nombres sont ceux de l'export, pas un comptage certifié du dépôt courant.
- Les 14 modifications suivies mélangent **workflow / DB**, **supervision / interface**, **courrier / FAQ**, **catalogue / habilitations**, **composition serveur** et **tests**. Elles ne constituent pas un seul commit cohérent.
- Le `.gitignore` exporté ignore `node_modules`, `.env`, logs et build mais **pas** `.sateer-backups/`, PID ou certaines sauvegardes locales. Cette consolidation ne supprime rien ni ne retire quoi que ce soit de l'index ; l'audit antérieur indiquait zéro chemin `.sateer-backups` déjà suivi.

## Ce que le code établit réellement

| Zone | Sources identifiées | Observation / risque maintenance | Décision |
|---|---|---|---|
| Workflow documentaire | `server.js`, `services-database.js`, `public/unit-workspace.js` | `MESSAGE` laisse ouvert, `DOCUMENT_PRET` marque prêt, `DOCUMENT_REMIS` clôture ; trois fichiers interdépendants. | Tests HTTP et SQL synthétiques obligatoires avant commit ; ne pas déplacer à l'aveugle. |
| Dossiers et journaux | `pilot-procedures-http.js`, `public/sateer-agent-journal.css`, `public/sateer-document-status.js` | Journal Agent et supervision lisibles ; autorisation des dossiers et du tenant dans les routes. | Conserver les tests d'isolation et d'accès à un dossier clôturé. |
| Pilotage | `pilot-procedures-http.js`, `public/sateer-vice-layout.js`, `public/sateer-vice-cases.js` | Synthèse limitée, registre 20/page via `LIMIT/OFFSET`; ancienne DOM en partie conservée mais masquée pour compatibilité. | Ne pas appeler cela un moteur de reporting générique ; documenter les API, mesurer la charge. |
| Courrier | `bordeaux-email-demo-http.js`, `public/sateer-mail-intent-core.js`, `sateer-mail-guidance-core.js` | Classification par intention avant thème en simulation. Import d'une logique métier côté serveur depuis `public/`, frontière peu claire. | Définir contrat partagé stable avant extraction ; ne pas activer d'envoi. |
| Catalogue | `pilot-procedures-http.js`, `public/p7-admin.js` | Brouillon/validation/publication distincts, `MANAGE_PROCEDURES` vs `MANAGE_PUBLICATIONS`. | Migrer le schéma dans des fichiers versionnés, ne jamais autoriser fausse validation institutionnelle. |
| Registre des expériences | `organisation-experience-*.js`, migrations `040`, `041` | Modules nouveaux et API derrière un drapeau de recette. Ces migrations ne sont pas celles du catalogue. | Documenter leur état d'exécution, ne pas les amalgamer à Bordeaux. |

## Corrections prioritaires

**P0 — Reproductibilité schéma :** les colonnes `validation_explicite`, `date_validation`, `date_publication` ont été ajoutées par un kit temporaire P3.3.5Q, absent des migrations versionnées exportées. Une migration documentaire `database/042_...sql` reprend la DDL observée ; **elle n'est pas exécutée par ce lot** et nécessite la revue du dispositif de migration principal.

**P0 — Reproductibilité permissions :** `MANAGE_PROCEDURES` a été ajouté/attribué par script de recette P3.3.5T, tandis que `MANAGE_PUBLICATIONS` a été attribué par P3.3.5V à l'identité synthétique. Une migration `043_...sql` ne crée que la permission générique, **aucun rôle ni attribution**. Les habilitations de recette doivent rester explicites et traçables, jamais reprises automatiquement sur un autre compte ou environnement.

**P0 — Contrat e-mail :** `docs/architecture/email-ingestion.md` prévoyait initialement « e-mail accepté → demande créée », en contradiction avec la règle métier actée. Corriger cette documentation en « classifier l'intention → FAQ, dossier ou secrétariat », puis concevoir des tests de non-création de dossier pour les simples questions.

**P1 — Couplage :** `server.js` et `services-database.js` restent volumineux, et `pilot-procedures-http.js` regroupe plusieurs responsabilités. Une extraction progressive en modules avec contrats versionnés est préférable à une réécriture globale non testée.

**P1 — CSS/DOM :** le pilotage masque encore des composants historiques (`sateer-vice-layout.js`) pour compatibilité. Mettre en place un test de rendu/accessibilité, puis supprimer progressivement les doubles chargements ; ne pas supprimer brutalement les ancres consommées par des scripts.

**P1 — Recherche à grande échelle :** `LIMIT/OFFSET 20` borne le rendu mais ne certifie pas les performances à 1 000/100 000 dossiers. Vérifier index, plan de requête, tri stable et concurrence avant promesse de charge.

## Commits recommandés (après test réel)

1. **Hygiène et architecture** : `.gitignore`, documentation de frontière, contrats et point de reprise, plus migrations **revues**. N'ajouter que les chemins explicitement examinés.
2. **Workflow / journal** : code serveur, persistance, UI et tests du cycle complet.
3. **Supervision** : API, registre paginé, écrans et tests de permissions.
4. **Courriers simulés** : qualification, source de vérité, interface de simulation ; pas d'e-mails réels.
5. **Catalogue / habilitations** : routes, UI, migrations validées, tests de non-publication et isolation.

Les groupes ont des dépendances ; les commits doivent être réalisés dans un ordre où chaque état reste testable. **Ne pas utiliser `git add .`**. `AGENTS.md` reste à revoir séparément. Tout échec de tests doit bloquer le commit fonctionnel correspondant.

## Point de reprise obligatoire

Après consolidation et commits, revenir à la fiche **`[DEMO BORDEAUX] Renouvellement de passeport — test fictif`**, encore en **BROUILLON** selon la dernière recette : mode de validation **RECETTE** explicite, publication strictement fictive, brouillon de réponse e-mail contrôlé, lien public vers Mon Consulat. Ne jamais cocher une attestation d'approbation réelle pour un scénario fictif.

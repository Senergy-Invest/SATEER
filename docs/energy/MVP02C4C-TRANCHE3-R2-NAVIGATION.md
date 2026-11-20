# C4C3 R2 — Correction navigation retour C1 / C2

**Motif utilisateur :** Depuis la file C4C3, un lien mène à C1 ou C2 mais leur bouton « Retour » pointe vers leur parent historique (par exemple le tableau de responsabilités) et non vers C4C3.

**Périmètre ciblé :** Aucun nouveau droit, aucune modification SQL/Core, aucune migration. Ajout d'un contrat de navigation uniquement pour les liens **ouverts depuis C4C3** : `from=c4c3` + `retourC4C3=<chemin interne encodé>`. L'URL de retour doit être strictement `/energie-actions.html`, du même tenant. Les champs `site/grantId/statut/suivi/offset` sont validés et la sélection de site doit à nouveau figurer dans la liste autorisée renvoyée par C4C3 ; aucune permission tirée de l'URL.

**Sources** : `public/energie-retour-c4c3.js` (domaine navigateur/Node sans dépendance), `public/energie-actions.{html,js}`, et modifications limitées de `public/energie-{collecte,responsabilites}.{html,js}`. Ces quatre derniers fichiers sont générés depuis les objets du SHA Git C4C2 figé par `PREPARER-C1C2-DEPUIS-GIT.py` pour éviter des copies périmées. Tous les autres parcours C1/C2 conservent leurs retours historiques. Les tests vérifient l'interdiction des redirections externes et entre tenants.

**Recette obligatoire** : depuis C4C3, cliquer `Ouvrir C2`, puis « ← Suivi des contributions C4C » ; vérifier retour au même site, statut et page. Vérifier aussi `Organiser C1` si une proposition réellement sans relecteur est disponible. Vérifier une ouverture directe de C1/C2 (sans `from=c4c3`) : retour habituel inchangé. Tester connexion, navigation privée, compte collaborateur sans fuite de périmètre. Aucune écriture métier depuis C4C3.

**Git** : reprendre sur `work/energy-mvp01` au SHA `0d4b56bbf58f0f13953d500e2f502c1b1c9669f4`. Accepter les sources C4C3 déjà installées par le premier paquet uniquement si leurs hashes correspondent exactement ; conserver REV2 non suivi, hors commit. Enregistrer la recette et demander une approbation explicite avant tout commit/push. Comparer SHA local et GitHub distant, sans force-push.

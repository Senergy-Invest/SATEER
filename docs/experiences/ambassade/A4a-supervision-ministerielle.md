# Ambassade A4a — Premier contrat du tableau de bord ministériel mondial

Base Git : `work/ambassade-mvp` au SHA `e8f57f777aef3906c151dd5664d5d23fa3e3b50c`.

Ce lot pose une **projection métier sans accès aux bases**. Le Ministère pourra ultérieurement voir les ambassades sénégalaises, leurs consulats rattachés, les postes encore non déployés et les indicateurs déclarés par les postes connectés. Pour la France ou un autre pays, aucune arborescence n'est déduite du seul pays : chaque lien doit être validé et fourni par l'annuaire officiel futur.

Le test couvre plusieurs tenants avec collisions d'identifiants locaux, des liaisons approuvées, des relations révoquées, des postes sans rapport, des rapports partiels et l'exclusion des champs individuels.

**A4a n'est pas un dashboard utilisable :** il ne crée pas d'écran, de rôle ministériel ni d'API. Aucun courrier, dossier ou flux réel ne remonte au Ministère. Le prochain lot doit traiter la provenance de l'annuaire et les autorisations avant d'ajouter une interface.


const {
    organisations,
    personnes,
    relationsPersonneOrganisation,
    dossiers,
    historiqueDossiers,
    demandesPieces,
    documents,
    permissionsParRole
} = require("./data");

const {
    trouverPersonneParId,
    trouverOrganisationParId,
    trouverAgentsParOrganisation,
    aPermission,
    changerStatutDossier,
    demanderPiece,
    fournirPiece,
    afficherHistoriqueDossier,
    afficherDetailDossier,
    creerDossier,
    listerExperiencesPersonne,
    afficherMonConsulat,
    publierInformation,
    trouverPersonnesParCompetence,
    afficherTableauBordDiaspora,
    listerAssociationsPersonne,
    envoyerRequete,
    afficherInboxOrganisation,
    prendreEnChargeRequete,
    repondreRequete,
    afficherMesRequetes,
    afficherNotificationsPersonne,
    marquerNotificationCommeLue,
    ouvrirExperience,
    afficherMonAmbassade,
    afficherMonProfilDiaspora,
    modifierAutorisationPartageProfil,
    afficherProfilsDiasporaAutorisesPourConsulat,
    afficherTableauBordDiasporaConsulat,
    rechercherProfilsDiasporaParCompetence,
    creerEvenement,
    afficherAgendaDiaspora,
    afficherFilDiasporaParCategorie,
    afficherEspaceConsulat
} = require("./services");









// Afficher toutes les relations
for (const relation of relationsPersonneOrganisation) {

    const personne = trouverPersonneParId(
        relation.personneId
    );

    const organisation = trouverOrganisationParId(
        relation.organisationId
    );

    console.log(
        personne.prenom +
        " " +
        personne.nom +
        " est " +
        relation.type +
        " de " +
        organisation.nom
    );
}


// Chercher tous les agents



function afficherRelationsOrganisation(organisationId) {

    const organisation = trouverOrganisationParId(
        organisationId
    );

    console.log("");
    console.log("Organisation : " + organisation.nom);

    const relationsOrganisation = relationsPersonneOrganisation.filter(
        relation => relation.organisationId === organisationId
    );

    for (const relation of relationsOrganisation) {

        const personne = trouverPersonneParId(
            relation.personneId
        );

        console.log(
            "- " +
            personne.prenom +
            " " +
            personne.nom +
            " : " +
            relation.type
        );
    }
}

afficherRelationsOrganisation(1);
afficherRelationsOrganisation(2);

function afficherDossier(dossierId) {

    const dossier = dossiers.find(
        dossier => dossier.id === dossierId
    );

   

    const personneDossier = trouverPersonneParId(
        dossier.personneId
    );

    const organisationDossier = trouverOrganisationParId(
        dossier.organisationId
    );

    console.log("");
    console.log("Dossier : " + dossier.id);

    console.log(
        "Usager : " +
        personneDossier.prenom +
        " " +
        personneDossier.nom
    );

    console.log(
        "Organisation : " +
        organisationDossier.nom
    );

    console.log(
        "Type : " +
        dossier.type
    );

    console.log(
        "Statut : " +
        dossier.statut
    );
}

function afficherDossiersOrganisationParStatut(organisationId, statut) {

    const organisation = trouverOrganisationParId(
        organisationId
    );

    const dossiersFiltres = dossiers.filter(
        dossier =>
            dossier.organisationId === organisationId &&
            dossier.statut === statut
    );

    console.log("");
    console.log(
        "Dossiers " +
        statut +
        " de : " +
        organisation.nom
    );

    for (const dossier of dossiersFiltres) {

        const personne = trouverPersonneParId(
            dossier.personneId
        );

        console.log(
            "- Dossier " +
            dossier.id +
            " | " +
            personne.prenom +
            " " +
            personne.nom +
            " | " +
            dossier.type +
            " | " +
            dossier.statut
        );
    }
}

afficherDossiersOrganisationParStatut(1, "SOUMIS");



changerStatutDossier(1, "SOUMIS", 1);
changerStatutDossier(1, "EN_REVISION", 3);
changerStatutDossier(1, "TERMINE", 3);
changerStatutDossier(2, "EN_REVISION", 4);

console.log("");
console.log("Historique des dossiers :");

console.log(historiqueDossiers);



afficherHistoriqueDossier(1);
changerStatutDossier(2, "EN_REVISION", 3);
afficherHistoriqueDossier(2);

console.log("");
console.log("=== TEST MAMADOU SUR LE DOSSIER DE FATOU ===");

changerStatutDossier(1, "SOUMIS", 2);

console.log("=== FIN DU TEST ===");

console.log("");
console.log("=== TEST DU MOTEUR DE PERMISSIONS ===");

console.log(
    "Fatou peut gérer les agents : " +
    aPermission(1, "GERER_AGENTS", 1)
);

console.log(
    "Awa peut traiter les dossiers : " +
    aPermission(3, "TRAITER_DOSSIER", 1)
);

console.log(
    "Aminata peut gérer les agents : " +
    aPermission(5, "GERER_AGENTS", 1)
);

console.log(
    "Ibrahima peut traiter les dossiers du Consulat : " +
    aPermission(4, "TRAITER_DOSSIER", 1)
);

demanderPiece(
    2,
    "Justificatif de domicile",
    3
);

afficherHistoriqueDossier(2);


console.log(demandesPieces);

fournirPiece(
    1,
    2,
    "justificatif_mamadou.pdf"
);

console.log("");
console.log("Documents :");

console.log(documents);
console.log(demandesPieces);

afficherHistoriqueDossier(2);
afficherDetailDossier(2);
creerDossier(
    1,
    1,
    "DEMANDE_PASSEPORT"
);

console.log(dossiers);
listerExperiencesPersonne(1);
afficherMonConsulat(1);

publierInformation(
    1,
    "Permanence consulaire exceptionnelle",
    "Le Consulat organise une permanence exceptionnelle samedi matin.",
    "DEPARTEMENT",
    "Gironde",
    "DEMARCHE",
    "IMPORTANTE",
    3
);

afficherMonConsulat(1);
afficherMonConsulat(2);


publierInformation(
    1,
    "Rencontre des étudiants sénégalais",
    "Le Consulat organise une rencontre dédiée aux étudiants sénégalais.",
    "PROFIL",
    "ETUDIANT",
    "EVENEMENT",
    "NORMALE",
    3
);

afficherMonConsulat(1);
afficherMonConsulat(2);

console.log("");
console.log("===== RECHERCHE PAR COMPETENCE =====");

const personnesInformatique =
    trouverPersonnesParCompetence(
        "INFORMATIQUE"
    );

for (const personne of personnesInformatique) {

    console.log(
        personne.prenom +
        " " +
        personne.nom
    );
}


afficherTableauBordDiaspora();

listerAssociationsPersonne(1);


publierInformation(
    1,
    "Réunion avec l'association des étudiants",
    "Une réunion est organisée avec les membres de l'association des étudiants sénégalais de Bordeaux.",
    "ASSOCIATION",
    4,
    "EVENEMENT",
    "NORMALE",
    3
);

afficherMonConsulat(1);
afficherMonConsulat(2);


envoyerRequete(
    1,
    1,
    "PASSEPORT",
    "Renouvellement de passeport",
    "Bonjour, je souhaite savoir quelles sont les pièces nécessaires pour renouveler mon passeport."
);


afficherInboxOrganisation(1);


prendreEnChargeRequete(
    1,
    3
);


afficherInboxOrganisation(1);


repondreRequete(
    1,
    3,
    "Bonjour Fatou, pour le renouvellement de votre passeport, veuillez consulter la liste officielle des pièces demandées dans la rubrique Services officiels."
);


afficherInboxOrganisation(1);

afficherMesRequetes(1);

afficherNotificationsPersonne(1);

listerExperiencesPersonne(1);


marquerNotificationCommeLue(
    1,
    1
);


afficherNotificationsPersonne(1);

listerExperiencesPersonne(1);


ouvrirExperience(
    1,
    "MON_CONSULAT"
);


ouvrirExperience(
    1,
    "MON_AMBASSADE"
);


afficherMonProfilDiaspora(1);


modifierAutorisationPartageProfil(
    1,
    "CONSULAT",
    true
);


afficherMonProfilDiaspora(1);


afficherProfilsDiasporaAutorisesPourConsulat(
    1
);


afficherTableauBordDiasporaConsulat(
    1
);


rechercherProfilsDiasporaParCompetence(
    "DATA"
);


console.log("");
console.log("===== TEST NOTIFICATION EVENEMENT =====");


creerEvenement(
    1,
    "Grande rencontre de la diaspora sénégalaise",
    "Événement ouvert à toute la diaspora.",
    "Bordeaux",
    "05/12/2026",
    "TOUS",
    null,
    3
);


afficherNotificationsPersonne(
    1
);


publierInformation(
    2,
    "Rencontre nationale des étudiants sénégalais",
    "L'Ambassade organise une rencontre destinée aux étudiants sénégalais en France.",
    "PROFIL",
    "ETUDIANT",
    "EVENEMENT",
    "IMPORTANTE",
    4
);


publierInformation(
    1,
    "Message vidéo du Consulat",
    "Le Consulat partage une nouvelle information en vidéo.",
    "TOUS",
    null,
    "INFORMATION",
    "NORMALE",
    3,
    [
        {
            type: "VIDEO",
            nom: "message-consulat.mp4",
            url: "/videos/message-consulat.mp4"
        },
        {
            type: "IMAGE",
            nom: "affiche.jpg",
            url: "/images/affiche.jpg"
        }
    ]
);


publierInformation(
    2,
    "Message vidéo de l'Ambassade",
    "L'Ambassade partage un message vidéo destiné aux étudiants sénégalais en France.",
    "PROFIL",
    "ETUDIANT",
    "INFORMATION",
    "NORMALE",
    4,
    [
        {
            type: "VIDEO",
            nom: "message-ambassade.mp4",
            url: "/videos/message-ambassade.mp4"
        },
        {
            type: "IMAGE",
            nom: "affiche-ambassade.jpg",
            url: "/images/affiche-ambassade.jpg"
        }
    ]
);


ouvrirExperience(
    1,
    "MON_CONSULAT"
);


ouvrirExperience(
    1,
    "MON_AMBASSADE"
);


publierInformation(
    1,
    "Fermeture exceptionnelle du Consulat",
    "Le Consulat sera exceptionnellement fermé demain matin.",
    "TOUS",
    null,
    "ALERTE",
    "URGENTE",
    3
);
afficherNotificationsPersonne(
    1
);

ouvrirExperience(
    1,
    "DIASPORA"
);


afficherFilDiasporaParCategorie(
    1,
    "TOUT"
);
console.log("");
console.log("===== TEST ESPACE CONSULAT =====");

afficherEspaceConsulat(
    1
);
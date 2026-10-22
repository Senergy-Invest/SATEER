const {
    organisations,
    personnes,
    relationsPersonneOrganisation,
    dossiers,
    historiqueDossiers,
    demandesPieces,
    documents,
    permissionsParRole,
    experiences,
    activationsExperiences,
    publications,
    requetes,
    reponsesRequetes,
    notifications,
    profilsDiaspora,
    autorisationsPartageProfil,
    evenements
} = require("./data");


function trouverPersonneParId(personneId) {
    return personnes.find(
        personne => personne.id === personneId
    );
}


function trouverOrganisationParId(organisationId) {
    return organisations.find(
        organisation => organisation.id === organisationId
    );
}


function trouverAgentsParOrganisation(organisationId) {
    return relationsPersonneOrganisation.filter(
        relation =>
            relation.type === "AGENT" &&
            relation.organisationId === organisationId
    );
}


function aPermission(
    personneId,
    action,
    organisationId
) {

    const relation =
        relationsPersonneOrganisation.find(
            relation =>
                relation.personneId === personneId &&
                relation.organisationId === organisationId
        );


    if (
        relation === undefined
    ) {
        return false;
    }


    const permissions =
        permissionsParRole[
            relation.type
        ];


    if (
        permissions === undefined
    ) {

        console.log(
            "Aucune permission définie pour le rôle : " +
            relation.type
        );

        return false;
    }


    return permissions.includes(
        action
    );
}

function changerStatutDossier(dossierId, nouveauStatut, personneId) {

    const transitionsAutorisees = {
        BROUILLON: ["SOUMIS"],
        SOUMIS: ["EN_REVISION"],
        EN_REVISION: ["INCOMPLET", "TERMINE"],
        INCOMPLET: ["SOUMIS"],
        TERMINE: []
    };

    const dossier = dossiers.find(
        dossier => dossier.id === dossierId
    );

    const personne = trouverPersonneParId(
        personneId
    );

    const statutActuel = dossier.statut;

    const estProprietaireDuDossier =
        dossier.personneId === personneId;

    const peutSoumettre =
        estProprietaireDuDossier &&
        aPermission(
            personneId,
            "SOUMETTRE_DOSSIER",
            dossier.organisationId
        );

    const peutTraiter =
        aPermission(
            personneId,
            "TRAITER_DOSSIER",
            dossier.organisationId
        );

    const actionEstSoumission =
        (
            statutActuel === "BROUILLON" ||
            statutActuel === "INCOMPLET"
        ) &&
        nouveauStatut === "SOUMIS";

    if (actionEstSoumission === true) {

        if (peutSoumettre === false) {
            console.log("");
            console.log(
                "Permission refusée pour " +
                personne.prenom +
                " " +
                personne.nom
            );

            return;
        }

    } else {

        if (peutTraiter === false) {
            console.log("");
            console.log(
                "Permission refusée pour " +
                personne.prenom +
                " " +
                personne.nom
            );

            return;
        }
    }

    const transitionsPossibles =
        transitionsAutorisees[statutActuel];

    const transitionValide =
        transitionsPossibles.includes(
            nouveauStatut
        );

    if (transitionValide === false) {
        console.log("");
        console.log(
            "Transition interdite : " +
            statutActuel +
            " -> " +
            nouveauStatut
        );

        return;
    }

    historiqueDossiers.push({
        dossierId: dossier.id,
        ancienStatut: statutActuel,
        nouveauStatut: nouveauStatut,
        personneId: personneId,
        date: new Date()
    });

    dossier.statut = nouveauStatut;

    console.log("");
    console.log(
        "Le dossier " +
        dossier.id +
        " passe de " +
        statutActuel +
        " à " +
        dossier.statut +
        " par " +
        personne.prenom +
        " " +
        personne.nom
    );
}

function demanderPiece(dossierId, nomPiece, personneId) {

    const dossier = dossiers.find(
        dossier => dossier.id === dossierId
    );

    const personne = trouverPersonneParId(
        personneId
    );

    const peutTraiter = aPermission(
        personneId,
        "TRAITER_DOSSIER",
        dossier.organisationId
    );

    if (peutTraiter === false) {
        console.log("");
        console.log(
            "Permission refusée pour " +
            personne.prenom +
            " " +
            personne.nom
        );

        return;
    }

    demandesPieces.push({
        id: demandesPieces.length + 1,
        dossierId: dossierId,
        nomPiece: nomPiece,
        demandeePar: personneId,
        statut: "EN_ATTENTE",
        date: new Date()
    });

    console.log("");
    console.log(
        personne.prenom +
        " " +
        personne.nom +
        " demande la pièce : " +
        nomPiece
    );

    changerStatutDossier(
        dossierId,
        "INCOMPLET",
        personneId
    );
}

function fournirPiece(
    demandePieceId,
    personneId,
    nomFichier
) {

    const demandePiece = demandesPieces.find(
        demande => demande.id === demandePieceId
    );

    const dossier = dossiers.find(
        dossier => dossier.id === demandePiece.dossierId
    );

    const personne = trouverPersonneParId(
        personneId
    );

    const estProprietaireDuDossier =
        dossier.personneId === personneId;

    if (estProprietaireDuDossier === false) {
        console.log("");
        console.log(
            "Permission refusée pour " +
            personne.prenom +
            " " +
            personne.nom
        );

        return;
    }

    const document = {
        id: documents.length + 1,
        dossierId: dossier.id,
        demandePieceId: demandePiece.id,
        nomFichier: nomFichier,
        fourniPar: personneId,
        date: new Date()
    };

    documents.push(document);

    demandePiece.statut = "FOURNIE";

    console.log("");
    console.log(
        personne.prenom +
        " " +
        personne.nom +
        " a fourni le document : " +
        nomFichier
    );

    changerStatutDossier(
        dossier.id,
        "SOUMIS",
        personneId
    );
}

function afficherHistoriqueDossier(dossierId) {

    const historiqueDuDossier = historiqueDossiers.filter(
        historique => historique.dossierId === dossierId
    );

    console.log("");
    console.log("Historique du dossier " + dossierId);

    for (const historique of historiqueDuDossier) {

        const personne = trouverPersonneParId(
            historique.personneId
        );

        const dateLisible = historique.date.toLocaleString(
            "fr-FR"
        );

        console.log(
            "- " +
            dateLisible +
            " | " +
            historique.ancienStatut +
            " -> " +
            historique.nouveauStatut +
            " | par " +
            personne.prenom +
            " " +
            personne.nom
        );
    }
}

function afficherDetailDossier(dossierId) {

    const dossier = dossiers.find(
        dossier => dossier.id === dossierId
    );

    const personne = trouverPersonneParId(
        dossier.personneId
    );

    const organisation = trouverOrganisationParId(
        dossier.organisationId
    );

    const demandesDuDossier = demandesPieces.filter(
        demande => demande.dossierId === dossierId
    );

    const documentsDuDossier = documents.filter(
        document => document.dossierId === dossierId
    );

    const historiqueDuDossier = historiqueDossiers.filter(
        historique => historique.dossierId === dossierId
    );

    console.log("");
    console.log("===== DETAIL DU DOSSIER =====");

    console.log("Dossier : " + dossier.id);

    console.log(
        "Usager : " +
        personne.prenom +
        " " +
        personne.nom
    );

    console.log(
        "Organisation : " +
        organisation.nom
    );

    console.log(
        "Type : " +
        dossier.type
    );

    console.log(
        "Statut : " +
        dossier.statut
    );

    console.log("");
    console.log("Demandes de pièces :");

    for (const demande of demandesDuDossier) {
        console.log(
            "- " +
            demande.nomPiece +
            " | " +
            demande.statut
        );
    }

    console.log("");
    console.log("Documents :");

    for (const document of documentsDuDossier) {

        const fourniPar = trouverPersonneParId(
            document.fourniPar
        );

        console.log(
            "- " +
            document.nomFichier +
            " | fourni par " +
            fourniPar.prenom +
            " " +
            fourniPar.nom
        );
    }

    console.log("");
    console.log("Historique :");

    for (const historique of historiqueDuDossier) {

        const auteur = trouverPersonneParId(
            historique.personneId
        );

        console.log(
            "- " +
            historique.ancienStatut +
            " -> " +
            historique.nouveauStatut +
            " | par " +
            auteur.prenom +
            " " +
            auteur.nom
        );
    }
}

function creerDossier(personneId, organisationId, typeDossier) {

    const personne = trouverPersonneParId(
        personneId
    );

    const organisation = trouverOrganisationParId(
        organisationId
    );

    const peutCreerDossier = aPermission(
        personneId,
        "CREER_DOSSIER",
        organisationId
    );

    if (peutCreerDossier === false) {

        console.log("");

        console.log(
            "Permission refusée pour " +
            personne.prenom +
            " " +
            personne.nom
        );

        return;
    }

    const nouveauDossier = {
        id: dossiers.length + 1,
        personneId: personneId,
        organisationId: organisationId,
        type: typeDossier,
        statut: "BROUILLON"
    };

    dossiers.push(
        nouveauDossier
    );

    console.log("");

    console.log(
        "Nouveau dossier créé pour " +
        personne.prenom +
        " " +
        personne.nom
    );

    console.log(
        "Organisation : " +
        organisation.nom
    );

    console.log(
        "Type : " +
        typeDossier
    );

    console.log(
        "Statut : BROUILLON"
    );

    return nouveauDossier;
}

function listerExperiencesPersonne(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const notificationsNonLues = notifications.filter(
        notification =>
            notification.personneId === personneId &&
            notification.lue === false
    );

    const demandesPersonne = requetes.filter(
        requete =>
            requete.personneId === personneId
    );

    const demandesEnCours = demandesPersonne.filter(
        requete =>
            requete.statut === "NOUVELLE" ||
            requete.statut === "EN_COURS"
    );

    const demandesRepondues = demandesPersonne.filter(
        requete =>
            requete.statut === "REPONDUE"
    );

    const activations = activationsExperiences.filter(
        activation =>
            activation.personneId === personneId &&
            activation.statut === "ACTIVE"
    );

    console.log("");

    console.log(
        "===== MON SATEER DE " +
        personne.prenom.toUpperCase() +
        " " +
        personne.nom.toUpperCase() +
        " ====="
    );

    console.log("");

    console.log(
        "Notifications non lues : " +
        notificationsNonLues.length
    );

    console.log(
        "Demandes en cours : " +
        demandesEnCours.length
    );

    console.log(
        "Demandes répondues : " +
        demandesRepondues.length
    );

    console.log(
        "Expériences actives : " +
        activations.length
    );

    console.log("");

    console.log("Mes expériences :");

    for (const activation of activations) {

        const experience = experiences.find(
            experience =>
                experience.id === activation.experienceId
        );

        console.log(
            "- " + experience.nom
        );
    }
}

function afficherMonConsulat(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const relationConsulat =
        relationsPersonneOrganisation.find(
            relation => {

                const organisation =
                    trouverOrganisationParId(
                        relation.organisationId
                    );

                return (
                    relation.personneId === personneId &&
                    organisation.type === "CONSULAT"
                );
            }
        );

    if (relationConsulat === undefined) {

        console.log("");
        console.log(
            "Aucun consulat associé à cette personne."
        );

        return;
    }

    const consulat =
        trouverOrganisationParId(
            relationConsulat.organisationId
        );

    const informations =
        publications.filter(
            publication => {

                const memeOrganisation =
                    publication.organisationId ===
                    consulat.id;

                const estPubliee =
                    publication.statut ===
                    "PUBLIEE";

                const personnesCiblees =
                    trouverPersonnesCiblees(
                        publication.audienceType,
                        publication.audienceValeur
                    );

                const personneEstCiblee =
                    personnesCiblees.some(
                        personneCiblee =>
                            personneCiblee.id ===
                            personneId
                    );

                return (
                    memeOrganisation &&
                    estPubliee &&
                    personneEstCiblee
                );
            }
        );

    console.log("");
    console.log(
        "===== MON CONSULAT ====="
    );

    console.log(
        personne.prenom +
        " " +
        personne.nom
    );

    console.log(
        "Consulat : " +
        consulat.nom
    );

    console.log("");
    console.log(
        "Informations officielles :"
    );

    for (const information of informations) {

        console.log("");

        console.log(
            information.titre
        );

        console.log(
            information.contenu
        );

        if (
            information.medias !== undefined &&
            information.medias.length > 0
        ) {

            console.log(
                "Médias :"
            );

            for (const media of information.medias) {

                console.log(
                    "- " +
                    media.type +
                    " | " +
                    media.nom +
                    " | " +
                    media.url
                );
            }
        }
    }

    console.log("");
    console.log(
        "Services disponibles :"
    );

    console.log(
        "- Contacter le Consulat"
    );

    console.log(
        "- Mes demandes"
    );

    console.log(
        "- Services officiels"
    );
}
function publierInformation(
    organisationId,
    titre,
    contenu,
    audienceType,
    audienceValeur,
    categorie,
    priorite,
    personneId,
    medias
) {

    const organisation =
        trouverOrganisationParId(
            organisationId
        );

    const personne =
        trouverPersonneParId(
            personneId
        );

    const peutPublier =
        aPermission(
            personneId,
            "PUBLIER_INFORMATION",
            organisationId
        );

    if (peutPublier === false) {

        console.log("");

        console.log(
            "Permission refusée pour " +
            personne.prenom +
            " " +
            personne.nom
        );

        return;
    }


    const nouvellePublication = {

        id: publications.length + 1,

        organisationId: organisationId,

        titre: titre,

        contenu: contenu,

        audienceType: audienceType,

        audienceValeur: audienceValeur,

        categorie: categorie,

        priorite: priorite,

        medias: medias || [],

        statut: "PUBLIEE",

        publiePar: personneId,

        datePublication: new Date(),

        statutDiffusionDiaspora:
            "NON_DEMANDEE",

        dateSoumissionDiaspora: null,

        dateDiffusionDiaspora: null
    };


    publications.push(
        nouvellePublication
    );


    console.log("");

    console.log(
        personne.prenom +
        " " +
        personne.nom +
        " a publié une information pour " +
        organisation.nom
    );

    console.log(
        "Titre : " +
        titre
    );

    console.log(
        "Catégorie : " +
        categorie
    );

    console.log(
        "Priorité : " +
        priorite
    );

    console.log(
        "Audience : " +
        audienceType
    );


    if (
        audienceValeur !== null &&
        audienceValeur !== undefined
    ) {

        console.log(
            "Valeur audience : " +
            audienceValeur
        );
    }


    console.log(
        "Diffusion Diaspora : " +
        nouvellePublication
            .statutDiffusionDiaspora
    );


    return nouvellePublication;
}
function soumettrePublicationADiaspora(
    publicationId,
    personneId
) {

    const publication =
        publications.find(
            publication =>
                publication.id === publicationId
        );


    if (publication === undefined) {

        console.log(
            "Publication introuvable."
        );

        return;
    }


    const peutPublier =
        aPermission(
            personneId,
            "PUBLIER_INFORMATION",
            publication.organisationId
        );


    if (peutPublier === false) {

        console.log(
            "Vous n'avez pas l'autorisation de soumettre cette publication."
        );

        return;
    }


    publication.statutDiffusionDiaspora =
        "SOUMISE";

    publication.dateSoumissionDiaspora =
        new Date();


    console.log("");

    console.log(
        "===== SOUMISSION À SATEER COMMUNICATION ====="
    );

    console.log(
        "Publication : " +
        publication.titre
    );

    console.log(
        "Statut Diaspora : SOUMISE"
    );

    console.log(
        "La publication est maintenant en attente de validation par SATEER Communication."
    );


    return publication;
}
function approuverDiffusionDiaspora(
    publicationId,
    personneId
) {

    const organisationSateer =
        organisations.find(
            organisation =>
                organisation.type === "SATEER"
        );


    if (
        organisationSateer === undefined
    ) {

        console.log(
            "Organisation SATEER introuvable."
        );

        return;
    }


    const autorise =
        aPermission(
            personneId,
            "GERER_DIFFUSION_DIASPORA",
            organisationSateer.id
        );


    if (autorise === false) {

        console.log(
            "Permission refusée : seuls les agents SATEER autorisés peuvent valider une diffusion Diaspora."
        );

        return;
    }


    const publication =
        publications.find(
            publication =>
                publication.id === publicationId
        );


    if (
        publication === undefined
    ) {

        console.log(
            "Publication introuvable."
        );

        return;
    }


    if (
        publication.statutDiffusionDiaspora !==
        "SOUMISE"
    ) {

        console.log(
            "Cette publication n'est pas en attente de validation SATEER."
        );

        return;
    }


    publication.statutDiffusionDiaspora =
        "DIFFUSEE";

    publication.dateDiffusionDiaspora =
        new Date();

    publication.valideeParSateer =
        personneId;


    const personnesCiblees =
        trouverPersonnesCiblees(
            publication.audienceType,
            publication.audienceValeur
        );


    console.log("");

    console.log(
        "===== VALIDATION SATEER COMMUNICATION ====="
    );

    console.log(
        "Publication : " +
        publication.titre
    );

    console.log(
        "Statut Diaspora : DIFFUSEE"
    );

    console.log(
        "Validée par l'agent SATEER : " +
        personneId
    );

    console.log(
        "Personnes correspondant à l'audience : " +
        personnesCiblees.length
    );


    if (
        publication.priorite ===
        "URGENTE"
    ) {

        const experienceDiaspora =
            experiences.find(
                experience =>
                    experience.code ===
                    "DIASPORA"
            );


        let nombreNotifications = 0;


        for (
            const personneCiblee
            of personnesCiblees
        ) {

            const activationDiaspora =
                activationsExperiences.find(
                    activation =>

                        activation.personneId ===
                            personneCiblee.id &&

                        activation.experienceId ===
                            experienceDiaspora.id &&

                        activation.statut ===
                            "ACTIVE"
                );


            if (
                activationDiaspora !==
                undefined
            ) {

                notifications.push(
                    {
                        id:
                            notifications.length +
                            1,

                        personneId:
                            personneCiblee.id,

                        titre:
                            "ALERTE URGENTE - " +
                            trouverOrganisationParId(
                                publication.organisationId
                            ).nom,

                        message:
                            publication.titre +
                            " : " +
                            publication.contenu,

                        lue: false,

                        dateCreation:
                            new Date()
                    }
                );


                nombreNotifications++;
            }
        }


        console.log(
            "Notifications urgentes envoyées : " +
            nombreNotifications
        );
    }


    return publication;
}
function rejeterDiffusionDiaspora(
    publicationId,
    personneId,
    motif
) {

    const organisationSateer =
        organisations.find(
            organisation =>
                organisation.type === "SATEER"
        );


    if (
        organisationSateer === undefined
    ) {

        console.log(
            "Organisation SATEER introuvable."
        );

        return;
    }


    const autorise =
        aPermission(
            personneId,
            "GERER_DIFFUSION_DIASPORA",
            organisationSateer.id
        );


    if (autorise === false) {

        console.log(
            "Permission refusée : seuls les agents SATEER autorisés peuvent rejeter une diffusion Diaspora."
        );

        return;
    }


    const publication =
        publications.find(
            publication =>
                publication.id === publicationId
        );


    if (
        publication === undefined
    ) {

        console.log(
            "Publication introuvable."
        );

        return;
    }


    if (
        publication.statutDiffusionDiaspora !==
        "SOUMISE"
    ) {

        console.log(
            "Cette publication n'est pas en attente de validation SATEER."
        );

        return;
    }


    publication.statutDiffusionDiaspora =
        "REJETEE";

    publication.rejeteeParSateer =
        personneId;

    publication.motifRejetDiaspora =
        motif;

    publication.dateRejetDiaspora =
        new Date();


    console.log("");

    console.log(
        "===== REJET SATEER COMMUNICATION ====="
    );

    console.log(
        "Publication : " +
        publication.titre
    );

    console.log(
        "Statut Diaspora : REJETEE"
    );

    console.log(
        "Motif : " +
        motif
    );


    return publication;
}
function trouverPersonnesParCompetence(competence) {

    return personnes.filter(
        personne =>
            personne.competences !== undefined &&
            personne.competences.includes(competence)
    );
}

function afficherTableauBordDiaspora() {

    const etudiants = personnes.filter(
        personne => personne.profil === "ETUDIANT"
    );

    const entrepreneurs = personnes.filter(
        personne => personne.profil === "ENTREPRENEUR"
    );

    const competences = [];

    for (const personne of personnes) {

        if (personne.competences !== undefined) {

            for (const competence of personne.competences) {

                if (competences.includes(competence) === false) {
                    competences.push(competence);
                }
            }
        }
    }

    const associations = organisations.filter(
        organisation => organisation.type === "ASSOCIATION"
    );

    console.log("");
    console.log("===== TABLEAU DE BORD DIASPORA =====");

    console.log(
        "Etudiants : " +
        etudiants.length
    );

    console.log(
        "Entrepreneurs : " +
        entrepreneurs.length
    );

    console.log(
        "Associations : " +
        associations.length
    );

    console.log("");
    console.log("Compétences disponibles :");

    for (const competence of competences) {
        console.log(
            "- " + competence
        );
    }

    console.log("");
    console.log("Associations connues :");

    for (const association of associations) {
        console.log(
            "- " + association.nom
        );
    }
}

function listerAssociationsPersonne(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const relationsAssociations =
        relationsPersonneOrganisation.filter(
            relation => {

                if (relation.personneId !== personneId) {
                    return false;
                }

                const organisation =
                    trouverOrganisationParId(
                        relation.organisationId
                    );

                return organisation.type === "ASSOCIATION";
            }
        );

    console.log("");

    console.log(
        "===== ASSOCIATIONS DE " +
        personne.prenom.toUpperCase() +
        " " +
        personne.nom.toUpperCase() +
        " ====="
    );

    if (relationsAssociations.length === 0) {

        console.log(
            "Aucune association."
        );

        return;
    }

    for (const relation of relationsAssociations) {

        const association =
            trouverOrganisationParId(
                relation.organisationId
            );

        console.log(
            "- " +
            association.nom +
            " | " +
            relation.type
        );
    }
}function listerAssociationsPersonne(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const relationsAssociations =
        relationsPersonneOrganisation.filter(
            relation => {

                if (relation.personneId !== personneId) {
                    return false;
                }

                const organisation =
                    trouverOrganisationParId(
                        relation.organisationId
                    );

                return organisation.type === "ASSOCIATION";
            }
        );

    console.log("");

    console.log(
        "===== ASSOCIATIONS DE " +
        personne.prenom.toUpperCase() +
        " " +
        personne.nom.toUpperCase() +
        " ====="
    );

    if (relationsAssociations.length === 0) {

        console.log(
            "Aucune association."
        );

        return;
    }

    for (const relation of relationsAssociations) {

        const association =
            trouverOrganisationParId(
                relation.organisationId
            );

        console.log(
            "- " +
            association.nom +
            " | " +
            relation.type
        );
    }
}

function envoyerRequete(
    personneId,
    organisationId,
    categorie,
    objet,
    message
) {

    const personne = trouverPersonneParId(
        personneId
    );

    const organisation = trouverOrganisationParId(
        organisationId
    );

    const nouvelleRequete = {
        id: requetes.length + 1,
        personneId: personneId,
        organisationId: organisationId,
        categorie: categorie,
        objet: objet,
        message: message,
        statut: "NOUVELLE",
        dateCreation: new Date()
    };

    requetes.push(
        nouvelleRequete
    );

    console.log("");
    console.log("===== NOUVELLE REQUETE =====");

    console.log(
        "De : " +
        personne.prenom +
        " " +
        personne.nom
    );

    console.log(
        "Pour : " +
        organisation.nom
    );

    console.log(
        "Catégorie : " +
        categorie
    );

    console.log(
        "Objet : " +
        objet
    );

    console.log(
        "Statut : NOUVELLE"
    );

    return nouvelleRequete;
}

function afficherInboxOrganisation(organisationId) {

    const organisation = trouverOrganisationParId(
        organisationId
    );

    const requetesOrganisation = requetes.filter(
        requete =>
            requete.organisationId === organisationId
    );

    console.log("");
    console.log(
        "===== INBOX DE " +
        organisation.nom.toUpperCase() +
        " ====="
    );

    if (requetesOrganisation.length === 0) {

        console.log(
            "Aucune requête reçue."
        );

        return;
    }

    for (const requete of requetesOrganisation) {

        const personne = trouverPersonneParId(
            requete.personneId
        );

        console.log("");
        console.log(
            "Requête " +
            requete.id
        );

        console.log(
            "De : " +
            personne.prenom +
            " " +
            personne.nom
        );

        console.log(
            "Catégorie : " +
            requete.categorie
        );

        console.log(
            "Objet : " +
            requete.objet
        );

        console.log(
            "Statut : " +
            requete.statut
        );

        console.log(
            "Message : " +
            requete.message
        );
    }
}
function prendreEnChargeRequete(
    requeteId,
    personneId
) {

    const requete = requetes.find(
        requete => requete.id === requeteId
    );

    const personne = trouverPersonneParId(
        personneId
    );

    const peutTraiter = aPermission(
        personneId,
        "TRAITER_DOSSIER",
        requete.organisationId
    );

    if (peutTraiter === false) {
        console.log("");
        console.log(
            "Permission refusée pour " +
            personne.prenom +
            " " +
            personne.nom
        );

        return;
    }

    requete.statut = "EN_COURS";
    requete.assigneeA = personneId;
    requete.datePriseEnCharge = new Date();

    console.log("");
    console.log(
        personne.prenom +
        " " +
        personne.nom +
        " prend en charge la requête " +
        requete.id
    );

    console.log(
        "Nouveau statut : " +
        requete.statut
    );
}
function repondreRequete(
    requeteId,
    personneId,
    messageReponse
) {

    const requete = requetes.find(
        requete => requete.id === requeteId
    );

    const personne = trouverPersonneParId(
        personneId
    );

    const peutTraiter = aPermission(
        personneId,
        "TRAITER_DOSSIER",
        requete.organisationId
    );

    if (peutTraiter === false) {

        console.log("");

        console.log(
            "Permission refusée pour " +
            personne.prenom +
            " " +
            personne.nom
        );

        return;
    }

    const nouvelleReponse = {
        id: reponsesRequetes.length + 1,
        requeteId: requeteId,
        personneId: personneId,
        message: messageReponse,
        dateCreation: new Date()
    };

    reponsesRequetes.push(
        nouvelleReponse
    );

    const notification = {
    id: notifications.length + 1,
    personneId: requete.personneId,
    titre: "Réponse du Consulat",
    message:
        "Le Consulat a répondu à votre requête : " +
        requete.objet,
    lue: false,
    dateCreation: new Date()
};

notifications.push(
    notification
);

    requete.statut = "REPONDUE";
    requete.dateReponse = new Date();

    console.log("");

    console.log(
        personne.prenom +
        " " +
        personne.nom +
        " a répondu à la requête " +
        requete.id
    );

    console.log(
        "Nouveau statut : REPONDUE"
    );
}
function afficherMesRequetes(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const mesRequetes = requetes.filter(
        requete =>
            requete.personneId === personneId
    );

    console.log("");
    console.log(
        "===== MES REQUETES DE " +
        personne.prenom.toUpperCase() +
        " " +
        personne.nom.toUpperCase() +
        " ====="
    );

    if (mesRequetes.length === 0) {
        console.log(
            "Aucune requête."
        );

        return;
    }

    for (const requete of mesRequetes) {

        console.log("");
        console.log(
            "Requête " +
            requete.id
        );

        console.log(
            "Catégorie : " +
            requete.categorie
        );

        console.log(
            "Objet : " +
            requete.objet
        );

        console.log(
            "Statut : " +
            requete.statut
        );

        console.log(
            "Message envoyé : " +
            requete.message
        );

        const reponses = reponsesRequetes.filter(
            reponse =>
                reponse.requeteId === requete.id
        );

        if (reponses.length === 0) {

            console.log(
                "Réponse du Consulat : aucune réponse pour le moment."
            );

        } else {

            for (const reponse of reponses) {

                const auteur = trouverPersonneParId(
                    reponse.personneId
                );

                console.log(
                    "Réponse du Consulat : " +
                    reponse.message
                );

                console.log(
                    "Répondu par : " +
                    auteur.prenom +
                    " " +
                    auteur.nom
                );
            }
        }
    }
}

function afficherNotificationsPersonne(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const notificationsPersonne =
        notifications.filter(
            notification =>
                notification.personneId === personneId
        );

    console.log("");
    console.log(
        "===== NOTIFICATIONS DE " +
        personne.prenom.toUpperCase() +
        " " +
        personne.nom.toUpperCase() +
        " ====="
    );

    if (notificationsPersonne.length === 0) {
        console.log(
            "Aucune notification."
        );

        return;
    }

    for (const notification of notificationsPersonne) {

        console.log("");

        console.log(
            "Titre : " +
            notification.titre
        );

        console.log(
            "Message : " +
            notification.message
        );

        console.log(
            "Lue : " +
            notification.lue
        );
    }
}
function marquerNotificationCommeLue(
    notificationId,
    personneId
) {

    const notification = notifications.find(
        notification =>
            notification.id === notificationId &&
            notification.personneId === personneId
    );

    if (notification === undefined) {
        console.log("");
        console.log(
            "Notification introuvable."
        );

        return;
    }

    notification.lue = true;

    console.log("");
    console.log(
        "Notification " +
        notification.id +
        " marquée comme lue."
    );
}

function ouvrirExperience(
    personneId,
    codeExperience
) {

    const personne = trouverPersonneParId(
        personneId
    );

    const experience = experiences.find(
        experience =>
            experience.code === codeExperience
    );

    if (experience === undefined) {

        console.log("");
        console.log(
            "Expérience introuvable : " +
            codeExperience
        );

        return;
    }

    const activation =
        activationsExperiences.find(
            activation =>
                activation.personneId === personneId &&
                activation.experienceId === experience.id &&
                activation.statut === "ACTIVE"
        );

    if (activation === undefined) {

        console.log("");
        console.log(
            personne.prenom +
            " " +
            personne.nom +
            " n'a pas accès à l'expérience " +
            experience.nom
        );

        return;
    }

    console.log("");
    console.log(
        "Ouverture de l'expérience : " +
        experience.nom
    );

    if (codeExperience === "MON_CONSULAT") {

        afficherMonConsulat(
            personneId
        );

        return;
    }

    if (codeExperience === "MON_AMBASSADE") {

        afficherMonAmbassade(
            personneId
        );

        return;
    }

    if (codeExperience === "DIASPORA") {

        afficherDiaspora(
            personneId
        );

        return;
    }
}
function afficherMonAmbassade(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const ambassade = organisations.find(
        organisation =>
            organisation.type === "AMBASSADE"
    );

    if (ambassade === undefined) {

        console.log("");
        console.log(
            "Aucune ambassade disponible."
        );

        return;
    }

    const informations =
        publications.filter(
            publication => {

                const memeOrganisation =
                    publication.organisationId ===
                    ambassade.id;

                const estPubliee =
                    publication.statut ===
                    "PUBLIEE";

                const personnesCiblees =
                    trouverPersonnesCiblees(
                        publication.audienceType,
                        publication.audienceValeur
                    );

                const personneEstCiblee =
                    personnesCiblees.some(
                        personneCiblee =>
                            personneCiblee.id ===
                            personneId
                    );

                return (
                    memeOrganisation &&
                    estPubliee &&
                    personneEstCiblee
                );
            }
        );

    console.log("");
    console.log(
        "===== MON AMBASSADE ====="
    );

    console.log(
        personne.prenom +
        " " +
        personne.nom
    );

    console.log(
        "Ambassade : " +
        ambassade.nom
    );

    console.log("");
    console.log(
        "Informations officielles :"
    );

    if (informations.length === 0) {

        console.log(
            "Aucune information officielle pour le moment."
        );

    } else {

        for (const information of informations) {

            console.log("");

            console.log(
                information.titre
            );

            console.log(
                information.contenu
            );

            if (
                information.medias !== undefined &&
                information.medias.length > 0
            ) {

                console.log(
                    "Médias :"
                );

                for (const media of information.medias) {

                    console.log(
                        "- " +
                        media.type +
                        " | " +
                        media.nom +
                        " | " +
                        media.url
                    );
                }
            }
        }
    }

    console.log("");
    console.log(
        "Services disponibles :"
    );

    console.log(
        "- Contacter l'Ambassade"
    );

    console.log(
        "- Mes demandes"
    );

    console.log(
        "- Services officiels"
    );
}

function afficherMonProfilDiaspora(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const profil = profilsDiaspora.find(
        profil =>
            profil.personneId === personneId
    );

    if (profil === undefined) {

        console.log("");
        console.log(
            "Aucun profil Diaspora renseigné."
        );

        return;
    }

    console.log("");
    console.log(
        "===== MON PROFIL DIASPORA ====="
    );

    console.log(
        personne.prenom +
        " " +
        personne.nom
    );

    console.log(
        "Titre : " +
        profil.titreProfessionnel
    );

    console.log("");
    console.log(
        "Présentation :"
    );

    console.log(
        profil.presentation
    );

    console.log("");
    console.log(
        "Compétences :"
    );

    for (const competence of profil.competences) {
        console.log(
            "- " + competence
        );
    }

    console.log("");
    console.log(
        "Langues :"
    );

    for (const langue of profil.langues) {
        console.log(
            "- " + langue
        );
    }

    console.log("");
    console.log(
        "Disponible pour contribuer : " +
        profil.disponiblePourContribuer
    );

    console.log("");
    console.log(
        "Partage du profil :"
    );

    const autorisations =
        autorisationsPartageProfil.filter(
            autorisation =>
                autorisation.personneId === personneId
        );

    for (const autorisation of autorisations) {

        console.log(
            "- " +
            autorisation.typeDestinataire +
            " : " +
            autorisation.autorise
        );
    }
}

function modifierAutorisationPartageProfil(
    personneId,
    typeDestinataire,
    autorise
) {

    const personne = trouverPersonneParId(
        personneId
    );

    const autorisation =
        autorisationsPartageProfil.find(
            autorisation =>
                autorisation.personneId === personneId &&
                autorisation.typeDestinataire === typeDestinataire
        );

    if (autorisation === undefined) {

        const nouvelleAutorisation = {
            id: autorisationsPartageProfil.length + 1,
            personneId: personneId,
            typeDestinataire: typeDestinataire,
            autorise: autorise
        };

        autorisationsPartageProfil.push(
            nouvelleAutorisation
        );

    } else {

        autorisation.autorise = autorise;
    }

    console.log("");

    console.log(
        personne.prenom +
        " " +
        personne.nom +
        " a modifié le partage de son profil."
    );

    console.log(
        typeDestinataire +
        " : " +
        autorise
    );
}

function afficherProfilsDiasporaAutorisesPourConsulat(
    organisationId
) {

    const organisation = trouverOrganisationParId(
        organisationId
    );

    console.log("");
    console.log(
        "===== PROFILS DIASPORA AUTORISES POUR " +
        organisation.nom.toUpperCase() +
        " ====="
    );

    const autorisationsConsulat =
        autorisationsPartageProfil.filter(
            autorisation =>
                autorisation.typeDestinataire === "CONSULAT" &&
                autorisation.autorise === true
        );

    if (autorisationsConsulat.length === 0) {

        console.log(
            "Aucun profil autorisé."
        );

        return;
    }

    for (const autorisation of autorisationsConsulat) {

        const personne = trouverPersonneParId(
            autorisation.personneId
        );

        const profil = profilsDiaspora.find(
            profil =>
                profil.personneId === autorisation.personneId
        );

        if (profil !== undefined) {

            console.log("");
            console.log(
                personne.prenom +
                " " +
                personne.nom
            );

            console.log(
                "Titre : " +
                profil.titreProfessionnel
            );

            console.log(
                "Compétences :"
            );

            for (const competence of profil.competences) {
                console.log(
                    "- " + competence
                );
            }

            console.log(
                "Disponible pour contribuer : " +
                profil.disponiblePourContribuer
            );
        }
    }
}
function afficherTableauBordDiasporaConsulat(
    organisationId
) {

    const organisation = trouverOrganisationParId(
        organisationId
    );

    const nombreProfils =
        profilsDiaspora.length;

    const profilsEtudiants =
        profilsDiaspora.filter(
            profil => {

                const personne = trouverPersonneParId(
                    profil.personneId
                );

                return personne.profil === "ETUDIANT";
            }
        );

    const profilsEntrepreneurs =
        profilsDiaspora.filter(
            profil => {

                const personne = trouverPersonneParId(
                    profil.personneId
                );

                return personne.profil === "ENTREPRENEUR";
            }
        );

    const competences = {};

    for (const profil of profilsDiaspora) {

        for (const competence of profil.competences) {

            if (competences[competence] === undefined) {
                competences[competence] = 1;
            } else {
                competences[competence]++;
            }
        }
    }

    const associations =
        organisations.filter(
            organisation =>
                organisation.type === "ASSOCIATION"
        );

    const autorisationsConsulat =
        autorisationsPartageProfil.filter(
            autorisation =>
                autorisation.typeDestinataire === "CONSULAT" &&
                autorisation.autorise === true
        );

    console.log("");
    console.log(
        "===== TABLEAU DE BORD DIASPORA ====="
    );

    console.log(
        "Organisation : " +
        organisation.nom
    );

    console.log("");
    console.log(
        "=== STATISTIQUES AGRÉGÉES ==="
    );

    console.log(
        "Profils Diaspora : " +
        nombreProfils
    );

    console.log(
        "Étudiants : " +
        profilsEtudiants.length
    );

    console.log(
        "Entrepreneurs : " +
        profilsEntrepreneurs.length
    );

    console.log(
        "Associations : " +
        associations.length
    );

    console.log("");
    console.log(
        "Compétences disponibles :"
    );

    for (const competence in competences) {

        console.log(
            "- " +
            competence +
            " : " +
            competences[competence]
        );
    }

    console.log("");
    console.log(
        "=== PROFILS AYANT AUTORISÉ LE CONSULAT ==="
    );

    console.log(
        "Nombre : " +
        autorisationsConsulat.length
    );

    for (const autorisation of autorisationsConsulat) {

        const personne = trouverPersonneParId(
            autorisation.personneId
        );

        const profil = profilsDiaspora.find(
            profil =>
                profil.personneId === autorisation.personneId
        );

        if (profil !== undefined) {

            console.log("");

            console.log(
                personne.prenom +
                " " +
                personne.nom
            );

            console.log(
                "Titre : " +
                profil.titreProfessionnel
            );

            console.log(
                "Compétences : " +
                profil.competences.join(", ")
            );

            console.log(
                "Disponible pour contribuer : " +
                profil.disponiblePourContribuer
            );
        }
    }
}
function rechercherProfilsDiasporaParCompetence(
    competence
) {

    const profilsAvecCompetence =
        profilsDiaspora.filter(
            profil =>
                profil.competences.includes(
                    competence
                )
        );

    const profilsAutorises =
        profilsAvecCompetence.filter(
            profil => {

                const autorisation =
                    autorisationsPartageProfil.find(
                        autorisation =>
                            autorisation.personneId === profil.personneId &&
                            autorisation.typeDestinataire === "CONSULAT" &&
                            autorisation.autorise === true
                    );

                return autorisation !== undefined;
            }
        );

    console.log("");
    console.log(
        "===== RECHERCHE DIASPORA PAR COMPETENCE ====="
    );

    console.log(
        "Compétence recherchée : " +
        competence
    );

    console.log(
        "Profils correspondants : " +
        profilsAvecCompetence.length
    );

    console.log(
        "Profils visibles par le Consulat : " +
        profilsAutorises.length
    );

    if (profilsAutorises.length === 0) {

        console.log(
            "Aucun profil autorisé visible."
        );

        return;
    }

    console.log("");

    console.log(
        "Profils autorisés :"
    );

    for (const profil of profilsAutorises) {

        const personne =
            trouverPersonneParId(
                profil.personneId
            );

        console.log("");

        console.log(
            personne.prenom +
            " " +
            personne.nom
        );

        console.log(
            "Titre : " +
            profil.titreProfessionnel
        );

        console.log(
            "Compétences : " +
            profil.competences.join(", ")
        );

        console.log(
            "Disponible pour contribuer : " +
            profil.disponiblePourContribuer
        );
    }
}

function trouverPersonnesCiblees(
    audienceType,
    audienceValeur
) {

    return personnes.filter(
        personneCiblee => {

            /*
                Les comptes internes SATEER
                ne font pas partie des audiences
                destinées à la diaspora.
            */

            if (
                personneCiblee.profil ===
                "AGENT_SATEER"
            ) {
                return false;
            }


            if (
                audienceType === "TOUS"
            ) {
                return true;
            }


            if (
                audienceType ===
                "DEPARTEMENT"
            ) {

                return (
                    personneCiblee.departement ===
                    audienceValeur
                );
            }


            if (
                audienceType ===
                "PROFIL"
            ) {

                return (
                    personneCiblee.profil ===
                    audienceValeur
                );
            }


            if (
                audienceType ===
                "ASSOCIATION"
            ) {

                return relationsPersonneOrganisation.some(
                    relation =>
                        relation.personneId ===
                            personneCiblee.id &&
                        relation.organisationId ===
                            audienceValeur
                );
            }


            if (
                audienceType ===
                "COMPETENCE"
            ) {

                const profilProfessionnel =
                    profilsDiaspora.find(
                        profil =>
                            profil.personneId ===
                            personneCiblee.id
                    );


                if (
                    profilProfessionnel ===
                    undefined
                ) {
                    return false;
                }


                return (
                    profilProfessionnel
                        .competences
                        .includes(
                            audienceValeur
                        )
                );
            }


            return false;
        }
    );
}
function creerEvenement(
    organisationId,
    titre,
    description,
    ville,
    dateEvenement,
    audienceType,
    audienceValeur,
    personneId
) {

    const organisation = trouverOrganisationParId(
        organisationId
    );

    const personne = trouverPersonneParId(
        personneId
    );

    const peutPublier = aPermission(
        personneId,
        "PUBLIER_INFORMATION",
        organisationId
    );

    if (peutPublier === false) {

        console.log("");

        console.log(
            "Permission refusée pour " +
            personne.prenom +
            " " +
            personne.nom
        );

        return;
    }

    const nouvelEvenement = {
        id: evenements.length + 1,
        organisationId: organisationId,
        titre: titre,
        description: description,
        ville: ville,
        dateEvenement: dateEvenement,
        audienceType: audienceType,
        audienceValeur: audienceValeur,
        statut: "PUBLIE",
        creePar: personneId,
        dateCreation: new Date()
    };

    evenements.push(
        nouvelEvenement
    );

    console.log("");

    console.log(
        "===== NOUVEL EVENEMENT ====="
    );

    console.log(
        "Organisation : " +
        organisation.nom
    );

    console.log(
        "Titre : " +
        titre
    );

    console.log(
        "Ville : " +
        ville
    );

    console.log(
        "Date : " +
        dateEvenement
    );

    console.log(
        "Audience : " +
        audienceType
    );

    if (audienceValeur !== null) {

        console.log(
            "Valeur audience : " +
            audienceValeur
        );
    }


    const experienceDiaspora =
        experiences.find(
            experience =>
                experience.code === "DIASPORA"
        );


    const personnesCiblees =
    trouverPersonnesCiblees(
        audienceType,
        audienceValeur
    );


        


    let nombreNotifications = 0;


    for (
        const personneCiblee
        of personnesCiblees
    ) {

        const activationDiaspora =
            activationsExperiences.find(
                activation =>
                    activation.personneId === personneCiblee.id &&
                    activation.experienceId === experienceDiaspora.id &&
                    activation.statut === "ACTIVE"
            );


        if (
            activationDiaspora !== undefined
        ) {

            const nouvelleNotification = {
                id: notifications.length + 1,
                personneId: personneCiblee.id,
                titre:
                    "Nouvel événement Diaspora",
                message:
                    titre +
                    " - " +
                    ville +
                    " - " +
                    dateEvenement,
                lue: false,
                dateCreation: new Date()
            };


            notifications.push(
                nouvelleNotification
            );

            nombreNotifications++;
        }
    }


    console.log("");

    console.log(
        "Personnes correspondant à l'audience : " +
        personnesCiblees.length
    );

    console.log(
        "Notifications envoyées : " +
        nombreNotifications
    );


    return nouvelEvenement;
}
function afficherAgendaDiaspora() {

    console.log("");
    console.log(
        "===== AGENDA DIASPORA ====="
    );

    const evenementsPublies = evenements.filter(
        evenement =>
            evenement.statut === "PUBLIE"
    );

    if (evenementsPublies.length === 0) {

        console.log(
            "Aucun événement pour le moment."
        );

        return;
    }

    for (const evenement of evenementsPublies) {

        const organisation =
            trouverOrganisationParId(
                evenement.organisationId
            );

        console.log("");

        console.log(
            evenement.titre
        );

        console.log(
            "Organisé par : " +
            organisation.nom
        );

        console.log(
            "Ville : " +
            evenement.ville
        );

        console.log(
            "Date : " +
            evenement.dateEvenement
        );

        console.log(
            evenement.description
        );
    }
}

function afficherDiaspora(personneId) {

    const personne = trouverPersonneParId(
        personneId
    );

    const profil = profilsDiaspora.find(
        profil =>
            profil.personneId === personneId
    );

    const relationsAssociations =
        relationsPersonneOrganisation.filter(
            relation => {

                if (relation.personneId !== personneId) {
                    return false;
                }

                const organisation =
                    trouverOrganisationParId(
                        relation.organisationId
                    );

                return organisation.type === "ASSOCIATION";
            }
        );


    const publicationsDiaspora =
    publications
        .filter(
            publication => {

                if (
                    publication.statut !== "PUBLIEE"
                ) {
                    return false;
                }

                if (
                    publication.statutDiffusionDiaspora !==
                    "DIFFUSEE"
                ) {
                    return false;
                }

                const personnesCiblees =
                    trouverPersonnesCiblees(
                        publication.audienceType,
                        publication.audienceValeur
                    );

                const personneEstCiblee =
                    personnesCiblees.some(
                        personneCiblee =>
                            personneCiblee.id ===
                            personneId
                    );

                return personneEstCiblee;
            }
        )
        .sort(
            (publicationA, publicationB) => {

                const poidsPriorite = {
                    URGENTE: 3,
                    IMPORTANTE: 2,
                    NORMALE: 1
                };

                const prioriteA =
                    poidsPriorite[
                        publicationA.priorite
                    ] || 0;

                const prioriteB =
                    poidsPriorite[
                        publicationB.priorite
                    ] || 0;

                if (
                    prioriteA !== prioriteB
                ) {
                    return (
                        prioriteB -
                        prioriteA
                    );
                }

                return (
                    new Date(
                        publicationB.datePublication
                    ) -
                    new Date(
                        publicationA.datePublication
                    )
                );
            }
        );

    const evenementsPublies =
        evenements.filter(
            evenement => {

                if (
                    evenement.statut !== "PUBLIE"
                ) {
                    return false;
                }

                const personnesCiblees =
                    trouverPersonnesCiblees(
                        evenement.audienceType,
                        evenement.audienceValeur
                    );

                const personneEstCiblee =
                    personnesCiblees.some(
                        personneCiblee =>
                            personneCiblee.id ===
                            personneId
                    );

                return personneEstCiblee;
            }
        );


    console.log("");
    console.log(
        "===== DIASPORA ====="
    );

    console.log(
        personne.prenom +
        " " +
        personne.nom
    );

    console.log(
        "Département : " +
        personne.departement
    );

    console.log(
        "Profil : " +
        personne.profil
    );


    console.log("");
    console.log(
        "===== FIL OFFICIEL ====="
    );


    if (
        publicationsDiaspora.length === 0
    ) {

        console.log(
            "Aucune information officielle."
        );

    } else {

        for (
            const publication
            of publicationsDiaspora
        ) {

            const organisation =
                trouverOrganisationParId(
                    publication.organisationId
                );

            console.log("");
            console.log(
                "--------------------------------"
            );

            console.log(
    "[" +
    organisation.type +
    "] [" +
    publication.categorie +
    "] [" +
    publication.priorite +
    "]"
);

            console.log(
                "Publié par : " +
                organisation.nom
            );

            console.log(
                "Date : " +
                new Date(
                    publication.datePublication
                ).toLocaleDateString(
                    "fr-FR"
                )
            );

            console.log(
                "Audience : " +
                publication.audienceType
            );

            if (
                publication.audienceValeur !== null &&
                publication.audienceValeur !== undefined
            ) {

                console.log(
                    "Cible : " +
                    publication.audienceValeur
                );
            }

            console.log("");

            console.log(
                publication.titre
            );

            console.log(
                publication.contenu
            );


            if (
                publication.medias !== undefined &&
                publication.medias.length > 0
            ) {

                console.log(
                    "Médias :"
                );

                for (
                    const media
                    of publication.medias
                ) {

                    console.log(
                        "- " +
                        media.type +
                        " | " +
                        media.nom +
                        " | " +
                        media.url
                    );
                }
            }
        }
    }


    console.log("");
    console.log(
        "===== MON PROFIL PROFESSIONNEL ====="
    );

    if (
        profil === undefined
    ) {

        console.log(
            "Aucun profil Diaspora."
        );

    } else {

        console.log(
            profil.titreProfessionnel
        );

        console.log(
            profil.presentation
        );
    }


    console.log("");
    console.log(
        "===== MES ASSOCIATIONS ====="
    );

    if (
        relationsAssociations.length === 0
    ) {

        console.log(
            "Aucune association."
        );

    } else {

        for (
            const relation
            of relationsAssociations
        ) {

            const association =
                trouverOrganisationParId(
                    relation.organisationId
                );

            console.log(
                "- " +
                association.nom +
                " | " +
                relation.type
            );
        }
    }


    console.log("");
    console.log(
        "===== AGENDA DIASPORA ====="
    );

    if (
        evenementsPublies.length === 0
    ) {

        console.log(
            "Aucun événement."
        );

    } else {

        for (
            const evenement
            of evenementsPublies
        ) {

            const organisation =
                trouverOrganisationParId(
                    evenement.organisationId
                );

            console.log("");
            console.log(
                evenement.titre
            );

            console.log(
                "Organisé par : " +
                organisation.nom
            );

            console.log(
                "Ville : " +
                evenement.ville
            );

            console.log(
                "Date : " +
                evenement.dateEvenement
            );
        }
    }
}
function afficherFilDiasporaParCategorie(
    personneId,
    categorie
) {

    const personne = trouverPersonneParId(
        personneId
    );

    const publicationsFiltrees =
        publications
            .filter(
                publication => {

                    if (
                        publication.statut !== "PUBLIEE"
                    ) {
                        return false;
                    }

                    if (
                        publication.statutDiffusionDiaspora !==
                        "DIFFUSEE"
                    ) {
                        return false;
                    }

                    if (
                        categorie !== "TOUT" &&
                        publication.categorie !== categorie
                    ) {
                        return false;
                    }

                    const personnesCiblees =
                        trouverPersonnesCiblees(
                            publication.audienceType,
                            publication.audienceValeur
                        );

                    const personneEstCiblee =
                        personnesCiblees.some(
                            personneCiblee =>
                                personneCiblee.id === personneId
                        );

                    return personneEstCiblee;
                }
            )
            .sort(
                (publicationA, publicationB) => {

                    const poidsPriorite = {
                        URGENTE: 3,
                        IMPORTANTE: 2,
                        NORMALE: 1
                    };

                    const prioriteA =
                        poidsPriorite[
                            publicationA.priorite
                        ] || 0;

                    const prioriteB =
                        poidsPriorite[
                            publicationB.priorite
                        ] || 0;

                    if (
                        prioriteA !== prioriteB
                    ) {
                        return (
                            prioriteB -
                            prioriteA
                        );
                    }

                    return (
                        new Date(
                            publicationB.datePublication
                        ) -
                        new Date(
                            publicationA.datePublication
                        )
                    );
                }
            );


    console.log("");
    console.log(
        "===== FIL DIASPORA PAR CATEGORIE ====="
    );

    console.log(
        personne.prenom +
        " " +
        personne.nom
    );

    console.log(
        "Catégorie : " +
        categorie
    );


    if (
        publicationsFiltrees.length === 0
    ) {

        console.log(
            "Aucune publication dans cette catégorie."
        );

        return;
    }


    for (
        const publication
        of publicationsFiltrees
    ) {

        const organisation =
            trouverOrganisationParId(
                publication.organisationId
            );

        console.log("");
        console.log(
            "--------------------------------"
        );

        console.log(
            "[" +
            organisation.type +
            "] [" +
            publication.categorie +
            "] [" +
            publication.priorite +
            "]"
        );

        console.log(
            "Publié par : " +
            organisation.nom
        );

        console.log(
            "Date : " +
            new Date(
                publication.datePublication
            ).toLocaleDateString(
                "fr-FR"
            )
        );

        console.log(
            "Audience : " +
            publication.audienceType
        );

        if (
            publication.audienceValeur !== null &&
            publication.audienceValeur !== undefined
        ) {

            console.log(
                "Cible : " +
                publication.audienceValeur
            );
        }

        console.log("");

        console.log(
            publication.titre
        );

        console.log(
            publication.contenu
        );


        if (
            publication.medias !== undefined &&
            publication.medias.length > 0
        ) {

            console.log(
                "Médias :"
            );

            for (
                const media
                of publication.medias
            ) {

                console.log(
                    "- " +
                    media.type +
                    " | " +
                    media.nom +
                    " | " +
                    media.url
                );
            }
        }
    }
}
function afficherEspaceConsulat(organisationId) {

    const organisation =
        trouverOrganisationParId(
            organisationId
        );

    if (organisation === undefined) {

        console.log(
            "Organisation introuvable."
        );

        return;
    }


    const requetesOrganisation =
        requetes.filter(
            requete =>
                requete.organisationId === organisationId
        );


    const publicationsOrganisation =
        publications.filter(
            publication =>
                publication.organisationId === organisationId &&
                publication.statut === "PUBLIEE"
        );


    const alertesUrgentes =
        publicationsOrganisation.filter(
            publication =>
                publication.priorite === "URGENTE"
        );


    const demandesEnAttente =
        requetesOrganisation.filter(
            requete =>
                requete.statut === "EN_ATTENTE" ||
                requete.statut === "NOUVELLE"
        );


    const demandesPrisesEnCharge =
        requetesOrganisation.filter(
            requete =>
                requete.statut === "PRISE_EN_CHARGE" ||
                requete.statut === "EN_COURS"
        );


    const demandesTraitees =
        requetesOrganisation.filter(
            requete =>
                requete.statut === "TRAITEE" ||
                requete.statut === "REPONDUE" ||
                requete.statut === "CLOTUREE"
        );


    const profilsAutorisesConsulat =
        autorisationsPartageProfil.filter(
            autorisation =>
                autorisation.typeDestinataire === "CONSULAT" &&
                autorisation.autorise === true
        );


    const associations =
        organisations.filter(
            organisation =>
                organisation.type === "ASSOCIATION"
        );


    console.log("");
    console.log(
        "======================================"
    );

    console.log(
        "===== ESPACE CONSULAT ====="
    );

    console.log(
        "======================================"
    );

    console.log("");

    console.log(
        organisation.nom
    );

    console.log("");

    console.log(
        "===== DEMANDES ====="
    );

    console.log(
        "Demandes reçues : " +
        requetesOrganisation.length
    );

    console.log(
        "Demandes en attente : " +
        demandesEnAttente.length
    );

    console.log(
        "Demandes prises en charge : " +
        demandesPrisesEnCharge.length
    );

    console.log(
        "Demandes traitées : " +
        demandesTraitees.length
    );


    console.log("");
    console.log(
        "===== COMMUNICATION ====="
    );

    console.log(
        "Publications : " +
        publicationsOrganisation.length
    );

    console.log(
        "Alertes urgentes : " +
        alertesUrgentes.length
    );


    console.log("");
    console.log(
        "===== DIASPORA ====="
    );

    console.log(
        "Profils diaspora : " +
        profilsDiaspora.length
    );

    console.log(
        "Profils autorisés visibles : " +
        profilsAutorisesConsulat.length
    );


    console.log("");
    console.log(
        "===== ASSOCIATIONS ====="
    );

    console.log(
        "Associations connues : " +
        associations.length
    );

    console.log(
        "======================================"
    );
}

function modifierCiblageDiffusionDiaspora(
    publicationId,
    personneId,
    nouvelAudienceType,
    nouvelleAudienceValeur
) {

    const organisationSateer =
        organisations.find(
            organisation =>
                organisation.type === "SATEER"
        );


    if (
        organisationSateer === undefined
    ) {

        console.log(
            "Organisation SATEER introuvable."
        );

        return;
    }


    const autorise =
        aPermission(
            personneId,
            "GERER_DIFFUSION_DIASPORA",
            organisationSateer.id
        );


    if (autorise === false) {

        console.log(
            "Permission refusée : seuls les agents SATEER peuvent modifier le ciblage Diaspora."
        );

        return;
    }


    const publication =
        publications.find(
            publication =>
                publication.id === publicationId
        );


    if (
        publication === undefined
    ) {

        console.log(
            "Publication introuvable."
        );

        return;
    }


    if (
        publication.statutDiffusionDiaspora !==
        "SOUMISE"
    ) {

        console.log(
            "Le ciblage ne peut être modifié que pour une publication SOUMISE."
        );

        return;
    }


    /*
        On conserve l'audience proposée
        initialement par l'organisation.
    */

    if (
        publication.audienceTypeProposee ===
        undefined
    ) {

        publication.audienceTypeProposee =
            publication.audienceType;

        publication.audienceValeurProposee =
            publication.audienceValeur;
    }


    publication.audienceType =
        nouvelAudienceType;

    publication.audienceValeur =
        nouvelleAudienceValeur;

    publication.ciblageModifieParSateer =
        personneId;

    publication.dateModificationCiblage =
        new Date();


    const personnesCiblees =
        trouverPersonnesCiblees(
            nouvelAudienceType,
            nouvelleAudienceValeur
        );


    console.log("");

    console.log(
        "===== MODIFICATION CIBLAGE SATEER ====="
    );

    console.log(
        "Publication : " +
        publication.titre
    );

    console.log(
        "Audience proposée initialement : " +
        publication.audienceTypeProposee
    );


    if (
        publication.audienceValeurProposee !== null &&
        publication.audienceValeurProposee !== undefined
    ) {

        console.log(
            "Cible proposée initialement : " +
            publication.audienceValeurProposee
        );
    }


    console.log(
        "Nouvelle audience : " +
        publication.audienceType
    );


    if (
        publication.audienceValeur !== null &&
        publication.audienceValeur !== undefined
    ) {

        console.log(
            "Nouvelle cible : " +
            publication.audienceValeur
        );
    }


    console.log(
        "Personnes désormais ciblées : " +
        personnesCiblees.length
    );


    return publication;
}

function afficherEspaceSateerCommunication(
    personneId
) {

    const organisationSateer =
        organisations.find(
            organisation =>
                organisation.type === "SATEER"
        );


    if (
        organisationSateer === undefined
    ) {

        console.log(
            "Organisation SATEER introuvable."
        );

        return;
    }


    const autorise =
        aPermission(
            personneId,
            "GERER_DIFFUSION_DIASPORA",
            organisationSateer.id
        );


    if (autorise === false) {

        console.log(
            "Accès refusé à l'Espace SATEER Communication."
        );

        return;
    }


    const soumises =
        publications.filter(
            publication =>
                publication.statutDiffusionDiaspora ===
                "SOUMISE"
        );


    const diffusees =
        publications.filter(
            publication =>
                publication.statutDiffusionDiaspora ===
                "DIFFUSEE"
        );


    const rejetees =
        publications.filter(
            publication =>
                publication.statutDiffusionDiaspora ===
                "REJETEE"
        );


    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "===== ESPACE SATEER COMMUNICATION ====="
    );

    console.log(
        "=========================================="
    );

    console.log("");

    console.log(
        "Soumissions à examiner : " +
        soumises.length
    );

    console.log(
        "Publications diffusées : " +
        diffusees.length
    );

    console.log(
        "Publications rejetées : " +
        rejetees.length
    );


    if (
        soumises.length > 0
    ) {

        console.log("");

        console.log(
            "===== À EXAMINER ====="
        );


        for (
            const publication
            of soumises
        ) {

            const organisationSource =
                trouverOrganisationParId(
                    publication.organisationId
                );


            console.log("");

            console.log(
                "--------------------------------"
            );

            console.log(
                "ID publication : " +
                publication.id
            );

            console.log(
                "Source : " +
                organisationSource.nom
            );

            console.log(
                "Titre : " +
                publication.titre
            );

            console.log(
                "Catégorie : " +
                publication.categorie
            );

            console.log(
                "Priorité : " +
                publication.priorite
            );

            console.log(
                "Audience proposée : " +
                publication.audienceType
            );


            if (
                publication.audienceValeur !==
                null &&
                publication.audienceValeur !==
                undefined
            ) {

                console.log(
                    "Cible : " +
                    publication.audienceValeur
                );
            }


            console.log(
                "Statut : SOUMISE"
            );
        }
    }


    if (
        rejetees.length > 0
    ) {

        console.log("");

        console.log(
            "===== REJETÉES ====="
        );


        for (
            const publication
            of rejetees
        ) {

            const organisationSource =
                trouverOrganisationParId(
                    publication.organisationId
                );


            console.log("");

            console.log(
                "--------------------------------"
            );

            console.log(
                "ID publication : " +
                publication.id
            );

            console.log(
                "Source : " +
                organisationSource.nom
            );

            console.log(
                "Titre : " +
                publication.titre
            );

            console.log(
                "Motif du rejet : " +
                publication.motifRejetDiaspora
            );

            console.log(
                "Statut : REJETEE"
            );
        }
    }


    if (
        diffusees.length > 0
    ) {

        console.log("");

        console.log(
            "===== DIFFUSÉES ====="
        );


        for (
            const publication
            of diffusees
        ) {

            const organisationSource =
                trouverOrganisationParId(
                    publication.organisationId
                );


            console.log("");

            console.log(
                "--------------------------------"
            );

            console.log(
                "ID publication : " +
                publication.id
            );

            console.log(
                "Source : " +
                organisationSource.nom
            );

            console.log(
                "Titre : " +
                publication.titre
            );

            console.log(
                "Audience : " +
                publication.audienceType
            );

            console.log(
                "Priorité : " +
                publication.priorite
            );

            console.log(
                "Statut : DIFFUSEE"
            );
        }
    }


    console.log("");

    console.log(
        "=========================================="
    );
}
module.exports = {
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
    trouverPersonnesCiblees,
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
    afficherMonAmbassade,
    afficherDiaspora,
    afficherFilDiasporaParCategorie,
    ouvrirExperience,
    afficherMonProfilDiaspora,
    modifierAutorisationPartageProfil,
    afficherProfilsDiasporaAutorisesPourConsulat,
    afficherTableauBordDiasporaConsulat,
    rechercherProfilsDiasporaParCompetence,
    creerEvenement,
    afficherAgendaDiaspora,
    afficherEspaceConsulat,
    soumettrePublicationADiaspora,
    approuverDiffusionDiaspora,
    rejeterDiffusionDiaspora,
    afficherEspaceSateerCommunication,
    modifierCiblageDiffusionDiaspora
    
};

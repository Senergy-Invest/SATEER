

const organisations = [
    {
        id: 1,
        nom: "Consulat du Sénégal à Bordeaux",
        type: "CONSULAT",
        pays: "France"
    },
    {
        id: 2,
        nom: "Ambassade du Sénégal en France",
        type: "AMBASSADE",
        pays: "France"
    },
    {
        id: 3,
        nom: "SONAGED",
        type: "ENTREPRISE_PUBLIQUE",
        pays: "Sénégal"
    },
    {
        id: 4,
        nom: "Association des Étudiants Sénégalais de Bordeaux",
        type: "ASSOCIATION",
        pays: "France"
    },
    {
    id: 5,
    nom: "SATEER France",
    type: "SATEER"
    }
];

const personnes = [
    {
        id: 1,
        prenom: "Fatou",
        nom: "Ndiaye",
        pays: "France",
        departement: "Gironde",
        profil: "ETUDIANT",
        competences: [
            "INFORMATIQUE",
            "DATA"
    ]
    },
    {
        id: 2,
        prenom: "Mamadou",
        nom: "Diop",
        pays: "France",
        departement: "Haute-Garonne",
        profil: "ENTREPRENEUR",
        competences: [
            "COMMERCE",
            "GESTION"
    ]
},
    {
        id: 3,
        prenom: "Awa",
        nom: "Fall",
        pays: "France",
        departement: "Gironde",
        profil: "AGENT_CONSULAIRE",
        competences: [
        "ADMINISTRATION",
        "RELATION_USAGER"
]
        
    },
    {
        id: 4,
        prenom: "Ibrahima",
        nom: "Sarr",
        pays: "France",
        profil: "AUTRE"
    },
    {
        id: 5,
        prenom: "Aminata",
        nom: "Ba",
        pays: "France",
        profil: "AUTRE"
    },
    {
        id: 6,
        prenom: "Agent",
        nom: "SATEER",
        paysResidence: "France",
        departement: "Gironde",
        profil: "AGENT_SATEER",
        competences: [
            "COMMUNICATION",
            "DIASPORA"
    ]
}
];

const relationsPersonneOrganisation = [
    {
        id: 1,
        personneId: 1,
        organisationId: 1,
        type: "USAGER"
    },
    {
        id: 2,
        personneId: 2,
        organisationId: 1,
        type: "USAGER"
    },
    {
        id: 3,
        personneId: 3,
        organisationId: 1,
        type: "AGENT"
    },
    {
        id: 4,
        personneId: 4,
        organisationId: 2,
        type: "AGENT"
    },
    {
        id: 5,
        personneId: 5,
        organisationId: 1,
        type: "RESPONSABLE"
    },
    {
        id: 6,
        personneId: 1,
        organisationId: 4,
        type: "MEMBRE"
    },
    {
        personneId: 6,
        organisationId: 5,
        type: "AGENT_SATEER"
    }
];

const dossiers = [
    {
        id: 1,
        personneId: 1,
        organisationId: 1,
        type: "DEMANDE_CARTE_CONSULAIRE",
        statut: "BROUILLON"
    },
    {
        id: 2,
        personneId: 2,
        organisationId: 1,
        type: "DEMANDE_PASSEPORT",
        statut: "SOUMIS"
    }
];

const historiqueDossiers = [];

const demandesPieces = [];

const documents = [];

const permissionsParRole = {
    USAGER: [
        "CREER_DOSSIER",
        "VOIR_SES_DOSSIERS",
        "SOUMETTRE_DOSSIER"
    ],

    AGENT: [
        "VOIR_DOSSIERS_ORGANISATION",
        "TRAITER_DOSSIER",
        "PUBLIER_INFORMATION"
    ],

    RESPONSABLE: [
        "VOIR_DOSSIERS_ORGANISATION",
        "TRAITER_DOSSIER",
        "GERER_AGENTS",
        "PUBLIER_INFORMATION"
    ],
    
    AGENT_SATEER: [
    "GERER_DIFFUSION_DIASPORA"
    ]
};


const experiences = [
    {
        id: 1,
        code: "MON_CONSULAT",
        nom: "Mon Consulat",
        active: true
    },
    {
        id: 2,
        code: "MON_AMBASSADE",
        nom: "Mon Ambassade",
        active: true
    },
    {
        id: 3,
        code: "DIASPORA",
        nom: "Diaspora",
        active: true
    },
    {
        id: 4,
        code: "SUNU_COURANT",
        nom: "SUNU Courant",
        active: true
    }
];

const activationsExperiences = [
    {
        id: 1,
        personneId: 1,
        experienceId: 1,
        statut: "ACTIVE"
    },
    {
        id: 2,
        personneId: 1,
        experienceId: 2,
        statut: "ACTIVE"
    },
    {
        id: 3,
        personneId: 1,
        experienceId: 3,
        statut: "ACTIVE"
    },
    {
    id: 4,
    personneId: 2,
    experienceId: 1,
    statut: "ACTIVE"
    }
];

const publications = [
    {
        id: 1,
        organisationId: 1,
        titre: "Bienvenue dans Mon Consulat",
        contenu:
            "Retrouvez ici les informations officielles du Consulat du Sénégal à Bordeaux.",
        audienceType: "TOUS",
        audienceValeur: null,
        categorie: "INFORMATION",
        priorite: "NORMALE",
        statut: "PUBLIEE",
        datePublication: new Date()
    },
    {
        id: 2,
        organisationId: 1,
        titre: "Information importante",
        contenu:
            "Le Consulat peut désormais diffuser ses informations directement dans SATEER.",
        audienceType: "TOUS",
        audienceValeur: null,
        categorie: "INFORMATION",
        priorite: "NORMALE",
        statut: "PUBLIEE",
        datePublication: new Date()
    }
];

const requetes = [];

const reponsesRequetes = [];
const notifications = [];

const profilsDiaspora = [
    {
        id: 1,
        personneId: 1,

        titreProfessionnel:
            "Étudiante en informatique et data",

        presentation:
            "Étudiante intéressée par l'informatique, la data et les projets utiles au Sénégal.",

        competences: [
            "INFORMATIQUE",
            "DATA"
        ],

        formations: [
            "Formation en informatique"
        ],

        experiencesProfessionnelles: [],

        langues: [
            "FRANCAIS",
            "WOLOF"
        ],

        disponiblePourContribuer: true
    },

    {
        id: 2,
        personneId: 2,

        titreProfessionnel:
            "Entrepreneur",

        presentation:
            "Entrepreneur intéressé par le commerce et le développement de projets.",

        competences: [
            "COMMERCE",
            "GESTION"
        ],

        formations: [],

        experiencesProfessionnelles: [],

        langues: [
            "FRANCAIS",
            "WOLOF"
        ],

        disponiblePourContribuer: true
    }
];


const autorisationsPartageProfil = [
    {
        id: 1,
        personneId: 1,
        typeDestinataire: "CONSULAT",
        autorise: false
    },
    {
        id: 2,
        personneId: 1,
        typeDestinataire: "AMBASSADE",
        autorise: false
    }
];
const evenements = [];
module.exports = {
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
};


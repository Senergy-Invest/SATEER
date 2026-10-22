const organisations = [
    {
        nom: "Consulat du Sénégal à Bordeaux",
        type: "CONSULAT",
        pays: "France"
    },
    {
        nom: "Ambassade de Senegal en France",
        type: "AMBASSADE",
        pays: "France"
    },
    {
        nom: "SONAGED",
        type: " ENTREPRISE_PUBLIQUE",
        pays: "Sénégal"
    }
];


function obtenirTypeOrganisation(organisation) {
    if(organisation.type === "CONSULAT") {
       return  "un consulat";
    } else if(organisation.type === "AMBASSADE") {
        return "une ambassade";

    } else {
        return "un autre type d'organisation";
    }
}


for (const organisation of organisations) {
  const resultat = estAusenegal(organisation);
  console.log(organisation.nom + " : " + resultat);
}
function estAusenegal(organisation) {
    return organisation.pays === "Sénégal";
}
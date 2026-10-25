const params =
    new URLSearchParams(
        window.location.search
    );


const organisationId =
    Number(
        params.get("organisation")
        || 1
    );


const tenant =
    params.get("tenant")
    || "SN";


async function chargerDashboard() {

    try {

        const reponse =
            await fetch(
                `/api/organisations/${organisationId}/dashboard-operationnel?tenant=${tenant}`
            );


        const donnees =
            await reponse.json();


        if (!reponse.ok) {

            throw new Error(
                donnees.erreur
                || "Impossible de charger le dashboard."
            );
        }


        afficherDashboard(
            donnees
        );

    } catch (erreur) {

        console.error(
            "Erreur dashboard Vice-Consul :",
            erreur
        );
    }
}


function afficherDashboard(
    donnees
) {

    document.getElementById(
        "organisationNom"
    ).textContent =
        donnees.organisation.nom;


    document.getElementById(
        "kpiNouvelles"
    ).textContent =
        donnees.demandes.nouvelles;


    document.getElementById(
        "kpiEnCours"
    ).textContent =
        donnees.demandes.en_cours;


    document.getElementById(
        "kpiTraitees"
    ).textContent =
        donnees.demandes.traitees;


    document.getElementById(
        "kpiSurveillance"
    ).textContent =
        donnees.demandesASurveiller.length;


    const heures =
        Number(
            donnees.delaiTraitement.heures_moyennes
        );


    document.getElementById(
        "kpiDelai"
    ).textContent =
        Number.isFinite(heures)
            ? `${heures.toFixed(2)} h`
            : "—";


    document.getElementById(
        "kpiUsagers"
    ).textContent =
        donnees.diaspora.total_usagers;


    afficherDernieresDemandes(
        donnees.activiteRecente.demandes
    );


    afficherSurveillance(
        donnees.demandesASurveiller
    );


    afficherTerritoires(
        donnees.territoires
    );


    afficherPublications(
        donnees.publications
    );
}


function afficherDernieresDemandes(
    demandes
) {

    const container =
        document.getElementById(
            "dernieresDemandes"
        );


    container.innerHTML =
        "";


    if (
        !demandes
        ||
        demandes.length === 0
    ) {

        container.innerHTML =
            "<p>Aucune demande récente.</p>";

        return;
    }


    demandes.forEach(
        (demande) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "dashboard-list-item";


            element.innerHTML = `
                <div>
                    <strong>${demande.objet}</strong>
                    <span>
                        ${demande.prenom} ${demande.nom}
                    </span>
                </div>

                <span class="dashboard-status">
                    ${demande.statut}
                </span>
            `;


            container.appendChild(
                element
            );
        }
    );
}


function afficherSurveillance(
    demandes
) {

    const container =
        document.getElementById(
            "demandesSurveillance"
        );


    container.innerHTML =
        "";


    if (
        !demandes
        ||
        demandes.length === 0
    ) {

        container.innerHTML =
            `
            <div class="dashboard-empty">
                ✓ Aucun dossier nécessitant
                une surveillance particulière.
            </div>
            `;

        return;
    }


    demandes.forEach(
        (demande) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "dashboard-list-item";


            element.innerHTML = `
                <div>
                    <strong>${demande.objet}</strong>

                    <span>
                        ${demande.prenom} ${demande.nom}
                        • ${demande.territoire}
                    </span>
                </div>

                <span class="dashboard-status">
                    ${demande.priorite}
                </span>
            `;


            container.appendChild(
                element
            );
        }
    );
}


function afficherTerritoires(
    territoires
) {

    const container =
        document.getElementById(
            "territoiresContainer"
        );


    container.innerHTML =
        "";


    territoires.forEach(
        (territoire) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "dashboard-list-item";


            element.innerHTML = `
                <strong>
                    ${territoire.territoire}
                </strong>

                <span>
                    ${territoire.personnes} usager(s)
                </span>
            `;


            container.appendChild(
                element
            );
        }
    );
}


function afficherPublications(
    publications
) {

    const container =
        document.getElementById(
            "publicationsResume"
        );


    container.innerHTML =
        `
        <div class="dashboard-list-item">
            <span>Publications totales</span>
            <strong>${publications.total}</strong>
        </div>

        <div class="dashboard-list-item">
            <span>Publiées</span>
            <strong>${publications.publiees}</strong>
        </div>

        <div class="dashboard-list-item">
            <span>Importantes</span>
            <strong>${publications.importantes}</strong>
        </div>

        <div class="dashboard-list-item">
            <span>Urgentes</span>
            <strong>${publications.urgentes}</strong>
        </div>

        <div class="dashboard-list-item">
            <span>Diffusées Diaspora</span>
            <strong>${publications.diffusees_diaspora}</strong>
        </div>
        `;
}


chargerDashboard();
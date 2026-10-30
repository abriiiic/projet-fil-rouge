const client = window.supabaseClient;

let monId = null;
let monPseudo = '';
let monEmail = '';
let maPhotoUrl = null;

const banniereImage = document.getElementById('banniere-image');
const banniereInput = document.getElementById('banniere-input');
const avatarElement = document.getElementById('avatar');
const photoInput = document.getElementById('photo-input');
const pseudoElement = document.getElementById('pseudo');
const emailElement = document.getElementById('email');
const bioForm = document.getElementById('bio-form');
const bioInput = document.getElementById('bio');
const bioCompteur = document.getElementById('bio-compteur');
const statutElement = document.getElementById('statut');

const pseudoForm = document.getElementById('pseudo-form');
const pseudoInput = document.getElementById('nouveau-pseudo');
const pseudoStatut = document.getElementById('pseudo-statut');

const emailForm = document.getElementById('email-form');
const emailInput = document.getElementById('nouvel-email');
const emailStatut = document.getElementById('email-statut');

const mdpForm = document.getElementById('mdp-form');
const mdpActuel = document.getElementById('mdp-actuel');
const mdpNouveau = document.getElementById('mdp-nouveau');
const mdpConfirmation = document.getElementById('mdp-confirmation');
const mdpStatut = document.getElementById('mdp-statut');


async function demarrer() {
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
        window.location.href = 'connexion.html';
        return;
    }

    monId = user.id;
    monEmail = user.email;
    emailElement.textContent = user.email;
    emailInput.value = user.email;

    const { data, error } = await client
        .from('membre')
        .select('pseudo, bio, photo_url, banniere_url')
        .eq('id', monId)
        .single();

    if (error) {
        console.error("Erreur profil :", error.message);
        pseudoElement.textContent = "Profil introuvable";
        return;
    }

    monPseudo = data.pseudo;
    pseudoElement.textContent = data.pseudo;
    pseudoInput.value = data.pseudo;
    bioInput.value = data.bio || '';
    mettreAJourCompteur();
    afficherPhoto(data.photo_url);
    afficherBanniere(data.banniere_url);
}


function afficherPhoto(url) {
    maPhotoUrl = url;
    avatarElement.innerHTML = '';

    if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        avatarElement.appendChild(img);
    } else {
        avatarElement.textContent = monPseudo ? monPseudo[0].toUpperCase() : '?';
    }
}


function afficherBanniere(url) {
    if (!url) return;
    banniereImage.src = url;
    banniereImage.hidden = false;
}


function afficherStatut(element, texte, erreur) {
    element.textContent = texte;
    element.classList.toggle('profil__statut--erreur', erreur === true);
}


function mettreAJourCompteur() {
    bioCompteur.textContent = bioInput.value.length + ' / 300';
}


async function envoyerImage(fichier, colonne) {
    if (!fichier) return;

    if (!fichier.type.startsWith('image/')) {
        afficherStatut(statutElement, "Choisis un fichier image.", true);
        return;
    }

    if (fichier.size > 5 * 1024 * 1024) {
        afficherStatut(statutElement, "L'image ne doit pas dépasser 5 Mo.", true);
        return;
    }

    afficherStatut(statutElement, "Envoi de l'image...");
    photoInput.disabled = true;
    banniereInput.disabled = true;

    // un nom unique à chaque envoi (Date.now()) comme ça pas besoin des droits pour remplacer un fichier
    const chemin = monId + '/' + colonne + '-' + Date.now() + '.' + fichier.type.split('/')[1];

    const { error: erreurEnvoi } = await client.storage
        .from('profils')
        .upload(chemin, fichier);

    if (erreurEnvoi) {
        console.error("Erreur envoi image :", erreurEnvoi.message);
        afficherStatut(statutElement, "L'image n'a pas pu être envoyée.", true);
        photoInput.disabled = false;
        banniereInput.disabled = false;
        return;
    }

    const { data } = client.storage.from('profils').getPublicUrl(chemin);

    // colonne vaut 'photo_url' ou 'banniere_url' on met à jour la bonne
    const modification = {};
    modification[colonne] = data.publicUrl;

    const { error } = await client
        .from('membre')
        .update(modification)
        .eq('id', monId);

    photoInput.disabled = false;
    banniereInput.disabled = false;

    if (error) {
        console.error("Erreur profil :", error.message);
        afficherStatut(statutElement, "L'image n'a pas pu être enregistrée.", true);
        return;
    }

    if (colonne === 'photo_url') afficherPhoto(data.publicUrl);
    else afficherBanniere(data.publicUrl);

    afficherStatut(statutElement, "Image enregistrée !");
}


photoInput.addEventListener('change', () => {
    envoyerImage(photoInput.files[0], 'photo_url');
    // on vide le champ pour pouvoir rechoisir la même image juste après
    photoInput.value = '';
});

banniereInput.addEventListener('change', () => {
    envoyerImage(banniereInput.files[0], 'banniere_url');
    banniereInput.value = '';
});

bioInput.addEventListener('input', mettreAJourCompteur);

bioForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const bouton = bioForm.querySelector('button');
    bouton.disabled = true;

    const { error } = await client
        .from('membre')
        .update({ bio: bioInput.value.trim() })
        .eq('id', monId);

    bouton.disabled = false;

    if (error) {
        console.error("Erreur bio :", error.message);
        afficherStatut(statutElement, "La bio n'a pas pu être enregistrée.", true);
        return;
    }

    afficherStatut(statutElement, "Bio enregistrée !");
});


pseudoForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const pseudo = pseudoInput.value.trim();

    if (!pseudo) {
        afficherStatut(pseudoStatut, "Le pseudo ne peut pas être vide.", true);
        return;
    }

    if (pseudo === monPseudo) {
        afficherStatut(pseudoStatut, "C'est déjà ton pseudo.", true);
        return;
    }

    const bouton = pseudoForm.querySelector('button');
    bouton.disabled = true;

    try {
        const { data: existant } = await client
            .from('membre')
            .select('id')
            .eq('pseudo', pseudo)
            .maybeSingle();

        if (existant) {
            afficherStatut(pseudoStatut, "Ce pseudo est déjà pris.", true);
            return;
        }

        const { error } = await client
            .from('membre')
            .update({ pseudo: pseudo })
            .eq('id', monId);

        if (error) {
            console.error("Erreur pseudo :", error.message);
            // 23505 = la contrainte UNIQUE de la base a refusé (quelqu'un a pris le pseudo entre temps)
            afficherStatut(pseudoStatut, error.code === '23505' ? "Ce pseudo est déjà pris." : "Le pseudo n'a pas pu être modifié.", true);
            return;
        }

        monPseudo = pseudo;
        pseudoElement.textContent = pseudo;
        pseudoInput.value = pseudo;
        afficherPhoto(maPhotoUrl);
        afficherStatut(pseudoStatut, "Pseudo modifié !");
    } finally {
        bouton.disabled = false;
    }
});


emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();

    if (email === monEmail) {
        afficherStatut(emailStatut, "C'est déjà ton adresse mail.", true);
        return;
    }

    const bouton = emailForm.querySelector('button');
    bouton.disabled = true;

    // l'adresse ne change pas tout de suite : Supabase envoie un lien et attend qu'on clique dessus
    const { error } = await client.auth.updateUser(
        { email: email },
        { emailRedirectTo: window.location.origin + window.location.pathname }
    );

    bouton.disabled = false;

    if (error) {
        console.error("Erreur email :", error.message);
        afficherStatut(emailStatut, "L'adresse n'a pas pu être modifiée : " + error.message, true);
        return;
    }

    afficherStatut(emailStatut, "Un lien de confirmation a été envoyé. Clique dessus pour valider la nouvelle adresse (pense à vérifier aussi l'ancienne boîte mail).");
});


mdpForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (mdpNouveau.value !== mdpConfirmation.value) {
        afficherStatut(mdpStatut, "Les deux nouveaux mots de passe ne correspondent pas.", true);
        return;
    }

    if (mdpNouveau.value.length < 6) {
        afficherStatut(mdpStatut, "Le nouveau mot de passe doit faire au moins 6 caractères.", true);
        return;
    }

    const bouton = mdpForm.querySelector('button');
    bouton.disabled = true;

    try {
        // on se reconnecte avec l'ancien mot de passe juste pour vérifier qu'il est bon
        const { error: erreurVerification } = await client.auth.signInWithPassword({
            email: monEmail,
            password: mdpActuel.value
        });

        if (erreurVerification) {
            afficherStatut(mdpStatut, "Le mot de passe actuel est incorrect.", true);
            return;
        }

        const { error } = await client.auth.updateUser({ password: mdpNouveau.value });

        if (error) {
            console.error("Erreur mot de passe :", error.message);
            afficherStatut(mdpStatut, error.code === 'same_password' ? "Le nouveau mot de passe doit être différent de l'ancien." : "Le mot de passe n'a pas pu être modifié : " + error.message, true);
            return;
        }

        mdpForm.reset();
        afficherStatut(mdpStatut, "Mot de passe modifié !");
    } finally {
        bouton.disabled = false;
    }
});

demarrer();

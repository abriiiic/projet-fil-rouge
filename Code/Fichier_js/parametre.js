const client = window.supabaseClient;

let monId = null;
let monPseudo = '';

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


async function demarrer() {
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
        window.location.href = 'connexion.html';
        return;
    }

    monId = user.id;
    emailElement.textContent = user.email;

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
    bioInput.value = data.bio || '';
    mettreAJourCompteur();
    afficherPhoto(data.photo_url);
    afficherBanniere(data.banniere_url);
}


function afficherPhoto(url) {
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


function afficherStatut(texte, erreur) {
    statutElement.textContent = texte;
    statutElement.classList.toggle('profil__statut--erreur', erreur === true);
}


function mettreAJourCompteur() {
    bioCompteur.textContent = bioInput.value.length + ' / 300';
}


async function envoyerImage(fichier, colonne) {
    if (!fichier) return;

    if (!fichier.type.startsWith('image/')) {
        afficherStatut("Choisis un fichier image.", true);
        return;
    }

    if (fichier.size > 5 * 1024 * 1024) {
        afficherStatut("L'image ne doit pas dépasser 5 Mo.", true);
        return;
    }

    afficherStatut("Envoi de l'image...");
    photoInput.disabled = true;
    banniereInput.disabled = true;

    const chemin = monId + '/' + colonne + '-' + Date.now() + '.' + fichier.type.split('/')[1];

    const { error: erreurEnvoi } = await client.storage
        .from('profils')
        .upload(chemin, fichier);

    if (erreurEnvoi) {
        console.error("Erreur envoi image :", erreurEnvoi.message);
        afficherStatut("L'image n'a pas pu être envoyée.", true);
        photoInput.disabled = false;
        banniereInput.disabled = false;
        return;
    }

    const { data } = client.storage.from('profils').getPublicUrl(chemin);

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
        afficherStatut("L'image n'a pas pu être enregistrée.", true);
        return;
    }

    if (colonne === 'photo_url') afficherPhoto(data.publicUrl);
    else afficherBanniere(data.publicUrl);

    afficherStatut("Image enregistrée !");
}


photoInput.addEventListener('change', () => {
    envoyerImage(photoInput.files[0], 'photo_url');
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
        afficherStatut("La bio n'a pas pu être enregistrée.", true);
        return;
    }

    afficherStatut("Bio enregistrée !");
});

demarrer();

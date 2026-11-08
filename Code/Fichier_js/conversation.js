const client = window.supabaseClient;

let monId = null;
let favorisConversations = new Set();

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];
const reactionsParMessage = {};

// reaction(...) ramène les réactions de chaque message dans la même requête
const CHAMPS_MESSAGE = 'id, auteur_id, contenu, image_url, date_envoi, reaction(membre_id, emoji)';

let canalMessages = null;
let conversationChargee = null;

const monPseudoElement = document.getElementById('mon-pseudo');
const monAvatarElement = document.getElementById('mon-avatar');
const listeConversations = document.getElementById('liste-conversations');
const rechercheConversations = document.getElementById('recherche-conversations');
const conversationElement = document.getElementById('conversation');
const contactNameElement = document.getElementById('contact-name');
const contactAvatarElement = document.getElementById('contact-avatar');
const contactBouton = document.getElementById('contact-bouton');
const profilDialog = document.getElementById('profil-dialog');
const profilBanniere = document.getElementById('profil-banniere');
const profilAvatar = document.getElementById('profil-avatar');
const profilPseudo = document.getElementById('profil-pseudo');
const profilBio = document.getElementById('profil-bio');
const profilFermer = document.getElementById('profil-fermer');
const boutonDeconnexion = document.getElementById('deconnexion');
const boutonNouvelle = document.getElementById('nouvelle-conversation');
const nouvelleDialog = document.getElementById('nouvelle-dialog');
const nouvelleFermer = document.getElementById('nouvelle-fermer');
const nouvelleRecherche = document.getElementById('nouvelle-recherche');
const nouvelleResultats = document.getElementById('nouvelle-resultats');

let minuteurRecherche = null;

let contactActuel = null;
const messagesElement = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const boutonEnvoyer = document.getElementById('send-message');
const photoMessageInput = document.getElementById('photo-message');
const apercuElement = document.getElementById('apercu');
const apercuImage = document.getElementById('apercu-image');
const apercuRetirer = document.getElementById('apercu-retirer');

let imageAEnvoyer = null;

// Les favoris sont propres à chaque utilisateur et à cet appareil.
// Les identifiants sont stockés en texte pour rester cohérents avec localStorage.
function chargerFavoris() {
    try {
        const favoris = JSON.parse(localStorage.getItem(`favoris-conversations-${monId}`) || '[]');
        return new Set(Array.isArray(favoris) ? favoris.map(String) : []);
    } catch (error) {
        console.error("Erreur chargement favoris :", error);
        return new Set();
    }
}


function enregistrerFavoris() {
    try {
        localStorage.setItem(
            `favoris-conversations-${monId}`,
            JSON.stringify([...favorisConversations])
        );
    } catch (error) {
        console.error("Erreur enregistrement favoris :", error);
        alert("Le favori n'a pas pu être enregistré sur cet appareil.");
    }
}

// Filtre en temps réel les conversations déjà chargées, sans nouvelle requête Supabase.
function filtrerConversations() {
    const recherche = rechercheConversations.value.trim().toLocaleLowerCase();
    const boutons = listeConversations.querySelectorAll('.sidebar__conversation');
    let nombreVisible = 0;

    boutons.forEach(bouton => {
        const nom = bouton.querySelector('.sidebar__conversation-nom').textContent.toLocaleLowerCase();
        const visible = !recherche || nom.includes(recherche);
        bouton.closest('li').hidden = !visible;
        if (visible) nombreVisible++;
    });

    const ancienMessage = listeConversations.querySelector('.sidebar__recherche-vide');
    if (ancienMessage) ancienMessage.remove();

    if (boutons.length > 0 && nombreVisible === 0) {
        const message = document.createElement('li');
        message.className = 'sidebar__recherche-vide';
        message.textContent = 'Aucune conversation trouvée';
        listeConversations.appendChild(message);
    }
}


// une seule barre d'emojis pour toute la page, on la déplace au-dessus du message choisi
const picker = document.createElement('div');
picker.className = 'picker';
picker.hidden = true;
document.body.appendChild(picker);
let messageOuvert = null;


function initiale(pseudo) {
    return pseudo ? pseudo[0].toUpperCase() : '?';
}


function afficherAvatar(element, pseudo, photoUrl) {
    element.innerHTML = '';

    if (photoUrl) {
        const img = document.createElement('img');
        img.src = photoUrl;
        img.alt = '';
        element.appendChild(img);
    } else {
        element.textContent = initiale(pseudo);
    }
}


async function demarrer() {
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
        window.location.href = 'connexion.html';
        return;
    }

    monId = user.id;
    favorisConversations = chargerFavoris();
    await chargerMonPseudo();
    await chargerConversations();
    ecouterNouvellesConversations();
}


async function chargerMonPseudo() {
    const { data, error } = await client
        .from('membre')
        .select('pseudo, photo_url')
        .eq('id', monId)
        .single();

    if (error) {
        console.error("Erreur pseudo :", error.message);
        monPseudoElement.textContent = "Pseudo introuvable";
        return;
    }

    monPseudoElement.textContent = data.pseudo;
    afficherAvatar(monAvatarElement, data.pseudo, data.photo_url);
}


async function chargerConversations() {
    const { data: conversations, error } = await client
        .from('conversation')
        .select('id, membre1_id, membre2_id')
        // je peux être membre1 ou membre2 donc on cherche des deux côtés
        .or(`membre1_id.eq.${monId},membre2_id.eq.${monId}`)
        .order('id');

    if (error) {
        console.error("Erreur conversations :", error.message);
        listeConversations.innerHTML = '<li class="sidebar__vide">Erreur de chargement</li>';
        return;
    }

    if (conversations.length === 0) {
        listeConversations.innerHTML = '<li class="sidebar__vide">Aucune conversation</li>';
        return;
    }

    const autreId = (conversation) =>
        conversation.membre1_id === monId ? conversation.membre2_id : conversation.membre1_id;

    const { data: membres, error: erreurMembres } = await client
        .from('membre')
        .select('id, pseudo, photo_url')
        // le filter enlève les id vides, sinon la requête plante
        .in('id', conversations.map(autreId).filter(id => id));

    if (erreurMembres) {
        console.error("Erreur membres :", erreurMembres.message);
        listeConversations.innerHTML = '<li class="sidebar__vide">Erreur de chargement</li>';
        return;
    }

    listeConversations.innerHTML = '';

    // Les favoris sont affichés en premier, puis les autres conversations gardent
    // leur ordre initial basé sur l'identifiant.
    conversations
        .sort((a, b) => {
            const aEstFavorite = favorisConversations.has(String(a.id));
            const bEstFavorite = favorisConversations.has(String(b.id));
            if (aEstFavorite !== bEstFavorite) return bEstFavorite - aEstFavorite;
            return a.id - b.id;
        })
        .forEach(conversation => {
        const autre = membres.find(m => m.id === autreId(conversation));
        const contact = autre || { id: autreId(conversation), pseudo: 'Inconnu', photo_url: null };

        // Chaque ligne contient l'ouverture de la conversation et son action de suppression.
        const li = document.createElement('li');
        li.className = 'sidebar__conversation-ligne';
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'sidebar__conversation';
        bouton.dataset.conversationId = conversation.id;
        if (conversationElement.dataset.conversationId === String(conversation.id)) {
            bouton.classList.add('active');
            bouton.setAttribute('aria-current', 'true');
        }

        const avatar = document.createElement('span');
        avatar.className = 'conversation__avatar';
        afficherAvatar(avatar, contact.pseudo, contact.photo_url);

        const nom = document.createElement('span');
        nom.className = 'sidebar__conversation-nom';
        nom.textContent = contact.pseudo;

        bouton.appendChild(avatar);
        bouton.appendChild(nom);
        bouton.addEventListener('click', () => ouvrirConversation(conversation.id, contact, bouton));

        const boutonFavori = document.createElement('button');
        boutonFavori.type = 'button';
        boutonFavori.className = 'sidebar__favori';
        boutonFavori.setAttribute('aria-label', `${favorisConversations.has(String(conversation.id)) ? 'Retirer des' : 'Ajouter aux'} favoris : ${contact.pseudo}`);
        boutonFavori.addEventListener('click', (event) => {
            event.stopPropagation();
            basculerFavori(conversation.id, contact.pseudo, boutonFavori, li);
        });
        afficherEtatFavori(boutonFavori, conversation.id);

        // Le bouton est séparé pour éviter d'ouvrir la conversation en le supprimant.
        const boutonSupprimer = document.createElement('button');
        boutonSupprimer.type = 'button';
        boutonSupprimer.className = 'sidebar__supprimer';
        boutonSupprimer.textContent = '🗑️';
        boutonSupprimer.setAttribute('aria-label', `Supprimer la conversation avec ${contact.pseudo}`);
        boutonSupprimer.addEventListener('click', () => supprimerConversation(conversation.id, contact.pseudo, boutonSupprimer));

        li.appendChild(bouton);
        li.appendChild(boutonFavori);
        li.appendChild(boutonSupprimer);
        listeConversations.appendChild(li);
        });

    filtrerConversations();
}


function ecouterNouvellesConversations() {
    client
        .channel('conversations-' + monId)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'conversation',
            filter: 'membre2_id=eq.' + monId
        }, () => chargerConversations())
        .subscribe();
}


function ouvrirNouvelleConversation() {
    nouvelleRecherche.value = '';
    afficherInfoResultats("Tape un pseudo pour trouver quelqu'un.");
    nouvelleDialog.showModal();
    nouvelleRecherche.focus();
}


function afficherInfoResultats(texte) {
    nouvelleResultats.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'nouvelle-modal__info';
    li.textContent = texte;
    nouvelleResultats.appendChild(li);
}


async function chercherMembres() {
    const texte = nouvelleRecherche.value.trim();

    if (!texte) {
        afficherInfoResultats("Tape un pseudo pour trouver quelqu'un.");
        return;
    }

    const { data: membres, error } = await client
        .from('membre')
        .select('id, pseudo, photo_url')
        .ilike('pseudo', '%' + texte + '%')
        .neq('id', monId)
        .order('pseudo')
        .limit(10);

    if (nouvelleRecherche.value.trim() !== texte) return;

    if (error) {
        console.error("Erreur recherche membres :", error.message);
        afficherInfoResultats("La recherche a échoué.");
        return;
    }

    if (membres.length === 0) {
        afficherInfoResultats("Aucun membre trouvé");
        return;
    }

    nouvelleResultats.innerHTML = '';

    membres.forEach(membre => {
        const li = document.createElement('li');
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'nouvelle-modal__membre';

        const avatar = document.createElement('span');
        avatar.className = 'conversation__avatar';
        afficherAvatar(avatar, membre.pseudo, membre.photo_url);

        const nom = document.createElement('span');
        nom.textContent = membre.pseudo;

        bouton.appendChild(avatar);
        bouton.appendChild(nom);
        bouton.addEventListener('click', () => demarrerConversation(membre, bouton));

        li.appendChild(bouton);
        nouvelleResultats.appendChild(li);
    });
}


async function demarrerConversation(membre, bouton) {
    bouton.disabled = true;

    const { data: existantes, error: erreurExistantes } = await client
        .from('conversation')
        .select('id')
        .or(`and(membre1_id.eq.${monId},membre2_id.eq.${membre.id}),and(membre1_id.eq.${membre.id},membre2_id.eq.${monId})`)
        .limit(1);

    if (erreurExistantes) {
        console.error("Erreur conversation existante :", erreurExistantes.message);
        alert("La conversation n'a pas pu être créée.");
        bouton.disabled = false;
        return;
    }

    let conversationId = existantes.length > 0 ? existantes[0].id : null;

    if (!conversationId) {
        const { data: nouvelle, error } = await client
            .from('conversation')
            .insert({ membre1_id: monId, membre2_id: membre.id })
            .select('id')
            .single();

        if (error) {
            console.error("Erreur création conversation :", error.message);
            alert("La conversation n'a pas pu être créée.");
            bouton.disabled = false;
            return;
        }

        conversationId = nouvelle.id;
    }

    nouvelleDialog.close();
    rechercheConversations.value = '';
    await chargerConversations();

    const ligne = listeConversations.querySelector(`.sidebar__conversation[data-conversation-id="${conversationId}"]`);
    if (ligne) ligne.click();
}


function afficherEtatFavori(bouton, conversationId) {
    const estFavorite = favorisConversations.has(String(conversationId));
    bouton.textContent = estFavorite ? '★' : '☆';
    bouton.classList.toggle('sidebar__favori--actif', estFavorite);
    bouton.setAttribute('aria-pressed', String(estFavorite));
}


// Met à jour le favori localement puis réordonne les lignes sans recharger la page.
function basculerFavori(conversationId, pseudo, bouton, ligne) {
    const cle = String(conversationId);
    if (favorisConversations.has(cle)) {
        favorisConversations.delete(cle);
    } else {
        favorisConversations.add(cle);
    }

    enregistrerFavoris();
    afficherEtatFavori(bouton, conversationId);
    bouton.setAttribute(
        'aria-label',
        `${favorisConversations.has(cle) ? 'Retirer des' : 'Ajouter aux'} favoris : ${pseudo}`
    );

    const lignes = [...listeConversations.querySelectorAll('.sidebar__conversation-ligne')];
    lignes
        .sort((a, b) => {
            const aEstFavorite = a.querySelector('.sidebar__favori--actif') !== null;
            const bEstFavorite = b.querySelector('.sidebar__favori--actif') !== null;
            return bEstFavorite - aEstFavorite;
        })
        .forEach(element => listeConversations.appendChild(element));
}


async function supprimerConversation(conversationId, pseudo, bouton) {
    if (!window.confirm(`Supprimer la conversation avec ${pseudo} ? Cette action est irréversible.`)) return;

    bouton.disabled = true;

    // Les messages sont supprimés avant la conversation pour respecter la relation entre les tables.
    const { error: erreurMessages } = await client
        .from('message')
        .delete()
        .eq('conversation_id', conversationId);

    if (erreurMessages) {
        console.error("Erreur suppression messages :", erreurMessages.message);
        alert("La conversation n'a pas pu être supprimée.");
        bouton.disabled = false;
        return;
    }

    const { error } = await client
        .from('conversation')
        .delete()
        .eq('id', conversationId);

    if (error) {
        console.error("Erreur suppression conversation :", error.message);
        alert("La conversation n'a pas pu être supprimée.");
        bouton.disabled = false;
        return;
    }

    // Si la conversation affichée vient d'être supprimée, on remet l'interface à son état initial.
    if (conversationElement.dataset.conversationId === String(conversationId)) {
        fermerPicker();
        retirerImage();
        conversationElement.dataset.conversationId = '';
        contactActuel = null;
        contactBouton.disabled = true;
        contactNameElement.textContent = 'Choisissez une conversation';
        afficherAvatar(contactAvatarElement, '?', null);
        messagesElement.innerHTML = '';
    }

    await chargerConversations();
}


async function ouvrirConversation(conversationId, contact, bouton) {
    document.querySelectorAll('.sidebar__conversation').forEach(b => {
        b.classList.remove('active');
        b.removeAttribute('aria-current');
    });
    bouton.classList.add('active');
    bouton.setAttribute('aria-current', 'true');

    fermerPicker();
    // on ne garde pas une photo choisie pour une autre conversation
    retirerImage();
    conversationElement.dataset.conversationId = conversationId;
    conversationChargee = null;
    ecouterMessages(conversationId);
    contactActuel = contact;
    contactBouton.disabled = !contact.id;
    contactNameElement.textContent = contact.pseudo;
    afficherAvatar(contactAvatarElement, contact.pseudo, contact.photo_url);
    messagesElement.innerHTML = '';

    const { data: messages, error } = await client
        .from('message')
        .select(CHAMPS_MESSAGE)
        .eq('conversation_id', conversationId)
        .order('id');

    // si on a cliqué sur une autre conversation pendant le chargement on laisse tomber celle-ci
    if (conversationElement.dataset.conversationId !== String(conversationId)) return;

    if (error) {
        console.error("Erreur messages :", error.message);
        messagesElement.textContent = "Impossible de charger les messages";
        return;
    }

    // on revide juste avant d'afficher sinon un double clic affiche tout en double
    messagesElement.innerHTML = '';
    messages.forEach(afficherMessage);
    messagesElement.scrollTop = messagesElement.scrollHeight;

    conversationChargee = conversationId;
    chargerNouveauxMessages(conversationId);
}


function ecouterMessages(conversationId) {
    if (canalMessages) client.removeChannel(canalMessages);

    canalMessages = client
        .channel('messages-' + conversationId + '-' + Date.now())
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'message',
            filter: 'conversation_id=eq.' + conversationId
        }, () => chargerNouveauxMessages(conversationId))
        .subscribe((statut, erreur) => {
            if (statut === 'SUBSCRIBED') chargerNouveauxMessages(conversationId);
            if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') {
                console.error("Erreur temps réel :", erreur ? erreur.message : statut);
            }
        });
}


async function chargerNouveauxMessages(conversationId) {
    if (conversationChargee !== conversationId) return;

    const dernier = messagesElement.lastElementChild;

    const { data: messages, error } = await client
        .from('message')
        .select(CHAMPS_MESSAGE)
        .eq('conversation_id', conversationId)
        .gt('id', dernier ? Number(dernier.dataset.id) : 0)
        .order('id');

    if (error) {
        console.error("Erreur nouveaux messages :", error.message);
        return;
    }

    if (conversationChargee !== conversationId) return;

    const enBas = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight < 50;
    messages.forEach(afficherMessage);
    if (enBas) messagesElement.scrollTop = messagesElement.scrollHeight;
}


function afficherMessage(message) {
    if (!message.contenu && !message.image_url) return;
    // déjà à l'écran (ça arrive si on rouvre la conversation pendant un envoi)
    if (messagesElement.querySelector(`[data-id="${message.id}"]`)) return;

    const div = document.createElement('div');
    div.dataset.id = message.id;
    div.className = message.auteur_id === monId ? 'message message--sent' : 'message message--received';

    // on n'accepte que des liens https, sinon un lien "javascript:..." mis en base pourrait s'exécuter au clic
    if (message.image_url && message.image_url.startsWith('https://')) {
        const lien = document.createElement('a');
        lien.className = 'message__image-lien';
        lien.href = message.image_url;
        lien.target = '_blank';
        lien.rel = 'noopener';

        const img = document.createElement('img');
        img.className = 'message__image';
        img.src = message.image_url;
        img.alt = 'Photo envoyée';
        img.addEventListener('load', () => garderEnBas(img));

        lien.appendChild(img);
        div.appendChild(lien);
    }

    if (message.contenu) {
        const p = document.createElement('p');
        p.className = 'message__content';
        p.textContent = message.contenu;
        div.appendChild(p);
    }

    if (message.date_envoi) {
        const heure = document.createElement('span');
        heure.className = 'message__time';
        heure.textContent = formaterHeure(message.date_envoi);
        div.appendChild(heure);
    }

    const reactions = document.createElement('div');
    reactions.className = 'message__reactions';
    div.appendChild(reactions);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'message__plus';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Réagir au message');
    plus.addEventListener('click', (event) => {
        // sinon le clic remonte jusqu'au document qui referme la barre direct
        event.stopPropagation();
        ouvrirPicker(message.id, div);
    });
    div.appendChild(plus);

    reactionsParMessage[message.id] = message.reaction || [];
    messagesElement.appendChild(div);
    afficherReactions(message.id);
}


function afficherReactions(messageId) {
    const div = messagesElement.querySelector(`[data-id="${messageId}"]`);
    if (!div) return;

    const conteneur = div.querySelector('.message__reactions');
    const reactions = reactionsParMessage[messageId];

    const emojis = [];
    reactions.forEach(r => {
        if (!emojis.includes(r.emoji)) emojis.push(r.emoji);
    });

    conteneur.textContent = emojis.join('') + (reactions.length > 1 ? ' ' + reactions.length : '');
    conteneur.hidden = reactions.length === 0;
    div.classList.toggle('message--avec-reactions', reactions.length > 0);
}


function ouvrirPicker(messageId, bulle) {
    if (messageOuvert === messageId) {
        fermerPicker();
        return;
    }

    const mienne = reactionsParMessage[messageId].find(r => r.membre_id === monId);
    picker.innerHTML = '';

    EMOJIS.forEach(emoji => {
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'picker__emoji';
        if (mienne && mienne.emoji === emoji) bouton.classList.add('picker__emoji--actif');
        bouton.textContent = emoji;
        bouton.addEventListener('click', () => {
            fermerPicker();
            reagir(messageId, emoji);
        });
        picker.appendChild(bouton);
    });

    picker.hidden = false;
    messageOuvert = messageId;

    const rect = bulle.getBoundingClientRect();

    // au-dessus du message ou en dessous s'il n'y a pas la place sans jamais sortir de l'écran
    let top = rect.top - picker.offsetHeight - 8;
    if (top < 8) top = rect.bottom + 8;

    let left = bulle.classList.contains('message--sent') ? rect.right - picker.offsetWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - picker.offsetWidth - 8));

    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
}


function fermerPicker() {
    picker.hidden = true;
    messageOuvert = null;
}


document.addEventListener('click', (event) => {
    if (!picker.contains(event.target)) fermerPicker();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') fermerPicker();
});

messagesElement.addEventListener('scroll', fermerPicker);
window.addEventListener('resize', fermerPicker);


async function ouvrirProfil() {
    if (!contactActuel || !contactActuel.id) return;

    const contact = contactActuel;

    profilPseudo.textContent = contact.pseudo;
    afficherAvatar(profilAvatar, contact.pseudo, contact.photo_url);
    profilBanniere.hidden = true;
    profilBio.textContent = "Chargement...";
    profilBio.classList.add('profil-modal__bio--vide');
    profilDialog.showModal();

    const { data, error } = await client
        .from('membre')
        .select('pseudo, bio, photo_url, banniere_url')
        .eq('id', contact.id)
        .single();

    if (contactActuel !== contact) return;

    if (error) {
        console.error("Erreur profil :", error.message);
        profilBio.textContent = "Impossible de charger le profil.";
        return;
    }

    profilPseudo.textContent = data.pseudo;
    afficherAvatar(profilAvatar, data.pseudo, data.photo_url);

    if (data.banniere_url) {
        profilBanniere.src = data.banniere_url;
        profilBanniere.hidden = false;
    }

    profilBio.textContent = data.bio || "Pas encore de bio.";
    profilBio.classList.toggle('profil-modal__bio--vide', !data.bio);
}


contactBouton.addEventListener('click', ouvrirProfil);

profilFermer.addEventListener('click', () => profilDialog.close());

profilDialog.addEventListener('click', (event) => {
    // un clic sur le fond gris autour de la carte tombe directement sur le dialog
    if (event.target === profilDialog) profilDialog.close();
});


boutonDeconnexion.addEventListener('click', async () => {
    boutonDeconnexion.disabled = true;

    const { error } = await client.auth.signOut();

    if (error) {
        console.error("Erreur déconnexion :", error.message);
        alert("La déconnexion a échoué.");
        boutonDeconnexion.disabled = false;
        return;
    }

    window.location.href = 'connexion.html';
});


async function reagir(messageId, emoji) {
    const mienne = reactionsParMessage[messageId].find(r => r.membre_id === monId);
    // recliquer sur sa propre réaction = on l'enlève
    const retirer = mienne && mienne.emoji === emoji;

    const { error } = retirer
        ? await client
            .from('reaction')
            .delete()
            .eq('message_id', messageId)
            .eq('membre_id', monId)
        : await client
            .from('reaction')
            // upsert remplace mon ancienne réaction s'il y en avait une (une seule par message)
            .upsert({ message_id: messageId, membre_id: monId, emoji: emoji });

    if (error) {
        console.error("Erreur réaction :", error.message);
        alert("La réaction n'a pas pu être enregistrée.");
        return;
    }

    const autres = reactionsParMessage[messageId].filter(r => r.membre_id !== monId);
    reactionsParMessage[messageId] = retirer ? autres : autres.concat({ membre_id: monId, emoji: emoji });

    afficherReactions(messageId);
}


// la date est stockée en UTC, toLocale... la remet à l'heure de l'utilisateur
function formaterHeure(dateEnvoi) {
    const date = new Date(dateEnvoi);
    if (isNaN(date)) return '';

    const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (date.toDateString() === new Date().toDateString()) return heure;

    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + heure;
}


// une image qui finit de charger agrandit la bulle : on redescend si on était déjà en bas
function garderEnBas(img) {
    const distanceDuBas = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight;
    if (distanceDuBas <= img.offsetHeight + 50) messagesElement.scrollTop = messagesElement.scrollHeight;
}


function retirerImage() {
    // l'aperçu utilise une adresse temporaire en mémoire, on la libère
    if (apercuImage.src) URL.revokeObjectURL(apercuImage.src);
    apercuImage.removeAttribute('src');
    apercuElement.hidden = true;
    imageAEnvoyer = null;
}


photoMessageInput.addEventListener('change', () => {
    const fichier = photoMessageInput.files[0];
    // on vide le champ pour pouvoir rechoisir la même photo juste après
    photoMessageInput.value = '';

    if (!fichier) return;

    if (!fichier.type.startsWith('image/')) {
        alert("Choisis un fichier image.");
        return;
    }

    if (fichier.size > 5 * 1024 * 1024) {
        alert("L'image ne doit pas dépasser 5 Mo.");
        return;
    }

    retirerImage();
    imageAEnvoyer = fichier;
    // aperçu direct depuis l'ordi, rien n'est envoyé à Supabase avant de cliquer sur envoyer
    apercuImage.src = URL.createObjectURL(fichier);
    apercuElement.hidden = false;
    messageInput.focus();
});

apercuRetirer.addEventListener('click', retirerImage);
rechercheConversations.addEventListener('input', filtrerConversations);

boutonNouvelle.addEventListener('click', ouvrirNouvelleConversation);

nouvelleFermer.addEventListener('click', () => nouvelleDialog.close());

nouvelleDialog.addEventListener('click', (event) => {
    if (event.target === nouvelleDialog) nouvelleDialog.close();
});

nouvelleRecherche.addEventListener('input', () => {
    clearTimeout(minuteurRecherche);
    minuteurRecherche = setTimeout(chercherMembres, 250);
});


messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const conversationId = conversationElement.dataset.conversationId;
    const contenu = messageInput.value.trim();
    const image = imageAEnvoyer;

    if (!conversationId || (!contenu && !image)) return;

    boutonEnvoyer.disabled = true;

    let imageUrl = null;

    // la photo part d'abord dans le bucket, on enregistre ensuite juste son adresse dans le message
    if (image) {
        const chemin = conversationId + '/' + monId + '-' + Date.now() + '.' + image.type.split('/')[1];

        const { error: erreurImage } = await client.storage
            .from('messages')
            .upload(chemin, image);

        if (erreurImage) {
            console.error("Erreur envoi photo :", erreurImage.message);
            alert("La photo n'a pas pu être envoyée.");
            boutonEnvoyer.disabled = false;
            return;
        }

        imageUrl = client.storage.from('messages').getPublicUrl(chemin).data.publicUrl;
    }

    const { data: message, error } = await client
        .from('message')
        .insert({
            // dataset renvoie toujours du texte la colonne attend un nombre
            conversation_id: Number(conversationId),
            auteur_id: monId,
            contenu: contenu || null,
            image_url: imageUrl
        })
        .select(CHAMPS_MESSAGE)
        .single();

    boutonEnvoyer.disabled = false;

    if (error) {
        console.error("Erreur envoi :", error.message);
        alert("Le message n'a pas pu être envoyé.");
        return;
    }

    // on ne vide pas si l'utilisateur a déjà commencé à taper autre chose pendant l'envoi
    if (messageInput.value.trim() === contenu) messageInput.value = '';
    // pareil pour la photo : on ne retire l'aperçu que si c'est bien celle qui vient de partir
    if (imageAEnvoyer === image) retirerImage();

    if (conversationElement.dataset.conversationId !== conversationId) return;

    afficherMessage(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
});

demarrer();

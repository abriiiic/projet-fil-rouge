const client = window.supabaseClient;

let monId = null;

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];
const reactionsParMessage = {};

const monPseudoElement = document.getElementById('mon-pseudo');
const monAvatarElement = document.getElementById('mon-avatar');
const listeConversations = document.getElementById('liste-conversations');
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

let contactActuel = null;
const messagesElement = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const boutonEnvoyer = document.getElementById('send-message');

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
    await chargerMonPseudo();
    await chargerConversations();
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

    conversations.forEach(conversation => {
        const autre = membres.find(m => m.id === autreId(conversation));
        const contact = autre || { id: autreId(conversation), pseudo: 'Inconnu', photo_url: null };

        const li = document.createElement('li');
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'sidebar__conversation';

        const avatar = document.createElement('span');
        avatar.className = 'conversation__avatar';
        afficherAvatar(avatar, contact.pseudo, contact.photo_url);

        const nom = document.createElement('span');
        nom.textContent = contact.pseudo;

        bouton.appendChild(avatar);
        bouton.appendChild(nom);
        bouton.addEventListener('click', () => ouvrirConversation(conversation.id, contact, bouton));

        li.appendChild(bouton);
        listeConversations.appendChild(li);
    });
}


async function ouvrirConversation(conversationId, contact, bouton) {
    document.querySelectorAll('.sidebar__conversation').forEach(b => {
        b.classList.remove('active');
        b.removeAttribute('aria-current');
    });
    bouton.classList.add('active');
    bouton.setAttribute('aria-current', 'true');

    fermerPicker();
    conversationElement.dataset.conversationId = conversationId;
    contactActuel = contact;
    contactBouton.disabled = !contact.id;
    contactNameElement.textContent = contact.pseudo;
    afficherAvatar(contactAvatarElement, contact.pseudo, contact.photo_url);
    messagesElement.innerHTML = '';

    const { data: messages, error } = await client
        .from('message')
        // reaction(...) ramène les réactions de chaque message dans la même requête
        .select('id, auteur_id, contenu, date_envoi, reaction(membre_id, emoji)')
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
}


function afficherMessage(message) {
    if (!message.contenu) return;
    // déjà à l'écran (ça arrive si on rouvre la conversation pendant un envoi)
    if (messagesElement.querySelector(`[data-id="${message.id}"]`)) return;

    const div = document.createElement('div');
    div.dataset.id = message.id;
    div.className = message.auteur_id === monId ? 'message message--sent' : 'message message--received';

    const p = document.createElement('p');
    p.className = 'message__content';
    p.textContent = message.contenu;
    div.appendChild(p);

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


messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const conversationId = conversationElement.dataset.conversationId;
    const contenu = messageInput.value.trim();

    if (!conversationId || !contenu) return;

    boutonEnvoyer.disabled = true;

    const { data: message, error } = await client
        .from('message')
        .insert({
            // dataset renvoie toujours du texte la colonne attend un nombre
            conversation_id: Number(conversationId),
            auteur_id: monId,
            contenu: contenu
        })
        .select('id, auteur_id, contenu, date_envoi, reaction(membre_id, emoji)')
        .single();

    boutonEnvoyer.disabled = false;

    if (error) {
        console.error("Erreur envoi :", error.message);
        alert("Le message n'a pas pu être envoyé.");
        return;
    }

    // on ne vide pas si l'utilisateur a déjà commencé à taper autre chose pendant l'envoi
    if (messageInput.value.trim() === contenu) messageInput.value = '';

    if (conversationElement.dataset.conversationId !== conversationId) return;

    afficherMessage(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
});

demarrer();

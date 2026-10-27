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
const messagesElement = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const boutonEnvoyer = document.getElementById('send-message');

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
        .in('id', conversations.map(autreId).filter(id => id));

    if (erreurMembres) {
        console.error("Erreur membres :", erreurMembres.message);
        listeConversations.innerHTML = '<li class="sidebar__vide">Erreur de chargement</li>';
        return;
    }

    listeConversations.innerHTML = '';

    conversations.forEach(conversation => {
        const autre = membres.find(m => m.id === autreId(conversation));
        const pseudo = autre ? autre.pseudo : 'Inconnu';
        const photoUrl = autre ? autre.photo_url : null;

        const li = document.createElement('li');
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'sidebar__conversation';

        const avatar = document.createElement('span');
        avatar.className = 'conversation__avatar';
        afficherAvatar(avatar, pseudo, photoUrl);

        const nom = document.createElement('span');
        nom.textContent = pseudo;

        bouton.appendChild(avatar);
        bouton.appendChild(nom);
        bouton.addEventListener('click', () => ouvrirConversation(conversation.id, pseudo, photoUrl, bouton));

        li.appendChild(bouton);
        listeConversations.appendChild(li);
    });
}


async function ouvrirConversation(conversationId, pseudo, photoUrl, bouton) {
    document.querySelectorAll('.sidebar__conversation').forEach(b => {
        b.classList.remove('active');
        b.removeAttribute('aria-current');
    });
    bouton.classList.add('active');
    bouton.setAttribute('aria-current', 'true');

    fermerPicker();
    conversationElement.dataset.conversationId = conversationId;
    contactNameElement.textContent = pseudo;
    afficherAvatar(contactAvatarElement, pseudo, photoUrl);
    messagesElement.innerHTML = '';

    const { data: messages, error } = await client
        .from('message')
        .select('id, auteur_id, contenu, date_envoi, reaction(membre_id, emoji)')
        .eq('conversation_id', conversationId)
        .order('id');

    if (conversationElement.dataset.conversationId !== String(conversationId)) return;

    if (error) {
        console.error("Erreur messages :", error.message);
        messagesElement.textContent = "Impossible de charger les messages";
        return;
    }

    messagesElement.innerHTML = '';
    messages.forEach(afficherMessage);
    messagesElement.scrollTop = messagesElement.scrollHeight;
}


function afficherMessage(message) {
    if (!message.contenu) return;
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


async function reagir(messageId, emoji) {
    const mienne = reactionsParMessage[messageId].find(r => r.membre_id === monId);
    const retirer = mienne && mienne.emoji === emoji;

    const { error } = retirer
        ? await client
            .from('reaction')
            .delete()
            .eq('message_id', messageId)
            .eq('membre_id', monId)
        : await client
            .from('reaction')
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

    if (messageInput.value.trim() === contenu) messageInput.value = '';

    if (conversationElement.dataset.conversationId !== conversationId) return;

    afficherMessage(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
});

demarrer();

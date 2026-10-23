const client = window.supabaseClient;

let monId = null;

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


function initiale(pseudo) {
    return pseudo ? pseudo[0].toUpperCase() : '?';
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
        .select('pseudo')
        .eq('id', monId)
        .single();

    if (error) {
        console.error("Erreur pseudo :", error.message);
        monPseudoElement.textContent = "Pseudo introuvable";
        return;
    }

    monPseudoElement.textContent = data.pseudo;
    monAvatarElement.textContent = initiale(data.pseudo);
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
        .select('id, pseudo')
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

        const li = document.createElement('li');
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'sidebar__conversation';
        bouton.textContent = pseudo;
        bouton.addEventListener('click', () => ouvrirConversation(conversation.id, pseudo, bouton));

        li.appendChild(bouton);
        listeConversations.appendChild(li);
    });
}


async function ouvrirConversation(conversationId, pseudo, bouton) {
    document.querySelectorAll('.sidebar__conversation').forEach(b => {
        b.classList.remove('active');
        b.removeAttribute('aria-current');
    });
    bouton.classList.add('active');
    bouton.setAttribute('aria-current', 'true');

    conversationElement.dataset.conversationId = conversationId;
    contactNameElement.textContent = pseudo;
    contactAvatarElement.textContent = initiale(pseudo);
    messagesElement.innerHTML = '';

    const { data: messages, error } = await client
        .from('message')
        .select('id, auteur_id, contenu')
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
    messagesElement.appendChild(div);
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
        .select('id, auteur_id, contenu')
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

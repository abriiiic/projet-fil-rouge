async function chargerUtilisateur() {
    const { data: { user }, error } = await window.supabaseClient.auth.getUser();

    if (user) {
        console.log("Utilisateur connecté :", user.email);

        const contactNameElement = document.getElementById('contact-name');
        
        if (contactNameElement) {
            contactNameElement.textContent = user.email; 

        }
    } else {
        console.log("Aucun utilisateur connecté.");
        window.location.href = 'inscription.html'; 
    }
}

chargerUtilisateur();
const InscriptionForm = document.querySelector("#InscriptionForm");

if (InscriptionForm) {
    // 1. On ajoute 'async' ici
    InscriptionForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(InscriptionForm);
        const loginInformation = {
            email: formData.get('email'),
            password: formData.get('password'),

            passwordConfirmation: formData.get('password-confirmation') 
        };

        if (loginInformation.password !== loginInformation.passwordConfirmation) {
            alert("Les mots de passe ne correspondent pas !");
            return;
        }


        const boutonSubmit = InscriptionForm.querySelector('button'); 
        if (boutonSubmit) boutonSubmit.disabled = true;
        
        try {
            const { data, error } = await window.supabaseClient.auth.signUp({
                email: loginInformation.email,
                password: loginInformation.password,
            });

            if (error) {
                console.error("Erreur d'inscription :", error.message);
                alert("Erreur : " + error.message);
            } else {
                console.log("Inscription réussie ! ", data);
                alert("Compte créé avec succès !");

                window.location.href = 'conversation.html';
            }
        } catch (err) {
            console.error("Erreur inattendue : ", err);
        } finally {
            if (boutonSubmit) boutonSubmit.disabled = false;
        }
    });
}
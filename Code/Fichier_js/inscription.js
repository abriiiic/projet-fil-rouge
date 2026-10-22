const InscriptionForm = document.querySelector("#InscriptionForm");

if (InscriptionForm) {
    InscriptionForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(InscriptionForm);
        const loginInformation = {
            pseudo: formData.get('username').trim(),
            email: formData.get('email'),
            password: formData.get('password'),
            passwordConfirmation: formData.get('password-confirmation')
        };

        if (!loginInformation.pseudo) {
            alert("Le pseudo ne peut pas être vide !");
            return;
        }

        if (loginInformation.password !== loginInformation.passwordConfirmation) {
            alert("Les mots de passe ne correspondent pas !");
            return;
        }

        const boutonSubmit = InscriptionForm.querySelector('button');
        if (boutonSubmit) boutonSubmit.disabled = true;

        try {
            const { data: pseudoExistant } = await window.supabaseClient
                .from('membre')
                .select('id')
                .eq('pseudo', loginInformation.pseudo)
                .maybeSingle();

            if (pseudoExistant) {
                alert("Ce pseudo est déjà pris, choisis-en un autre.");
                return;
            }

            const { data, error } = await window.supabaseClient.auth.signUp({
                email: loginInformation.email,
                password: loginInformation.password,
            });

            if (error) {
                console.error("Erreur d'inscription :", error.message);
                alert("Erreur : " + error.message);
                return;
            }

            if (data.user && data.user.identities && data.user.identities.length === 0) {
                alert("Cette adresse mail est déjà utilisée.");
                return;
            }

            const { error: erreurMembre } = await window.supabaseClient
                .from('membre')
                .insert({ id: data.user.id, pseudo: loginInformation.pseudo });

            if (erreurMembre) {
                console.error("Erreur création membre :", erreurMembre.message);
                alert("Erreur : " + erreurMembre.message);
                return;
            }

            if (!data.session) {
                alert("Compte créé ! Clique sur le lien reçu par mail pour confirmer ton adresse, puis connecte-toi.");
                window.location.href = 'connexion.html';
                return;
            }

            alert("Compte créé avec succès !");
            window.location.href = 'conversation.html';
        } catch (err) {
            console.error("Erreur inattendue : ", err);
        } finally {
            if (boutonSubmit) boutonSubmit.disabled = false;
        }
    });
}

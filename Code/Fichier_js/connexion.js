const loginForm = document.querySelector("#login-form");

if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(loginForm);
        const emailSaisi = formData.get('email');
        const passwordSaisi = formData.get('password');

        const boutonSubmit = loginForm.querySelector('button[type="submit"]');
        if (boutonSubmit) boutonSubmit.disabled = true;

        try {
            const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                email: emailSaisi,
                password: passwordSaisi,
            });

            if (error) {
                console.error("Erreur de connexion :", error.message);
                alert("Identifiants incorrects. Veuillez réessayer.");
            } else {
                console.log("Connexion réussie !", data);
                
                window.location.href = 'conversation.html';
            }
        } catch (err) {
            console.error("Erreur inattendue :", err);
        } finally { 
            if (boutonSubmit) boutonSubmit.disabled = false;
        }
    });
}
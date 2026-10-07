const loginForm = document.querySelector('#login-form');

if (loginForm) {
	loginForm.addEventListener('submit', (event) => {
		event.preventDefault();

		const formData = new FormData(loginForm);
		const loginInformation = {
			email: formData.get('email'),
			password: formData.get('password'),
			remember: formData.get('remember') === 'on'
		};

		console.log('Informations du formulaire :', loginInformation);
		sessionStorage.setItem('loginInformation', JSON.stringify(loginInformation));

		window.location.href = loginForm.action;
	});
} else {
	const storedLoginInformation = sessionStorage.getItem('loginInformation');

	if (storedLoginInformation) {
		console.log(
			'Informations du formulaire récupérées :',
			JSON.parse(storedLoginInformation)
		);
	}
}

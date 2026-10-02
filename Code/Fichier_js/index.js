const loginForm = document.querySelector('#login-form');

if (loginForm) {
	loginForm.addEventListener('submit', (event) => {
		event.preventDefault();
		window.location.href = 'conversation.html';
	});
}

// The private gallery token comes from the link supplied by the photographer.
const privateToken = document.body.dataset.privateToken || '';

// Check the client's credentials and open their gallery after a successful login.
document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();

    const form = new FormData(event.target);
    const message = document.getElementById('message');
    message.textContent = 'Checking your access...';

    try {
        const response = await fetch('/api/auth/client/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: privateToken,
                username: form.get('username'),
                password: form.get('password')
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        // The gallery page uses this token to load only the client's gallery data.
        localStorage.setItem('clientToken', data.token);
        localStorage.setItem('clientGallery', JSON.stringify(data.gallery));
        location.href = '/client/gallery';
    } catch (error) {
        message.textContent = error.message;
    }
});

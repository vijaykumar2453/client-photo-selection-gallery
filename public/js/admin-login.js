// Switch between the login, reset-request, and new-password forms on the same page.
const $ = id => document.getElementById(id);
const forms = [
    $('loginForm'),
    $('resetRequestForm'),
    $('completeResetForm')
];

function showForm(form) {
    forms.forEach(item => item.classList.toggle('hidden', item !== form));
}

function setMessage(element, text, state = '') {
    element.textContent = text;
    if (state) element.dataset.state = state;
    else delete element.dataset.state;
}

function validatePasswordByteLength(input) {
    input.setCustomValidity(
        new TextEncoder().encode(input.value).length > 72
            ? 'Password must be 72 bytes or fewer.'
            : ''
    );
}

async function submitForm(url, form) {
    // Send form values as JSON and turn API errors into messages the page can display.
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    const data = await response.json().catch(() => ({ message: 'Unexpected server response' }));
    if (!response.ok) throw new Error(data.message || 'Request failed');
    return data;
}

$('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.message');
    setMessage(message, 'Signing in...');
    try {
        const data = await submitForm('/api/auth/admin/login', form);
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminInfo', JSON.stringify(data.admin || {}));
        location.href = '/admin/dashboard';
    } catch (error) {
        setMessage(message, error.message, 'error');
    }
});

$('resetRequestForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.message');
    setMessage(message, 'Sending reset link...');
    try {
        const data = await submitForm('/api/auth/admin/password-reset/request', form);
        setMessage(message, data.message, 'success');
    } catch (error) {
        setMessage(message, error.message, 'error');
    }
});

$('completeResetForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.message');
    if ($('newAdminPassword').value !== $('confirmAdminPassword').value) {
        setMessage(message, 'Passwords do not match.', 'error');
        return;
    }
    setMessage(message, 'Updating password...');
    try {
        const data = await submitForm('/api/auth/admin/password-reset/confirm', form);
        history.replaceState(null, '', '/admin/login');
        showForm($('loginForm'));
        setMessage($('message'), data.message, 'success');
    } catch (error) {
        setMessage(message, error.message, 'error');
    }
});

[$('newAdminPassword'), $('confirmAdminPassword')].forEach(input => {
    input.addEventListener('input', () => validatePasswordByteLength(input));
});
$('newAdminPassword').addEventListener('input', () => {
    $('confirmAdminPassword').setCustomValidity('');
});
$('confirmAdminPassword').addEventListener('input', () => {
    $('confirmAdminPassword').setCustomValidity(
        $('confirmAdminPassword').value &&
        $('confirmAdminPassword').value !== $('newAdminPassword').value
            ? 'Passwords do not match.'
            : ''
    );
});

$('forgotLink').addEventListener('click', () => {
    $('resetEmail').value = $('email').value;
    setMessage($('resetRequestForm').querySelector('.message'), '');
    showForm($('resetRequestForm'));
});
document.querySelectorAll('.backToLogin').forEach(button =>
    button.addEventListener('click', () => showForm($('loginForm')))
);

const resetToken = new URLSearchParams(location.search).get('token');
if (location.pathname === '/admin/reset-password' && resetToken) {
    $('resetToken').value = resetToken;
    showForm($('completeResetForm'));
} else {
    showForm($('loginForm'));
}

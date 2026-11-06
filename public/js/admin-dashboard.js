// This browser controller renders dashboard data and sends actions to the API.
const adminToken = localStorage.getItem('adminToken');

if (!adminToken) {
    location.href = '/admin/login';
}

const authHeaders = { Authorization: `Bearer ${adminToken}` };
const getElement = id => document.getElementById(id);

// Keep page data and form state here; views are in EJS and business rules are in API controllers.
let galleries = [];
let selectedGalleryId = '';
let accessGallery = null;
let accessPassword = '';
let displayedClients = [];
let credentialClient = null;
let adminInfo = {};

// Centralize JSON requests so every dashboard action uses the same auth and error behavior.
// Send requests to the server and show a useful message when a request fails.
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...options.headers
        }
    });
    const data = await response.json().catch(() => ({
        message: 'Unexpected server response'
    }));

    if (response.status === 401) {
        localStorage.removeItem('adminToken');
        location.href = '/admin/login';
        throw new Error(data.message || 'Admin login required');
    }

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

function escapeHtml(value) {
    const replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return String(value ?? '').replace(/[&<>"']/g, character => replacements[character]);
}

function setMessage(element, text, state = '') {
    element.textContent = text;
    if (state) {
        element.dataset.state = state;
    } else {
        delete element.dataset.state;
    }
}

function toggleAdminDetails(isOpen) {
    const panel = getElement('adminDetailsPanel');
    const toggle = getElement('adminDetailsToggle');
    panel.classList.toggle('hidden', !isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    if (!isOpen) return;

    getElement('adminDetailsForm').reset();
    getElement('adminDetailsName').value = adminInfo.name || '';
    getElement('adminDetailsUsername').value = adminInfo.username || '';
    getElement('adminDetailsEmail').value = adminInfo.email || '';
    setMessage(getElement('adminDetailsMessage'), '');
    getElement('adminDetailsName').focus();
}

async function saveAdminDetails(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = getElement('adminDetailsMessage');
    const newPassword = getElement('newAdminAccountPassword');
    const confirmPassword = getElement('confirmAdminAccountPassword');
    // Measure UTF-8 bytes because the server's bcrypt password limit is byte-based.
    newPassword.setCustomValidity(
        new TextEncoder().encode(newPassword.value).length > 72
            ? 'Password must be 72 bytes or fewer.'
            : ''
    );
    confirmPassword.setCustomValidity(
        confirmPassword.value !== newPassword.value
            ? 'New passwords do not match.'
            : ''
    );
    if (!form.reportValidity()) return;

    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    setMessage(message, 'Saving admin details...');
    try {
        const result = await api('/api/auth/admin/me', {
            method: 'PUT',
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        adminInfo = result.admin;
        localStorage.setItem('adminInfo', JSON.stringify(adminInfo));
        getElement('adminName').textContent = adminInfo.name || 'Photographer';
        form.reset();
        getElement('adminDetailsName').value = adminInfo.name;
        getElement('adminDetailsUsername').value = adminInfo.username;
        getElement('adminDetailsEmail').value = adminInfo.email;
        setMessage(message, result.message, 'success');
    } catch (error) {
        setMessage(message, error.message, 'error');
    } finally {
        submitButton.disabled = false;
    }
}

// Galleries
async function loadGalleries() {
    try {
        galleries = await api('/api/galleries');
        getElement('galleryCount').textContent = galleries.length;
        getElement('activeCount').textContent = galleries.filter(gallery => gallery.isActive).length;

        adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
        getElement('adminName').textContent = adminInfo.name || 'Photographer';

        getElement('clientGallery').innerHTML = [
            '<option value="">Choose a gallery</option>',
            ...galleries.map(gallery =>
                `<option value="${escapeHtml(gallery._id)}">${escapeHtml(gallery.title)}</option>`
            )
        ].join('');

        renderGalleries();
    } catch (error) {
        getElement('galleryList').textContent = error.message;
    }
}

function renderGalleries() {
    const query = getElement('search').value.toLowerCase();
    const matchingGalleries = galleries.filter(gallery =>
        `${gallery.title} ${gallery.clientName}`.toLowerCase().includes(query)
    );

    getElement('galleryList').innerHTML = matchingGalleries.map(gallery => `
        <article class="gallery-item">
            <div class="gallery-symbol">▧</div>
            <div class="gallery-info">
                <h3>${escapeHtml(gallery.title)}</h3>
                <p>${escapeHtml(gallery.clientName)} · ${gallery.isActive ? 'Active' : 'Archived'}</p>
                <small>
                    ${escapeHtml(gallery.description || 'No description')}
                    · Selection limit: ${gallery.selectionLimit || 300}
                </small>
            </div>
            <div class="item-actions">
                <button class="outline" data-gallery-action="manage"
                    data-gallery-id="${escapeHtml(gallery._id)}">Manage</button>
                <button class="outline" data-gallery-action="add-client"
                    data-gallery-id="${escapeHtml(gallery._id)}">Add client</button>
            </div>
        </article>
    `).join('') || '<p class="muted">No galleries found. Create your first gallery.</p>';
}

function openGalleryManager(id) {
    const gallery = galleries.find(item => item._id === id);
    if (!gallery) return;

    selectedGalleryId = id;
    getElement('manageGalleryTitle').textContent = gallery.title;
    setMessage(getElement('manageGalleryMessage'), '');
    getElement('galleryActions').classList.remove('hidden');
    getElement('archiveConfirmation').classList.add('hidden');
    getElement('manageGalleryModal').classList.remove('hidden');
}

// Actions in the gallery options popup.
async function handleGalleryAction(action) {
    if (action === 'folders') {
        location.href = `/admin/galleries/${selectedGalleryId}`;
        return;
    }

    if (action === 'clients') {
        getElement('manageGalleryModal').classList.add('hidden');
        getElement('clientGallery').value = selectedGalleryId;
        await loadClients();
        getElement('clientsSection').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    if (action === 'copy-link') {
        try {
            const gallery = await api(`/api/galleries/${selectedGalleryId}`);
            const link = `${location.origin}/client/login/${gallery.folderToken}`;
            await navigator.clipboard.writeText(link);
            setMessage(getElement('manageGalleryMessage'), 'Private gallery link copied to clipboard.');
        } catch (error) {
            setMessage(
                getElement('manageGalleryMessage'),
                error.message || 'Could not copy the private link.',
                'error'
            );
        }
        return;
    }

    if (action === 'archive') {
        getElement('galleryActions').classList.add('hidden');
        getElement('archiveConfirmation').classList.remove('hidden');
        setMessage(getElement('manageGalleryMessage'), '');
        return;
    }

    if (action === 'delete') {
        const gallery = galleries.find(item => item._id === selectedGalleryId);
        if (!gallery) return;
        const confirmed = await window.confirmAction({
            title: 'Delete gallery permanently?',
            message: `“${gallery.title}” and its photos, client accounts, and selections will be permanently deleted. This cannot be undone.`,
            confirmLabel: 'Delete gallery',
            danger: true
        });
        if (!confirmed) return;

        try {
            await api(`/api/galleries/${selectedGalleryId}`, { method: 'DELETE' });
            getElement('manageGalleryModal').classList.add('hidden');
            if (getElement('clientGallery').value === selectedGalleryId) {
                getElement('clientGallery').value = '';
            }
            await loadGalleries();
            await loadClients();
        } catch (error) {
            setMessage(getElement('manageGalleryMessage'), error.message, 'error');
        }
    }
}

async function archiveSelectedGallery() {
    try {
        await api(`/api/galleries/${selectedGalleryId}/archive`, { method: 'PATCH' });
        getElement('manageGalleryModal').classList.add('hidden');
        await loadGalleries();
    } catch (error) {
        setMessage(getElement('manageGalleryMessage'), error.message, 'error');
    }
}

function resetAccessModal() {
    getElement('accessForm').reset();
    getElement('accessForm').classList.remove('hidden');
    getElement('accessResult').classList.add('hidden');
    setMessage(getElement('accessMessage'), '');
    setMessage(getElement('verificationMessage'), '');
    getElement('clientPrivateLink').value = '';
    getElement('createdClientUsername').value = '';
    getElement('createdClientPassword').value = '';
    getElement('verifyClientLogin').disabled = false;
    getElement('verifyClientLogin').textContent = 'Test client login';
    accessGallery = null;
    accessPassword = '';
}

// Client accounts
function openAccessModal(id, initialSetup = false, gallery = galleries.find(item => item._id === id)) {
    if (!gallery) {
        getElement('galleryList').textContent = 'Gallery not found. Refresh the page and try again.';
        return;
    }

    resetAccessModal();
    accessGallery = gallery;
    getElement('accessForm').elements.galleryId.value = id;
    getElement('clientGallery').value = id;
    getElement('accessTitle').textContent = initialSetup
        ? 'Step 2 of 2: Create client login'
        : 'Add client login';
    getElement('accessDescription').textContent = initialSetup
        ? `Create the login for ${gallery.title}, then test it before sharing.`
        : `Create a login for a client of ${gallery.title}. You can test it before sharing.`;
    getElement('accessModal').classList.remove('hidden');
}

async function loadClients() {
    const galleryId = getElement('clientGallery').value;
    if (!galleryId) {
        displayedClients = [];
        getElement('clientList').innerHTML =
            '<p class="muted">Choose a gallery to view its clients.</p>';
        return;
    }

    try {
        displayedClients = await api(`/api/client-access/gallery/${galleryId}`);
        getElement('clientList').innerHTML = displayedClients.map(client => `
            <div class="client-row">
                <div class="client-credentials">
                    <span class="credential-label">Username</span>
                    <strong>${escapeHtml(client.username)}</strong>
                    <span class="credential-label">Password</span>
                    <span class="credential-hidden">Stored securely · not viewable</span>
                </div>
                <span class="status ${client.isActive ? '' : 'inactive'}">
                    ${client.isActive ? 'Active' : 'Disabled'}
                </span>
                <button class="outline small" data-client-action="set-password"
                    data-client-id="${escapeHtml(client._id)}">Set password</button>
                <button class="outline small" data-client-action="toggle-status"
                    data-client-id="${escapeHtml(client._id)}"
                    data-client-active="${!client.isActive}">
                    ${client.isActive ? 'Disable' : 'Enable'}
                </button>
                <a href="/admin/selections/${escapeHtml(galleryId)}/${escapeHtml(client._id)}">
                    View selections
                </a>
            </div>
        `).join('') || '<p class="muted">No clients assigned yet.</p>';
    } catch (error) {
        getElement('clientList').textContent = error.message;
    }
}

function resetClientCredentials() {
    getElement('clientPasswordForm').reset();
    getElement('clientPasswordForm').classList.remove('hidden');
    getElement('updatedCredentials').classList.add('hidden');
    setMessage(getElement('clientPasswordMessage'), '');
    getElement('updatedClientUsername').value = '';
    getElement('updatedClientPassword').value = '';
    getElement('existingClientUsername').value = '';
    getElement('existingClientLink').value = '';
    credentialClient = null;
}

function openClientCredentials(clientId) {
    const client = displayedClients.find(item => item._id === clientId);
    const gallery = galleries.find(item => item._id === getElement('clientGallery').value);
    if (!client || !gallery) {
        getElement('clientList').textContent = 'Could not load client details. Refresh and try again.';
        return;
    }

    resetClientCredentials();
    credentialClient = client;
    getElement('existingClientUsername').value = client.username;
    getElement('existingClientLink').value =
        `${location.origin}/client/login/${gallery.folderToken}`;
    getElement('clientCredentialsModal').classList.remove('hidden');
}

async function updateClientPassword(event) {
    event.preventDefault();
    if (!credentialClient) return;

    const password = getElement('newClientPassword').value;
    const submitButton = event.submitter || event.target.querySelector('[type="submit"]');
    const closeButton = getElement('clientCredentialsModal').querySelector('[data-close]');
    submitButton.disabled = true;
    closeButton.disabled = true;
    setMessage(getElement('clientPasswordMessage'), 'Updating password...');

    try {
        const result = await api(`/api/client-access/${credentialClient._id}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ password })
        });

        getElement('updatedClientUsername').value = result.username;
        getElement('updatedClientPassword').value = password;
        getElement('clientPasswordForm').classList.add('hidden');
        getElement('updatedCredentials').classList.remove('hidden');
        setMessage(getElement('clientPasswordMessage'), 'Password updated successfully.', 'success');
        await loadClients();
    } catch (error) {
        setMessage(getElement('clientPasswordMessage'), error.message, 'error');
    } finally {
        submitButton.disabled = false;
        closeButton.disabled = false;
    }
}

// Copy the client details shown in either credentials popup.
async function copyDetails(text, successMessageElement, successText) {
    try {
        await navigator.clipboard.writeText(text);
        setMessage(successMessageElement, successText, 'success');
    } catch {
        setMessage(
            successMessageElement,
            'Could not copy automatically. You can select and copy each field.',
            'error'
        );
    }
}

async function copyUpdatedCredentials() {
    const details = [
        `Private gallery link: ${getElement('existingClientLink').value}`,
        `Username: ${getElement('updatedClientUsername').value}`,
        `Password: ${getElement('updatedClientPassword').value}`
    ].join('\n');

    await copyDetails(
        details,
        getElement('clientPasswordMessage'),
        'Login details copied. Share them with the client.'
    );
}

async function toggleClientStatus(id, isActive) {
    try {
        await api(`/api/client-access/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive })
        });
        await loadClients();
    } catch (error) {
        alert(error.message);
    }
}

async function createGallery(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    data.selectionLimit = Number(data.selectionLimit);

    const submitButton = event.submitter || event.target.querySelector('[type="submit"]');
    const closeButton = getElement('galleryModal').querySelector('[data-close]');
    submitButton.disabled = true;
    closeButton.disabled = true;
    setMessage(getElement('galleryMessage'), 'Creating gallery...');

    try {
        const result = await api('/api/galleries', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        event.target.reset();
        getElement('galleryModal').classList.add('hidden');
        await loadGalleries();
        openAccessModal(result.gallery._id, true, result.gallery);
    } catch (error) {
        setMessage(getElement('galleryMessage'), error.message, 'error');
    } finally {
        submitButton.disabled = false;
        closeButton.disabled = false;
    }
}

async function createClientAccess(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const submitButton = event.submitter || event.target.querySelector('[type="submit"]');
    const closeButton = getElement('accessModal').querySelector('[data-close]');
    submitButton.disabled = true;
    closeButton.disabled = true;
    setMessage(getElement('accessMessage'), 'Creating client login...');

    try {
        await api('/api/client-access', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        // The server stores only a hash; retain this password briefly for the one-time handoff.
        accessPassword = data.password;
        getElement('clientPrivateLink').value =
            `${location.origin}/client/login/${accessGallery.folderToken}`;
        getElement('createdClientUsername').value = data.username.trim();
        getElement('createdClientPassword').value = data.password;
        getElement('accessForm').classList.add('hidden');
        getElement('accessResult').classList.remove('hidden');
        await loadClients();
    } catch (error) {
        setMessage(getElement('accessMessage'), error.message, 'error');
    } finally {
        submitButton.disabled = false;
        closeButton.disabled = false;
    }
}

// Test the newly created client login without saving its token in the browser.
async function verifyClientLogin() {
    const button = getElement('verifyClientLogin');
    button.disabled = true;
    setMessage(getElement('verificationMessage'), 'Testing these credentials...');

    try {
        const response = await fetch('/api/auth/client/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: accessGallery.folderToken,
                username: getElement('createdClientUsername').value,
                password: accessPassword
            })
        });
        const result = await response.json().catch(() => ({
            message: 'Unexpected server response'
        }));

        if (!response.ok) {
            throw new Error(result.message || 'Client login test failed');
        }
        if (String(result.gallery?.id) !== String(accessGallery._id)) {
            throw new Error('The login opened a different gallery than expected.');
        }

        setMessage(
            getElement('verificationMessage'),
            'Verified: the client can log in and reaches the correct gallery.',
            'success'
        );
        button.textContent = 'Login verified';
    } catch (error) {
        setMessage(
            getElement('verificationMessage'),
            error.message || 'Could not verify the client login.',
            'error'
        );
        button.disabled = false;
    }
}

async function copyNewClientDetails() {
    const details = [
        `Private gallery link: ${getElement('clientPrivateLink').value}`,
        `Username: ${getElement('createdClientUsername').value}`,
        `Password: ${getElement('createdClientPassword').value}`
    ].join('\n');

    await copyDetails(
        details,
        getElement('verificationMessage'),
        'Link and login details copied. Share them with the client.'
    );
}

function closeAccessModal() {
    getElement('accessModal').classList.add('hidden');
    resetAccessModal();
}

// Connect buttons and forms in the EJS dashboard to the functions above.
getElement('galleryList').addEventListener('click', event => {
    const button = event.target.closest('[data-gallery-action]');
    if (!button) return;

    const { galleryAction, galleryId } = button.dataset;
    if (galleryAction === 'manage') {
        openGalleryManager(galleryId);
    } else if (galleryAction === 'add-client') {
        openAccessModal(galleryId);
    }
});

getElement('galleryActions').addEventListener('click', event => {
    const button = event.target.closest('[data-gallery-action]');
    if (button) handleGalleryAction(button.dataset.galleryAction);
});

getElement('clientList').addEventListener('click', event => {
    const button = event.target.closest('[data-client-action]');
    if (!button) return;

    if (button.dataset.clientAction === 'set-password') {
        openClientCredentials(button.dataset.clientId);
    } else if (button.dataset.clientAction === 'toggle-status') {
        toggleClientStatus(button.dataset.clientId, button.dataset.clientActive === 'true');
    }
});

getElement('cancelArchive').onclick = () => {
    getElement('archiveConfirmation').classList.add('hidden');
    getElement('galleryActions').classList.remove('hidden');
};
getElement('confirmArchive').onclick = archiveSelectedGallery;
getElement('clientPasswordForm').onsubmit = updateClientPassword;
getElement('copyUpdatedCredentials').onclick = copyUpdatedCredentials;
getElement('galleryForm').onsubmit = createGallery;
getElement('accessForm').onsubmit = createClientAccess;
getElement('verifyClientLogin').onclick = verifyClientLogin;
getElement('copyClientDetails').onclick = copyNewClientDetails;
getElement('finishAccess').onclick = closeAccessModal;

getElement('openCreate').onclick = () => {
    getElement('galleryForm').reset();
    setMessage(getElement('galleryMessage'), '');
    getElement('galleryModal').classList.remove('hidden');
};
getElement('search').oninput = renderGalleries;
getElement('clientGallery').onchange = loadClients;

document.querySelectorAll('[data-close]').forEach(button => {
    button.onclick = () => {
        const modalId = button.dataset.close;
        getElement(modalId).classList.add('hidden');

        if (modalId === 'accessModal') resetAccessModal();
        if (modalId === 'clientCredentialsModal') resetClientCredentials();
    };
});

getElement('logout').onclick = async () => {
    const confirmed = await window.confirmAction({
        title: 'Log out?',
        message: 'Are you sure you want to log out?',
        confirmLabel: 'Log out'
    });
    if (!confirmed) return;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminInfo');
    location.href = '/admin/login';
};
getElement('adminDetailsToggle').onclick = () => toggleAdminDetails(true);
getElement('closeAdminDetails').onclick = () => toggleAdminDetails(false);
getElement('adminDetailsPanel').addEventListener('click', event => {
    if (event.target === getElement('adminDetailsPanel')) toggleAdminDetails(false);
});
getElement('adminDetailsForm').onsubmit = saveAdminDetails;

loadGalleries();

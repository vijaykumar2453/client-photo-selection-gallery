// Restore the client's login and gallery information saved after signing in.
const token = localStorage.getItem('clientToken');
const gallery = JSON.parse(localStorage.getItem('clientGallery') || 'null');

if (!token || !gallery) {
    location.href = '/';
}

const authHeaders = { Authorization: `Bearer ${token}` };
const getElement = id => document.getElementById(id);
let selectedPhotos = new Set();
let folders = [];
let activeFolderId = '';
let selectionSubmitted = false;
let selectionLimit = 300;
let nextCursor = null;
let photoRequestVersion = 0;
let changeVersion = 0;
let draftDirty = false;
let isSubmitting = false;
let draftSaveTimer = null;
let draftSaveQueue = Promise.resolve();

// All gallery API calls carry the client token saved after login.
// Send an authenticated request to the server API.
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...options.headers }
    });
    const data = await response.json().catch(() => ({
        message: 'Unexpected server response'
    }));

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

// Keep the selection count and submit button in sync with the current choices.
function updateSelectionCount() {
    getElement('count').textContent = `${selectedPhotos.size} selected`;
    getElement('limitText').textContent = `Selection limit: ${selectionLimit}`;
    getElement('saveDraft').disabled = !draftDirty || selectionSubmitted || isSubmitting;
    getElement('submit').disabled =
        selectedPhotos.size === 0 || selectionSubmitted || isSubmitting;
}

// Load the gallery details, folders, and any choices the client already saved.
async function initializeGallery() {
    try {
        const [galleryDetails, folderData, savedSelection] = await Promise.all([
            api('/api/client-access/gallery'),
            api(`/api/client/galleries/${gallery.id}/folders`),
            api('/api/selections/mine')
        ]);

        getElement('galleryTitle').textContent = galleryDetails.title;
        getElement('galleryDescription').textContent =
            galleryDetails.description || 'Select the photographs you love.';

        selectionLimit = galleryDetails.selectionLimit || 300;
        folders = folderData;
        selectedPhotos = new Set(
            (savedSelection.selectedPhotoIds || []).map(photo =>
                String(photo._id || photo)
            )
        );
        selectionSubmitted = savedSelection.status === 'submitted';
        getElement('draftStatus').textContent = selectionSubmitted
            ? 'Selections submitted'
            : 'Draft saved';

        renderFolders();
        await loadPhotos();

        if (selectionSubmitted) {
            getElement('message').textContent =
                'Your selections have been submitted and are now locked.';
        }
    } catch (error) {
        getElement('message').textContent = error.message;
    }
}

// Build the folder buttons, including an option to see every photo.
function renderFolders() {
    const folderGrid = getElement('folders');
    folderGrid.replaceChildren();

    const allPhotosButton = document.createElement('button');
    allPhotosButton.type = 'button';
    allPhotosButton.className = `folder-card ${!activeFolderId ? 'selected' : ''}`;
    const allPhotosName = document.createElement('strong');
    allPhotosName.textContent = 'All photos';
    allPhotosButton.append(allPhotosName);
    allPhotosButton.addEventListener('click', () => window.selectFolder(''));
    folderGrid.append(allPhotosButton);

    folders.forEach(folder => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `folder-card ${activeFolderId === folder._id ? 'selected' : ''}`;

        const name = document.createElement('strong');
        name.textContent = folder.name;
        const count = document.createElement('small');
        count.textContent = `${folder.photoCount} photos`;
        button.append(name, count);
        button.addEventListener('click', () => window.selectFolder(folder._id));
        folderGrid.append(button);
    });
}

// Choose a folder and reload the photos shown in the gallery.
window.selectFolder = async id => {
    activeFolderId = id;
    nextCursor = null;
    const folder = folders.find(item => item._id === id);
    getElement('folderHeading').textContent = id
        ? (folder?.name || 'Folder')
        : 'All folders';
    renderFolders();
    await loadPhotos(false);
};

function renderPhoto(photo) {
    const tile = document.createElement('label');
    tile.className = `photo-tile selectable ${selectedPhotos.has(photo._id) ? 'chosen' : ''}`;

    const image = document.createElement('img');
    image.src = photo.thumbnailUrl || photo.imageUrl;
    image.alt = 'Gallery photograph';
    image.loading = 'lazy';
    image.decoding = 'async';

    const selectLabel = document.createElement('span');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = photo._id;
    checkbox.checked = selectedPhotos.has(photo._id);
    checkbox.disabled = selectionSubmitted || isSubmitting;
    selectLabel.append(checkbox, document.createTextNode(' Select photo'));
    tile.append(image, selectLabel);

    checkbox.addEventListener('change', () => {
        if (checkbox.checked && selectedPhotos.size >= selectionLimit) {
            checkbox.checked = false;
            alert(`You can select a maximum of ${selectionLimit} photos.`);
            return;
        }

        if (checkbox.checked) selectedPhotos.add(checkbox.value);
        else selectedPhotos.delete(checkbox.value);

        tile.classList.toggle('chosen', checkbox.checked);
        draftDirty = true;
        changeVersion += 1;
        getElement('draftStatus').textContent = 'Saving draft...';
        updateSelectionCount();
        // Debounce draft writes so rapid checkbox changes are sent as one update.
        clearTimeout(draftSaveTimer);
        draftSaveTimer = setTimeout(() => {
            saveDraft().catch(() => {});
        }, 500);
    });

    getElement('photos').append(tile);
}

// Fetch one bounded page and append it without rendering the entire gallery at once.
async function loadPhotos(append = false) {
    if (append && !nextCursor) return;
    const requestVersion = ++photoRequestVersion;
    const params = new URLSearchParams({ limit: '48' });
    if (activeFolderId) params.set('folderId', activeFolderId);
    if (append && nextCursor) params.set('cursor', nextCursor);
    const url = `/api/galleries/${gallery.id}/photos?${params}`;
    const loadMore = getElement('loadMore');
    loadMore.disabled = true;

    if (!append) {
        nextCursor = null;
        getElement('photos').textContent = 'Loading your photos...';
    }

    try {
        const result = await api(url);
        if (requestVersion !== photoRequestVersion) return;
        const { photos, pagination } = result;
        if (!append) getElement('photos').replaceChildren();
        if (!append && photos.length === 0) {
            getElement('photos').textContent = 'No photographs in this folder yet.';
        } else {
            photos.forEach(renderPhoto);
        }
        nextCursor = pagination.nextCursor;
        loadMore.classList.toggle('hidden', !pagination.hasMore);
        updateSelectionCount();
    } catch (error) {
        if (requestVersion === photoRequestVersion) {
            if (!append) getElement('photos').textContent = error.message;
            else getElement('message').textContent = error.message;
        }
    } finally {
        if (requestVersion === photoRequestVersion) loadMore.disabled = false;
    }
}

getElement('loadMore').onclick = () => loadPhotos(true);

async function saveDraft() {
    clearTimeout(draftSaveTimer);
    const version = changeVersion;
    const photoIds = [...selectedPhotos];
    getElement('draftStatus').textContent = 'Saving draft...';

    // Serialize writes so a slower earlier request cannot overwrite a newer draft.
    const request = draftSaveQueue.catch(() => {}).then(() =>
        api('/api/selections/mine/draft', {
            method: 'PUT',
            body: JSON.stringify({ photoIds })
        })
    );
    draftSaveQueue = request;

    try {
        await request;
        if (version === changeVersion) {
            draftDirty = false;
            getElement('draftStatus').textContent = 'Draft saved';
            getElement('message').textContent = '';
            updateSelectionCount();
        }
    } catch (error) {
        if (version === changeVersion) {
            getElement('draftStatus').textContent = 'Draft not saved. Retry saving.';
            getElement('message').textContent = error.message;
        }
        throw error;
    }
}

getElement('saveDraft').onclick = () => saveDraft().catch(() => {});

// Save the latest draft before locking the client's final choices.
getElement('submit').onclick = async () => {
    if (isSubmitting || selectionSubmitted) return;
    isSubmitting = true;
    updateSelectionCount();
    document.querySelectorAll('.photo-tile input').forEach(input => {
        input.disabled = true;
    });

    try {
        await saveDraft();
        const result = await api('/api/selections/mine/submit', {
            method: 'POST'
        });
        getElement('message').textContent = result.message;
        selectionSubmitted = true;
        getElement('draftStatus').textContent = 'Selections submitted';

        document.querySelectorAll('.photo-tile input').forEach(input => {
            input.disabled = true;
        });
    } catch (error) {
        getElement('message').textContent = error.message;
        document.querySelectorAll('.photo-tile input').forEach(input => {
            input.disabled = selectionSubmitted;
        });
    } finally {
        isSubmitting = false;
        updateSelectionCount();
    }
};

// Clear the client session on this device and return to the sign-in page.
getElement('logout').onclick = () => {
    localStorage.removeItem('clientToken');
    localStorage.removeItem('clientGallery');
    location.href = '/';
};

initializeGallery();

window.addEventListener('beforeunload', event => {
    if (!draftDirty || selectionSubmitted) return;
    event.preventDefault();
    event.returnValue = '';
});

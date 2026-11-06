// Manage gallery folders and photo uploads.
const galleryId = document.body.dataset.galleryId;
const token = localStorage.getItem('adminToken');

if (!token) location.href = '/admin/login';

const headers = { Authorization: `Bearer ${token}` };
const $ = id => document.getElementById(id);
let selectedFolder = null;
let uploadInProgress = false;
let nextCursor = null;
let photoRequestVersion = 0;

// Reuse a single JSON request helper for gallery and folder operations.
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...headers, ...options.headers }
    });
    const data = await response.json().catch(() => ({ message: 'Unexpected server response' }));
    if (!response.ok) throw new Error(data.message || 'Request failed');
    return data;
}

function updateUploadState(folderName = '') {
    const photoInput = $('photoFiles');
    const photoButton = photoInput.closest('.upload-button');
    const directoryInput = $('directoryFiles');
    const directoryButton = directoryInput.closest('.upload-button');

    photoInput.disabled = !selectedFolder || uploadInProgress;
    directoryInput.disabled = uploadInProgress;
    photoButton.classList.toggle('is-disabled', photoInput.disabled);
    photoButton.classList.toggle('is-loading', uploadInProgress);
    directoryButton.classList.toggle('is-loading', uploadInProgress);
    document.querySelectorAll('#folders button').forEach(button => {
        button.disabled = uploadInProgress;
    });
    $('folderForm').querySelector('[type="submit"]').disabled = uploadInProgress;
    $('uploadHint').textContent = uploadInProgress
        ? 'Uploading photos...'
        : selectedFolder
            ? `Individual photos will upload to ${folderName || 'the selected folder'}. Folder uploads preserve their subfolders. Images must be 15 MB or smaller; uploads are processed in batches of 5.`
            : 'Select a gallery folder for individual photos, or upload a folder with its subfolders preserved. Images must be 15 MB or smaller; uploads are processed in batches of 5.';
}

async function init() {
    try {
        const gallery = await api(`/api/galleries/${galleryId}`);
        $('title').textContent = gallery.title;
        $('description').textContent = `${gallery.clientName} · ${gallery.description || ''}`;
        await loadFolders();
        if (selectedFolder) await loadPhotos();
    } catch (error) {
        $('message').textContent = error.message;
        $('message').dataset.state = 'error';
    }
}

async function loadFolders() {
    const folders = await api(`/api/admin/galleries/${galleryId}/folders`);
    if (!folders.some(folder => folder._id === selectedFolder)) {
        selectedFolder = folders[0]?._id || null;
    }

    const folderGrid = $('folders');
    folderGrid.replaceChildren();
    if (folders.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'muted';
        emptyMessage.textContent = 'Create a folder or upload a folder to start adding photos.';
        folderGrid.append(emptyMessage);
    } else {
        folders.forEach(folder => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `folder-card ${selectedFolder === folder._id ? 'selected' : ''}`;
            button.dataset.folderId = folder._id;
            button.disabled = uploadInProgress;

            const name = document.createElement('strong');
            name.textContent = `▰ ${folder.name}`;
            const count = document.createElement('small');
            count.textContent = `${folder.photoCount} photos`;
            button.append(name, count);
            folderGrid.append(button);
        });
    }

    folderGrid.onclick = event => {
        const button = event.target.closest('[data-folder-id]');
        if (!button || !folderGrid.contains(button)) return;
        const folder = folders.find(item => item._id === button.dataset.folderId);
        if (folder) window.chooseFolder(folder._id, folder.name);
    };

    const folder = folders.find(item => item._id === selectedFolder);
    $('folderTitle').textContent = folder ? folder.name : 'Select a folder';
    updateUploadState(folder?.name);
}

window.chooseFolder = async (id, name) => {
    selectedFolder = id;
    nextCursor = null;
    $('folderTitle').textContent = name;
    updateUploadState(name);
    try {
        await loadFolders();
        await loadPhotos();
    } catch (error) {
        $('message').textContent = error.message;
        $('message').dataset.state = 'error';
    }
};

$('folderForm').onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const button = event.submitter || event.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
        const result = await api(`/api/galleries/${galleryId}/folders`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        event.target.reset();
        $('message').textContent = 'Folder created';
        delete $('message').dataset.state;
        selectedFolder = result.folder._id;
        await loadFolders();
        await loadPhotos();
    } catch (error) {
        $('message').textContent = error.message;
        $('message').dataset.state = 'error';
    } finally {
        button.disabled = false;
    }
};

async function loadPhotos(append = false) {
    if (!selectedFolder) {
        $('photos').textContent = 'Create or select a folder to view photos.';
        $('loadMore').classList.add('hidden');
        return;
    }

    if (append && !nextCursor) return;
    const requestVersion = ++photoRequestVersion;
    $('loadMore').disabled = true;
    const params = new URLSearchParams({ folderId: selectedFolder, limit: '48' });
    if (append) params.set('cursor', nextCursor);

    if (!append) {
        nextCursor = null;
        $('photos').textContent = 'Loading photos...';
    }

    try {
        const result = await api(`/api/admin/galleries/${galleryId}/photos?${params}`);
        if (requestVersion !== photoRequestVersion) return;

        if (!append) $('photos').replaceChildren();
        if (!append && result.photos.length === 0) {
            $('photos').textContent = 'No photos in this folder yet.';
        } else {
            result.photos.forEach(photo => {
                const tile = document.createElement('article');
                tile.className = 'photo-tile';

                const image = document.createElement('img');
                image.src = photo.thumbnailUrl || photo.imageUrl;
                image.alt = photo.fileName || 'Photo';
                image.loading = 'lazy';
                image.decoding = 'async';

                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'danger small';
                deleteButton.textContent = 'Delete';
                deleteButton.addEventListener('click', () => window.deletePhoto(photo._id));
                tile.append(image, deleteButton);
                $('photos').append(tile);
            });
        }

        nextCursor = result.pagination.nextCursor;
        $('loadMore').classList.toggle('hidden', !result.pagination.hasMore);
    } catch (error) {
        if (requestVersion === photoRequestVersion) {
            if (append) $('message').textContent = error.message;
            else $('photos').textContent = error.message;
        }
    } finally {
        if (requestVersion === photoRequestVersion) {
            $('loadMore').disabled = false;
        }
    }
}

$('loadMore').onclick = () => loadPhotos(true);

function getUploadFileKeys(files, isDirectoryUpload) {
    const occurrences = new Map();
    return files.map(file => {
        const path = isDirectoryUpload ? file.webkitRelativePath : file.name;
        const base = `${path}:${file.size}:${file.lastModified}`;
        const occurrence = occurrences.get(base) || 0;
        occurrences.set(base, occurrence + 1);
        return `${base}:${occurrence}`;
    });
}

async function getUploadSession(uploadFileKeys, destination) {
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID) {
        throw new Error('Secure browser cryptography is required to safely resume uploads. Use HTTPS or localhost.');
    }

    // Identical file selections reuse an ID, allowing the server to skip files already stored.
    const fingerprint = JSON.stringify({
        destination,
        files: [...uploadFileKeys].sort()
    });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
    const fingerprintId = Array.from(new Uint8Array(digest), byte =>
        byte.toString(16).padStart(2, '0')
    ).join('');
    const storageKey = `photoUpload:${galleryId}:${fingerprintId}`;
    let uploadId = localStorage.getItem(storageKey);

    if (!uploadId) {
        uploadId = crypto.randomUUID();
        localStorage.setItem(storageKey, uploadId);
    }

    return { uploadId, storageKey };
}

const retryDelay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function uploadBatch(url, body) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        let response;
        try {
            response = await fetch(url, { method: 'POST', headers, body });
        } catch (error) {
            if (error instanceof TypeError && attempt < 2) {
                await retryDelay(500 * (2 ** attempt));
                continue;
            }
            throw error;
        }

        const result = await response.json().catch(() => ({
            message: 'Unexpected server response'
        }));
        if (response.ok) return result;

        const error = new Error(result.message || 'Photo upload failed');
        if ((response.status >= 500 || response.status === 429) && attempt < 2) {
            await retryDelay(500 * (2 ** attempt));
            continue;
        }
        throw error;
    }

    throw new Error('Photo upload failed after retries');
}

window.deletePhoto = async id => {
    const confirmed = await window.confirmAction({
        title: 'Delete photo?',
        message: 'This photo will be permanently deleted.',
        confirmLabel: 'Delete photo',
        danger: true
    });
    if (!confirmed) return;
    try {
        await api(`/api/galleries/${galleryId}/photos/${id}`, { method: 'DELETE' });
        await loadPhotos();
        await loadFolders();
    } catch (error) {
        $('message').textContent = error.message;
        $('message').dataset.state = 'error';
    }
};

async function uploadSelectedFiles(event) {
    const files = event.target.files;
    if (!files.length) return;
    const selectedFiles = Array.from(files);

    const isDirectoryUpload = event.target.id === 'directoryFiles';
    const targetFolderId = selectedFolder;
    if (!isDirectoryUpload && !targetFolderId) {
        $('message').textContent = 'Create or select a folder before uploading photos.';
        $('message').dataset.state = 'error';
        event.target.value = '';
        return;
    }
    if (isDirectoryUpload && selectedFiles.some(file => !file.webkitRelativePath)) {
        $('message').textContent = 'Your browser did not provide folder paths. Try a supported browser or upload individual photos.';
        $('message').dataset.state = 'error';
        event.target.value = '';
        return;
    }

    const uploadButton = event.target.closest('.upload-button');
    const batchSize = 5;
    let uploadedCount = 0;
    let skippedCount = 0;
    let processedCount = 0;
    let storageKey = null;
    uploadInProgress = true;
    updateUploadState();
    try {
        const fileKeys = getUploadFileKeys(selectedFiles, isDirectoryUpload);
        const destination = isDirectoryUpload ? 'gallery-folder-upload' : targetFolderId;
        const uploadSession = await getUploadSession(fileKeys, destination);
        storageKey = uploadSession.storageKey;

        // Small batches limit memory use and let a failed request be safely retried.
        for (let start = 0; start < selectedFiles.length; start += batchSize) {
            const batch = selectedFiles.slice(start, start + batchSize);
            const batchFileKeys = fileKeys.slice(start, start + batchSize);
            const body = new FormData();
            body.append('uploadId', uploadSession.uploadId);
            batchFileKeys.forEach(fileKey => body.append('fileKeys', fileKey));

            if (isDirectoryUpload) {
                batch.forEach(file => body.append('relativePaths', file.webkitRelativePath));
            }
            batch.forEach(file => body.append('photos', file, file.name));

            const url = isDirectoryUpload
                ? `/api/galleries/${galleryId}/photos`
                : `/api/galleries/${galleryId}/folders/${targetFolderId}/photos`;
            const result = await uploadBatch(url, body);
            if (isDirectoryUpload && !selectedFolder && result.photos?.[0]?.folderId) {
                selectedFolder = String(result.photos[0].folderId);
            }
            uploadedCount += result.count;
            skippedCount += result.skippedCount || 0;
            processedCount += result.count + (result.skippedCount || 0);
            $('message').textContent =
                `${processedCount} of ${selectedFiles.length} processed · ${uploadedCount} new · ${skippedCount} already uploaded`;
        }

        localStorage.removeItem(storageKey);
        $('message').textContent = `${uploadedCount} new photos uploaded; ${skippedCount} already present${isDirectoryUpload ? ' (folder structure preserved)' : ''}.`;
        delete $('message').dataset.state;
        try {
            await loadFolders();
            await loadPhotos();
        } catch (refreshError) {
            $('message').textContent += ` Gallery refresh failed: ${refreshError.message}`;
            $('message').dataset.state = 'error';
        }
    } catch (error) {
        $('message').textContent =
            `${processedCount} of ${selectedFiles.length} files processed. Retry the same selection to resume without duplicating uploaded photos. ${error.message}`;
        $('message').dataset.state = 'error';
    } finally {
        uploadButton.classList.remove('is-loading');
        uploadInProgress = false;
        event.target.value = '';
        const selected = $('folders').querySelector(`[data-folder-id="${selectedFolder}"] strong`);
        updateUploadState(selected ? selected.textContent.replace(/^▰ /, '') : '');
    }
}

$('photoFiles').onchange = uploadSelectedFiles;
$('directoryFiles').onchange = uploadSelectedFiles;

$('logout').onclick = async () => {
    const confirmed = await window.confirmAction({
        title: 'Log out?',
        message: 'Are you sure you want to log out?',
        confirmLabel: 'Log out'
    });
    if (!confirmed) return;
    localStorage.removeItem('adminToken');
    location.href = '/admin/login';
};

init();

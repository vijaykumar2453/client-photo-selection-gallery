// These page values and the admin token are added by the EJS view/login flow.
// The API checks that this admin owns the gallery and that the client belongs to it.
const galleryId = document.body.dataset.galleryId;
const clientId = document.body.dataset.clientAccessId;
const token = localStorage.getItem('adminToken');

if (!token) {
    location.href = '/admin/login';
}

const authHeaders = { Authorization: `Bearer ${token}` };

// Load and display the selected photos and submission status for this client.
async function loadSelection() {
    const response = await fetch(
        `/api/selections/${galleryId}/clients/${clientId}`,
        { headers: authHeaders }
    );
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Could not load client selections');
    }

    const selection = data.selection || {};
    const photos = selection.selectedPhotoIds || [];
    document.getElementById('clientName').textContent = `Client: ${data.client.username}`;
    document.getElementById('summary').textContent = `${photos.length} selected photos`;
    document.getElementById('status').textContent = selection.status || 'pending';
    document.getElementById('download').disabled =
        selection.status !== 'submitted' || photos.length === 0;

    const photoGrid = document.getElementById('photos');
    photoGrid.replaceChildren();
    if (photos.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'muted';
        emptyMessage.textContent = 'This client has not selected any photos yet.';
        photoGrid.append(emptyMessage);
    } else {
        photos.forEach(photo => {
            const tile = document.createElement('article');
            tile.className = 'photo-tile';

            const image = document.createElement('img');
            image.src = photo.thumbnailUrl || photo.imageUrl;
            image.alt = 'Selected photo';

            const fileName = document.createElement('p');
            fileName.textContent = photo.fileName || 'Photo';
            tile.append(image, fileName);
            photoGrid.append(tile);
        });
    }
}

// Download the server-created ZIP without navigating away from this page.
document.getElementById('download').onclick = async () => {
    const downloadButton = document.getElementById('download');
    downloadButton.disabled = true;
    try {
        const response = await fetch(
            `/api/selections/${galleryId}/clients/${clientId}/download`,
            { headers: authHeaders }
        );

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Could not download selected photos');
        }

        const zipFile = await response.blob();
        const downloadUrl = URL.createObjectURL(zipFile);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'selected-photos.zip';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
        alert(error.message);
    } finally {
        downloadButton.disabled = false;
    }
};

// Show loading errors in the photo area instead of leaving it blank.
loadSelection().catch(error => {
    document.getElementById('photos').textContent = error.message;
});

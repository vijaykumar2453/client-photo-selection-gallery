// Return a promise so callers can wait for a clear yes/no result before performing an action.
window.confirmAction = function ({ title, message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirmation-overlay';

        const dialog = document.createElement('section');
        dialog.className = 'confirmation-dialog';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'confirmation-title');
        dialog.setAttribute('aria-describedby', 'confirmation-message');

        const heading = document.createElement('h2');
        heading.id = 'confirmation-title';
        heading.textContent = title;
        dialog.append(heading);

        const description = document.createElement('p');
        description.id = 'confirmation-message';
        description.textContent = message;
        dialog.append(description);

        const actions = document.createElement('div');
        actions.className = 'confirmation-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'outline';
        cancel.textContent = 'Cancel';
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = danger ? 'danger' : 'primary';
        confirm.textContent = confirmLabel;
        actions.append(cancel, confirm);
        dialog.append(actions);
        overlay.append(dialog);
        document.body.append(overlay);

        function close(confirmed) {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(confirmed);
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') close(false);
            if (event.key === 'Tab') {
                event.preventDefault();
                (event.shiftKey ? confirm : cancel).focus();
            }
        }

        cancel.addEventListener('click', () => close(false));
        confirm.addEventListener('click', () => close(true));
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close(false);
        });
        document.addEventListener('keydown', onKeyDown);
        cancel.focus();
    });
};

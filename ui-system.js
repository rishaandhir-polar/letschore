export class UISystem {
    constructor() {
        this.modalContainer = document.getElementById('modal-container');
        this.toastContainer = document.getElementById('toast-container');
    }

    /**
     * Shows a premium custom confirmation modal
     */
    confirm(message) {
        return new Promise((resolve) => {
            this.modalContainer.innerHTML = `
                <div class="glass-card modal-content">
                    <div class="modal-header">
                        <span class="modal-icon">⚠️</span>
                        <h3>Are you sure?</h3>
                    </div>
                    <p class="modal-body">${message}</p>
                    <div class="modal-actions">
                        <button id="modal-cancel" class="filter-btn">Cancel</button>
                        <button id="modal-confirm" class="add-btn danger">Yes, Proceed</button>
                    </div>
                </div>
            `;
            this.modalContainer.classList.remove('hidden');

            const handleAction = (value) => {
                this.modalContainer.classList.add('hidden');
                resolve(value);
            };

            document.getElementById('modal-cancel').onclick = () => handleAction(false);
            document.getElementById('modal-confirm').onclick = () => handleAction(true);
        });
    }

    /**
     * Shows a beautiful in-app toast notification
     */
    notify(title, message) {
        const toast = document.createElement('div');
        toast.className = 'glass-card toast-item';
        toast.innerHTML = `
            <div class="toast-icon">⚡</div>
            <div class="toast-content">
                <strong>${title}</strong>
                <p>${message}</p>
            </div>
        `;

        this.toastContainer.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }
}

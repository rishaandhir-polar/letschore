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

    /**
     * Shows a premium custom prompt modal for input
     */
    prompt(title, message, placeholder = '', type = 'text') {
        return new Promise((resolve) => {
            this.modalContainer.innerHTML = `
                <div class="glass-card modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <span class="modal-icon">💰</span>
                        <h3>${title}</h3>
                    </div>
                    <p class="modal-body">${message}</p>
                    <div style="margin: 1.5rem 0;">
                        <input type="${type}" id="prompt-input" class="modal-input" placeholder="${placeholder}" autofocus style="width: 100%; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: var(--text-primary); padding: 0.8rem; border-radius: 8px;">
                    </div>
                    <div class="modal-actions">
                        <button id="modal-cancel" class="filter-btn">Cancel</button>
                        <button id="modal-confirm" class="add-btn accent">Confirm</button>
                    </div>
                </div>
            `;
            this.modalContainer.classList.remove('hidden');

            const input = document.getElementById('prompt-input');
            input.focus();

            const handleAction = (value) => {
                this.modalContainer.classList.add('hidden');
                resolve(value);
            };

            document.getElementById('modal-cancel').onclick = () => handleAction(null);
            document.getElementById('modal-confirm').onclick = () => handleAction(input.value);
            input.onkeydown = (e) => {
                if (e.key === 'Enter') handleAction(input.value);
                if (e.key === 'Escape') handleAction(null);
            };
        });
    }
}

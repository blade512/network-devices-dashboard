document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('dashboard-grid');
    const template = document.getElementById('tile-template');
    const lastUpdatedEl = document.getElementById('last-updated');

    // Map to keep track of existing DOM elements to update them rather than recreate
    const tileMap = new Map();

    async function fetchStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();

            updateDashboard(data);

            const now = new Date();
            lastUpdatedEl.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        } catch (error) {
            console.error("Failed to fetch status:", error);
            lastUpdatedEl.textContent = "Error fetching status";
            lastUpdatedEl.style.color = "var(--error-color)";
        }
    }

    function updateDashboard(services) {
        // Remove loading state if present
        const loadingStr = grid.querySelector('.loading');
        if (loadingStr) {
            loadingStr.remove();
        }

        // Track seen IDs to handle deletions nicely
        const seenIds = new Set();

        services.forEach(({ service, status, latencyMs, uptimePercent }) => {
            seenIds.add(service.id);
            let tile = tileMap.get(service.id);

            if (!tile) {
                // Create new tile
                const clone = template.content.cloneNode(true);
                tile = clone.querySelector('.service-tile');

                // Add to DOM and mapping
                grid.appendChild(tile);
                tileMap.set(service.id, tile);

                // Attach Hide listener
                const hideBtn = tile.querySelector('.hide-btn');
                if (hideBtn) {
                    hideBtn.addEventListener('click', async (e) => {
                        e.preventDefault(); // Stop navigation
                        e.stopPropagation();

                        try {
                            await fetch(`/api/services/${service.id}/hide`, { method: 'PATCH' });
                            tile.remove();
                            tileMap.delete(service.id);
                        } catch (err) {
                            console.error('Failed to hide tile:', err);
                        }
                    });
                }
            }

            // Update static info (in case it was edited)
            tile.querySelector('.service-name').textContent = service.name;
            tile.querySelector('.service-icon').textContent = service.icon || 'api';

            // Update dynamic info
            tile.dataset.status = status;

            if (service.url) {
                tile.href = service.url;
            } else if (service.host) {
                tile.href = `http://${service.host}`;
            }

            const latencyEl = tile.querySelector('.latency');
            const uptimeEl = tile.querySelector('.uptime');

            if (uptimePercent) {
                uptimeEl.textContent = `${uptimePercent}% uptime (24h)`;
            } else {
                uptimeEl.textContent = `--% uptime (24h)`;
            }

            if (status === 'up' && latencyMs !== null) {
                latencyEl.textContent = `${latencyMs}ms`;
                latencyEl.style.color = "var(--success-color)";
            } else if (status === 'down') {
                latencyEl.textContent = "Offline";
                latencyEl.style.color = "var(--error-color)";
            } else {
                latencyEl.textContent = "--";
                latencyEl.style.color = "var(--text-secondary)";
            }
        });

        // Handle removals
        for (const [id, tile] of tileMap.entries()) {
            if (!seenIds.has(id)) {
                tile.remove();
                tileMap.delete(id);
            }
        }
    }

    // Initial fetch start
    fetchStatus();

    // Poll every 5 seconds
    setInterval(fetchStatus, 5000);
});

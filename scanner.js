const ping = require('ping');
const http = require('http');
const https = require('https');

class Scanner {
    constructor(dbHelpers, intervalMs = 15000) {
        this.db = dbHelpers;
        this.intervalMs = intervalMs;
        this.statusMap = new Map(); // Keep this for fast in-memory latest status
    }

    async start() {
        console.log(`Starting scanner loop every ${this.intervalMs}ms`);
        this.scanAll();
        this.intervalId = setInterval(() => this.scanAll(), this.intervalMs);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    async getStatus() {
        // Build the latest status combined with 24h uptime metrics
        const services = await this.db.getAllServices();
        const uptimes = await this.db.getRecentUptimePercentages();

        return services.map(service => {
            const currentStatus = this.statusMap.get(service.id) || {
                status: 'unknown',
                lastChecked: null,
                latencyMs: null
            };

            return {
                service,
                status: currentStatus.status,
                lastChecked: currentStatus.lastChecked,
                latencyMs: currentStatus.latencyMs,
                uptimePercent: uptimes[service.id] || null
            };
        });
    }

    async scanAll() {
        try {
            const services = await this.db.getAllServices();
            for (const service of services) {
                this.scanService(service);
            }
        } catch (err) {
            console.error('Scanner failed to load services from DB', err);
        }
    }

    async scanService(service) {
        let result = false;
        let latency = null;
        const startTime = Date.now();

        try {
            if (service.type === 'ping') {
                const res = await ping.promise.probe(service.host, { timeout: 5 });
                result = res.alive;
                latency = res.time !== 'unknown' ? parseInt(res.time) : null;
            } else if (service.type === 'http') {
                const url = new URL(service.url);
                const reqLib = url.protocol === 'https:' ? https : http;

                result = await new Promise((resolve) => {
                    const req = reqLib.get(service.url, { timeout: 5000 }, (res) => {
                        resolve(res.statusCode >= 200 && res.statusCode < 400); // Consider redirects as up
                    });

                    req.on('error', () => resolve(false));
                    req.on('timeout', () => {
                        req.destroy();
                        resolve(false);
                    });
                });
                latency = Date.now() - startTime;
            }

            const finalStatus = result ? 'up' : 'down';

            // Update fast in-memory map
            this.statusMap.set(service.id, {
                status: finalStatus,
                lastChecked: new Date(),
                latencyMs: latency
            });

            // Log to database
            await this.db.recordStatus(service.id, finalStatus, latency);

            console.log(`[${new Date().toISOString()}] Checked ${service.id}: ${finalStatus.toUpperCase()}`);
        } catch (error) {
            console.error(`Error scanning ${service.id}:`, error.message);

            this.statusMap.set(service.id, {
                status: 'down',
                lastChecked: new Date(),
                latencyMs: null
            });
            await this.db.recordStatus(service.id, 'down', null);
        }
    }
}

module.exports = Scanner;

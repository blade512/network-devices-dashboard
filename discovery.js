const portscanner = require('portscanner');
const networkInterfaces = require('network-interfaces');
const ping = require('ping');

// Common ports to scan if a host is alive
const TARGET_PORTS = [
    { port: 80, name: 'HTTP Web Server', type: 'http', icon: 'public' },
    { port: 443, name: 'HTTPS Secure Web', type: 'http', icon: 'lock' },
    { port: 22, name: 'SSH Terminal', type: 'ping', icon: 'terminal' },
    { port: 3306, name: 'MySQL Database', type: 'ping', icon: 'storage' },
    { port: 5432, name: 'PostgreSQL Database', type: 'ping', icon: 'storage' },
    { port: 8080, name: 'Dev Web Server', type: 'http', icon: 'web' },
    { port: 3000, name: 'Node.js App', type: 'http', icon: 'javascript' }
];

class DiscoveryEngine {
    constructor(dbHelpers, intervalMs = 60000 * 5) { // Run every 5 minutes by default
        this.db = dbHelpers;
        this.intervalMs = intervalMs;
        this.isScanning = false;
    }

    start() {
        console.log(`Starting Network Discovery Engine every ${this.intervalMs / 1000}s`);
        // Run initial scan after a short delay to let things boot
        setTimeout(() => this.scanNetwork(), 5000);
        this.intervalId = setInterval(() => this.scanNetwork(), this.intervalMs);
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
    }

    getLocalSubnets() {
        const subnets = [];
        const os = require('os');
        const interfaces = os.networkInterfaces();

        for (const name in interfaces) {
            const ifaces = interfaces[name];
            ifaces.forEach(iface => {
                // Ignore internal/loopback and only grab IPv4
                if (!iface.internal && iface.family === 'IPv4') {
                    // Very simple subnet calculation assuming /24 for local networks
                    const parts = iface.address.split('.');
                    if (parts.length === 4) {
                        const baseIp = `${parts[0]}.${parts[1]}.${parts[2]}.`;
                        subnets.push({ baseIp, localIp: iface.address });
                    }
                }
            });
        }
        return subnets;
    }

    async scanNetwork() {
        if (this.isScanning) return;
        this.isScanning = true;

        const subnets = this.getLocalSubnets();
        console.log(`[Discovery] Starting sweep of ${subnets.length} subnets...`);

        try {
            for (const subnet of subnets) {
                // To keep it fast, we'll only scan a small subset of the /24 (e.g. 1-50) for this demo.
                // A full 255 scan takes significantly longer without native nmap bindings in parallel.
                const scanRange = 50;

                console.log(`[Discovery] Sweeping ${subnet.baseIp}1 to ${scanRange}`);

                // 1. Fast Ping Sweep
                const activeHosts = [];
                const promises = [];

                for (let i = 1; i <= scanRange; i++) {
                    const targetIp = `${subnet.baseIp}${i}`;

                    promises.push(
                        ping.promise.probe(targetIp, { timeout: 2 }).then(res => {
                            if (res.alive) activeHosts.push(targetIp);
                        })
                    );
                }

                await Promise.all(promises);
                console.log(`[Discovery] Found ${activeHosts.length} active hosts on ${subnet.baseIp}x.`);

                // 2. Port Scan the active hosts
                for (const host of activeHosts) {
                    await this.scanHostPorts(host);
                }
            }
        } catch (err) {
            console.error('[Discovery] Error during scan:', err);
        } finally {
            console.log(`[Discovery] Sweep complete.`);
            this.isScanning = false;
        }
    }

    async scanHostPorts(hostIp) {
        for (const target of TARGET_PORTS) {
            try {
                const status = await portscanner.checkPortStatus(target.port, hostIp);
                if (status === 'open') {
                    console.log(`[Discovery] Found ${target.name} on ${hostIp}:${target.port}`);

                    // Construct service object
                    const serviceId = `auto_${hostIp.replace(/\./g, '_')}_${target.port}`;
                    const service = {
                        id: serviceId,
                        name: `${target.name} (${hostIp})`,
                        type: target.type,
                        icon: target.icon || 'api'
                    };

                    if (target.type === 'http') {
                        const protocol = target.port === 443 ? 'https' : 'http';
                        service.url = `${protocol}://${hostIp}:${target.port}`;
                    } else {
                        service.host = hostIp;
                    }

                    // Upsert into DB
                    const added = await this.db.upsertDiscoveredService(service);
                    if (added) {
                        console.log(`[Discovery] Added newly discovered service to tracking: ${service.name}`);
                    }
                }
            } catch (err) {
                // Ignore individual port scan errors quietly to keep logs clean
            }
        }
    }
}

module.exports = DiscoveryEngine;

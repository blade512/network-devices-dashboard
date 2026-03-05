const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'scanner.db');
const db = new sqlite3.Database(dbPath);

function initDb() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create tables
            db.run(`CREATE TABLE IF NOT EXISTS services (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                host TEXT,
                url TEXT,
                icon TEXT,
                hidden BOOLEAN DEFAULT 0
            )`, (err) => {
                if (err) return reject(err);
            });

            // Make sure legacy DBs get the hidden column added safely
            db.run(`ALTER TABLE services ADD COLUMN hidden BOOLEAN DEFAULT 0`, (err) => {
                // Ignore "duplicate column name" error if it already exists
            });

            db.run(`CREATE TABLE IF NOT EXISTS status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_id TEXT NOT NULL,
                status TEXT NOT NULL,
                latency_ms INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
            )`, (err) => {
                if (err) return reject(err);
            });

            // Clean up old history automatically (older than 7 days)
            db.run(`DELETE FROM status_history WHERE timestamp <= datetime('now', '-7 days')`);

            resolve();
        });
    });
}

// Data access methods
const dbHelpers = {
    getAllServices: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM services WHERE hidden = 0`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    addService: (service) => {
        return new Promise((resolve, reject) => {
            const { id, name, type, host, url, icon } = service;
            db.run(`INSERT INTO services (id, name, type, host, url, icon) VALUES (?, ?, ?, ?, ?, ?)`,
                [id, name, type, host || null, url || null, icon || 'api'],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });
    },

    updateService: (id, service) => {
        return new Promise((resolve, reject) => {
            const { name, type, host, url, icon } = service;
            db.run(`UPDATE services SET name=?, type=?, host=?, url=?, icon=? WHERE id=?`,
                [name, type, host || null, url || null, icon || 'api', id],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                });
        });
    },

    deleteService: (id) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM services WHERE id=?`, [id], function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },

    hideService: (id) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE services SET hidden = 1 WHERE id=?`, [id], function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },

    upsertDiscoveredService: (service) => {
        return new Promise((resolve, reject) => {
            const { id, name, type, host, url, icon } = service;

            // Check if it already exists
            db.get(`SELECT id FROM services WHERE id = ?`, [id], (err, row) => {
                if (err) return reject(err);

                if (row) {
                    // Ignore if already tracked. We don't want to overwrite custom user names.
                    resolve(false);
                } else {
                    // Insert new discovered service
                    db.run(`INSERT INTO services (id, name, type, host, url, icon) VALUES (?, ?, ?, ?, ?, ?)`,
                        [id, name, type, host || null, url || null, icon || 'api'],
                        function (insertErr) {
                            if (insertErr) reject(insertErr);
                            else resolve(true); // True means it was added
                        });
                }
            });
        });
    },

    recordStatus: (serviceId, status, latencyMs) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO status_history (service_id, status, latency_ms) VALUES (?, ?, ?)`,
                [serviceId, status, latencyMs || null],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });
    },

    getRecentUptimePercentages: () => {
        return new Promise((resolve, reject) => {
            // Calculate uptime over the last 24 hours
            const query = `
                SELECT 
                    service_id,
                    CAST(SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 as uptime_percent
                FROM status_history
                WHERE timestamp > datetime('now', '-24 hours')
                GROUP BY service_id
            `;
            db.all(query, (err, rows) => {
                if (err) reject(err);
                else {
                    const uptimeMap = {};
                    rows.forEach(r => {
                        uptimeMap[r.service_id] = r.uptime_percent.toFixed(2);
                    });
                    resolve(uptimeMap);
                }
            });
        });
    }
};

module.exports = {
    initDb,
    ...dbHelpers
};

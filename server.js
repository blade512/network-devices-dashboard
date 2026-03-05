const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const Scanner = require('./scanner');
const DiscoveryEngine = require('./discovery');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let scanner;
let discovery;

// --- API Endpoints ---

// Get dashboard status
app.get('/api/status', async (req, res) => {
    try {
        if (!scanner) return res.status(503).json({ error: 'Scanner not initialized' });
        const status = await scanner.getStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CRUD for Services

// Get all services flat
app.get('/api/services', async (req, res) => {
    try {
        const services = await db.getAllServices();
        res.json(services);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a service
app.post('/api/services', async (req, res) => {
    try {
        const id = req.body.id || req.body.name.toLowerCase().replace(/\s+/g, '-');
        await db.addService({ ...req.body, id });
        res.status(201).json({ id, message: 'Service added successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Hide a service
app.patch('/api/services/:id/hide', async (req, res) => {
    try {
        const changes = await db.hideService(req.params.id);
        if (changes === 0) return res.status(404).json({ error: 'Service not found' });

        // Remove from scanner's active pool map so it stops pinging immediately
        if (scanner) scanner.statusMap.delete(req.params.id);

        res.json({ message: 'Service hidden successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a service
app.put('/api/services/:id', async (req, res) => {
    try {
        const changes = await db.updateService(req.params.id, req.body);
        if (changes === 0) return res.status(404).json({ error: 'Service not found' });
        res.json({ message: 'Service updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a service
app.delete('/api/services/:id', async (req, res) => {
    try {
        const changes = await db.deleteService(req.params.id);
        if (changes === 0) return res.status(404).json({ error: 'Service not found' });

        // Also remove from scanner's active pool map so it disappears immediately
        if (scanner) scanner.statusMap.delete(req.params.id);

        res.json({ message: 'Service deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start server after DB initialization
db.initDb().then(() => {
    console.log('Database initialized successfully.');

    // Initialize and start scanner
    scanner = new Scanner(db, 10000); // Scan every 10 seconds
    scanner.start();

    // Initialize the Subnet Port Scanner (Background Engine)
    discovery = new DiscoveryEngine(db, 120000); // Scan network every 2 minutes
    discovery.start();

    app.listen(PORT, () => {
        console.log(`network-scanner server running at http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

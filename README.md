# Network Scanner Dashboard

A real-time, zero-touch network discovery dashboard and uptime monitor built with Node.js, SQLite, and vanilla Javascript. 

This project automatically sweeps your local subnets, discovers active endpoints and services (like routers, databases, or web apps), and visualizes their live status on a beautiful glassmorphism dashboard.

## Features

- 🕵️ **Zero-Touch Auto-Discovery**: A background engine automatically scans the `.1` to `.50` IP range of your active IPv4 network interfaces every 2 minutes.
- 🚦 **Intelligent Port Scanning**: Discovers what type of service is running by probing common ports (HTTP/80, HTTPS/443, SSH/22, Databases/3306, Node.js/3000, etc.) and assigns matching material icons.
- 📈 **Uptime Tracking**: The backend pings known services every 10 seconds, logging response times to an embedded SQLite database to calculate 24-hour uptime percentages.
- 🎨 **Premium UI**: Dark mode "glassmorphism" aesthetic with real-time DOM updates via polling, all without requiring a dedicated front-end framework.
- 🙈 **Hide Ignored Services**: Easily hide services you don't care about by hovering over their tile and clicking the "Hide" button. This completely removes them from the dashboard and tells the background engine to stop wasting CPU tracking them.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (`sqlite3`)
- **Network Tools**: `portscanner`, `ping`, native Node `os.networkInterfaces()`
- **Frontend**: HTML5, CSS3, Vanilla ES6 JavaScript (Fetch API)

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- npm (Node Package Manager)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/blade512/network-devices-dashboard
   cd network-scanner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Set your environment port:
   By default, the application runs on port `3000`. You can change this by setting the `PORT` environment variable.
   ```bash
   # On Windows
   set PORT=8080
   
   # On macOS/Linux
   export PORT=8080
   ```

### Running the Application

Start the auto-discovery engine and web server:
```bash
npm start
# or
node server.js
```

Once started, wait roughly 15-30 seconds for the initial network sweep to complete. 
Open your browser and navigate to:
```
http://localhost:3000
```

## How It Works

1. **`server.js`**: Initializes the SQLite database, mounts the REST Express API (`/api/services`, `/api/status`), and starts two background tasks.
2. **`scanner.js`**: A high-frequency polling script that iterates through your tracked database services every 10 seconds, checking latency and updating `status_history`.
3. **`discovery.js`**: A low-frequency engine that runs every 2 minutes. It grabs your local subnet IP scheme, parallel-pings local hosts, and sweeps common ports to insert new nodes directly into SQLite.

## License

This project is open-source and available under the MIT License.

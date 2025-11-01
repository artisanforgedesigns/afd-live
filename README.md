# AFD Live



## Overview

A minimal web app for setting timers that are saved directly on the local device. This application allows you to view your devices, toggle them on/off, and set randomized timers that execute directly on the device hardware.

## Features

- **OAuth Authentication**: Secure login with eWeLink account credentials
- **Device Management**: View all devices with online/offline status
- **Device Control**: Toggle devices on/off with real-time updates
- **Device-Local Timers**: Set timers that run on device hardware
  - Randomized duration between min/max range
  - Timers persist even if browser closes or network connection drops
  - Supports both single-channel and multi-channel devices

## Requirements

- Node.js (v14 or higher recommended)
- eWeLink Developer Account credentials (APP_ID and APP_SECRET)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd afd-live
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Edit `.env` and add your eWeLink Developer credentials:
```
APP_ID=your_app_id_here
APP_SECRET=your_app_secret_here
REGION=us
PORT=4001
```

5. Configure OAuth redirect URL:
   - Go to https://dev.ewelink.cc/
   - Set the redirect URL to: `http://127.0.0.1:4001/redirectUrl`

## Usage

Start the application:
```bash
npm start
```

The server will start on port 4001 (or your configured PORT) and automatically open your browser to `http://127.0.0.1:4001/`

## Application Structure

### Pages

**Devices Page**
- Lists all eWeLink devices from your account
- Shows device name, ID, and online status
- Toggle switches to control device power state
- Offline devices are disabled (grayed out)

**Timer Page**
- Set min/max duration range in minutes
- Select a device from the dropdown
- Random time is selected within the specified range
- Timer is set on the device itself (not browser-based)
- Success message displays device name, duration, and unlock time

## Technical Details

### Architecture

The application consists of two main files:
- `app.js`: Koa server handling authentication and API routes
- `index.html`: Single-page application with client-side routing

### API Endpoints

- `GET /`: Serves the frontend HTML
- `GET /login`: Initiates OAuth flow
- `GET /redirectUrl`: OAuth callback handler
- `GET /devices`: Returns user's devices (with automatic token refresh)
- `POST /control`: Controls device on/off state
- `POST /set-timer`: Sets device-local timers

### Timer Implementation

Timers use eWeLink's native device timer capability via the `/v2/device/thing/status` API endpoint:

- Timer Type: "once" with "delay" coolkit_timer_type
- Timer ID: Generated using `crypto.randomUUID()`
- Execution Time: Calculated as UTC timestamp
- Persistence: Runs on device hardware, survives network outages

**Device Compatibility:**
- Single-channel devices: Uses `{ switch: 'off' }` format
- Multi-channel devices: Uses outlet 0 (first channel) with `{ switches: [{ switch: 'off', outlet: 0 }] }` format

### Token Management

- Access tokens are automatically refreshed when expired
- Tokens are stored in `token.json` (gitignored)
- Access token lifetime: 30 days
- Refresh token lifetime: 60 days

## Configuration

All configuration is managed through environment variables in `.env`:

- `APP_ID`: Your eWeLink Developer App ID (required)
- `APP_SECRET`: Your eWeLink Developer App Secret (required)
- `REGION`: eWeLink API region (default: 'us')
- `PORT`: Server port (default: 4001)

## Project Philosophy

This project prioritizes extreme simplicity:
- No build process, no bundlers, no TypeScript
- Single-file server architecture
- Single HTML file with inline CSS/JS
- Minimal dependencies
- No external configuration files beyond `.env`

## Dependencies

- **koa**: Web framework
- **koa-bodyparser**: Request body parsing
- **koa-router**: Routing middleware
- **ewelink-api-next**: eWeLink API client
- **dotenv**: Environment variable management
- **open**: Automatic browser opening

## Development

The application runs in development mode by default. The server will automatically open your browser when started.

To stop the server, press `Ctrl+C` in the terminal.

## Security Notes

- Never commit your `.env` file or `token.json` to version control
- Keep your APP_ID and APP_SECRET confidential
- The redirect URL must match exactly in your eWeLink Developer settings
- Use `127.0.0.1` instead of `localhost` for the redirect URL

## API Documentation

For detailed eWeLink API documentation, refer to:
https://coolkit-technologies.github.io/eWeLink-API/#/en/PlatformOverview

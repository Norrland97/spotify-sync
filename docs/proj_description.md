# Spotify Sync App - Project Documentation

## Project Overview

A cross-platform mobile application that enables two users to listen to Spotify in perfect synchronization. The app ensures both devices play the same songs at the same time with minimal drift, including support for micro-adjustments (10ms - 5s) to compensate for network or device-specific latency.

### Key Features
- Real-time synchronized playback between two devices
- Host/Client architecture (one leads, one follows)
- Automatic sync checks every 2 minutes and at song transitions
- Manual micro-adjustment controls (±5 seconds)
- Cross-platform support (iOS & Android)
- Clean separation of UI and business logic

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────┐         ┌─────────────────┐
│   Host Device   │         │  Client Device  │
│                 │         │                 │
│  ┌───────────┐  │         │  ┌───────────┐  │
│  │    UI     │  │         │  │    UI     │  │
│  └─────┬─────┘  │         │  └─────┬─────┘  │
│        │        │         │        │        │
│  ┌─────▼─────┐  │         │  ┌─────▼─────┐  │
│  │  Logic    │  │         │  │  Logic    │  │
│  │  Layer    │  │         │  │  Layer    │  │
│  └─────┬─────┘  │         │  └─────┬─────┘  │
│        │        │         │        │        │
│  ┌─────▼─────┐  │         │  ┌─────▼─────┐  │
│  │  Spotify  │  │         │  │  Spotify  │  │
│  │    SDK    │  │         │  │    SDK    │  │
│  └───────────┘  │         │  └───────────┘  │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │    WebSocket/REST API     │
         └───────────┬───────────────┘
                     │
              ┌──────▼──────┐
              │   Backend   │
              │   Server    │
              │             │
              │  ┌────────┐ │
              │  │  Sync  │ │
              │  │ Engine │ │
              │  └────────┘ │
              │             │
              │  ┌────────┐ │
              │  │Session │ │
              │  │Manager │ │
              │  └────────┘ │
              └─────────────┘
```

### Component Breakdown

#### 1. **Mobile App (React Native)**

**UI Layer** (`/src/screens/`)
- Authentication screen
- Session creation/joining screen
- Main playback screen with controls
- Sync adjustment screen

**Logic Layer** (`/src/services/`)
- `SpotifyService`: Handles all Spotify SDK interactions
- `SyncService`: Manages synchronization logic
- `WebSocketService`: Handles real-time communication with backend
- `SessionService`: Manages session state

**Models** (`/src/models/`)
- Session state
- Playback state
- User preferences

#### 2. **Backend Server (Node.js)**

**API Layer** (`/src/routes/`)
- REST endpoints for session management
- WebSocket handlers for real-time sync

**Business Logic** (`/src/services/`)
- `SessionManager`: Creates and manages sync sessions
- `SyncEngine`: Calculates sync adjustments and timing
- `StateManager`: Maintains current state of all active sessions

**Data Layer** (`/src/models/`)
- Session model
- User model
- Playback state model

---

## Technology Stack

### Frontend
- **Framework**: React Native (0.72+)
- **Language**: TypeScript
- **State Management**: React Context API + Hooks
- **Spotify Integration**: `react-native-spotify-remote`
- **WebSocket**: `socket.io-client`
- **UI Library**: React Native Paper or Native Base

### Backend
- **Framework**: Node.js with Express
- **Language**: TypeScript
- **WebSocket**: `socket.io`
- **Database**: Redis (for session state) + PostgreSQL (for persistent data)
- **Authentication**: Spotify OAuth 2.0

---

## API & Tools

### Spotify Web API Endpoints Used

#### Authentication
```
POST https://accounts.spotify.com/api/token
- Get access token using OAuth 2.0
```

#### Playback Control
```
GET  /v1/me/player
- Get current playback state

PUT  /v1/me/player/play
- Start/resume playback

PUT  /v1/me/player/pause
- Pause playback

PUT  /v1/me/player/seek?position_ms={position}
- Seek to position in current track

POST /v1/me/player/queue?uri={track_uri}
- Add track to queue
```

#### Track Information
```
GET /v1/me/player/currently-playing
- Get currently playing track

GET /v1/tracks/{id}
- Get track details
```

### Backend API Endpoints

#### Session Management
```
POST   /api/sessions
- Create new sync session
- Returns: sessionId, hostToken

POST   /api/sessions/:id/join
- Join existing session
- Returns: clientToken

DELETE /api/sessions/:id
- End sync session
```

#### Sync Control
```
GET    /api/sessions/:id/state
- Get current session state

PATCH  /api/sessions/:id/offset
- Update client offset adjustment
```

### WebSocket Events

#### Client → Server
```
connect
- Establish WebSocket connection

join_session { sessionId, role, userId }
- Join a sync session

playback_state { trackUri, position, isPlaying, timestamp }
- Host sends current playback state

request_sync
- Client requests immediate sync check
```

#### Server → Client
```
sync_command { action, trackUri, position, timestamp }
- Server tells client to sync
- Actions: 'play', 'pause', 'seek', 'switch_track'

session_ended
- Notify clients session has ended

sync_status { drift, lastSync }
- Status update for monitoring
```

---

## Synchronization Logic

### Timing Strategy

**1. Initial Sync**
- When client joins, immediately sync to host's current position
- Account for network latency by measuring round-trip time

**2. Periodic Sync (Every 2 minutes)**
- Host sends current state: `{ trackUri, position, timestamp }`
- Server calculates expected client position
- If drift > 1000ms, send sync command

**3. Song Transition Sync**
- Host detects song change (current trackUri ≠ previous trackUri)
- Immediately broadcast new track to client
- Client seeks to host's position in new track

**4. Manual Sync Events**
- Host pauses/plays → immediately sync client
- Either device loses connection → resync on reconnect

### Drift Calculation

```typescript
// Pseudo-code for sync calculation
function calculateDrift(hostState, clientState, userOffset) {
  const networkLatency = measureRoundTripTime() / 2;
  const timeSinceHostReport = Date.now() - hostState.timestamp;
  
  const expectedHostPosition = hostState.position + timeSinceHostReport;
  const expectedClientPosition = expectedHostPosition + userOffset + networkLatency;
  
  const drift = clientState.position - expectedClientPosition;
  
  return drift; // positive = client ahead, negative = client behind
}
```

### Sync Thresholds
- **< 500ms drift**: No action needed
- **500ms - 3000ms drift**: Gradual adjustment over next few seconds
- **> 3000ms drift**: Immediate seek to correct position

---

## Data Flow Example

### Scenario: Client joins ongoing session

```
1. Client opens app
   └─> UI: Shows "Join Session" screen

2. Client enters session code
   └─> Logic: SessionService.joinSession(code)
       └─> Backend: POST /api/sessions/:code/join
           └─> Backend: Returns session details

3. Backend sends current host state via WebSocket
   └─> sync_command { action: 'play', trackUri: 'xyz', position: 45000 }

4. Client receives sync command
   └─> Logic: SyncService.handleSyncCommand()
       └─> Logic: SpotifyService.playTrack('xyz')
       └─> Logic: SpotifyService.seek(45000 + offset)
       └─> UI: Updates to show playing state

5. Every 2 minutes:
   └─> Host: Sends current state
       └─> Backend: Calculates drift
           └─> If drift > threshold:
               └─> Client: Receives sync_command
```

---

## Project Structure

### Mobile App Structure
```
spotify-sync-app/
├── src/
│   ├── screens/
│   │   ├── AuthScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── CreateSessionScreen.tsx
│   │   ├── JoinSessionScreen.tsx
│   │   └── PlaybackScreen.tsx
│   │
│   ├── components/
│   │   ├── PlaybackControls.tsx
│   │   ├── SyncAdjustment.tsx
│   │   ├── TrackInfo.tsx
│   │   └── ConnectionStatus.tsx
│   │
│   ├── services/
│   │   ├── SpotifyService.ts
│   │   ├── SyncService.ts
│   │   ├── WebSocketService.ts
│   │   └── SessionService.ts
│   │
│   ├── hooks/
│   │   ├── useSpotify.ts
│   │   ├── useSync.ts
│   │   └── useSession.ts
│   │
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   ├── SessionContext.tsx
│   │   └── PlaybackContext.tsx
│   │
│   ├── types/
│   │   ├── session.ts
│   │   ├── playback.ts
│   │   └── spotify.ts
│   │
│   └── utils/
│       ├── timeSync.ts
│       └── constants.ts
│
├── App.tsx
└── package.json
```

### Backend Structure
```
spotify-sync-backend/
├── src/
│   ├── routes/
│   │   ├── sessions.ts
│   │   └── auth.ts
│   │
│   ├── services/
│   │   ├── SessionManager.ts
│   │   ├── SyncEngine.ts
│   │   └── StateManager.ts
│   │
│   ├── websocket/
│   │   ├── handlers.ts
│   │   └── events.ts
│   │
│   ├── models/
│   │   ├── Session.ts
│   │   ├── User.ts
│   │   └── PlaybackState.ts
│   │
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── validation.ts
│   │
│   └── utils/
│       ├── timeSync.ts
│       └── redis.ts
│
├── server.ts
└── package.json
```

---

## Development Phases

### Phase 1: Foundation (Week 1-2)
- Set up React Native project with TypeScript
- Implement Spotify OAuth authentication
- Create basic UI screens
- Set up backend server with WebSocket support

### Phase 2: Core Sync Logic (Week 3-4)
- Implement SpotifyService for playback control
- Build SyncService with drift calculation
- Create SessionManager on backend
- Implement basic host/client communication

### Phase 3: Synchronization Features (Week 5-6)
- Implement 2-minute periodic sync
- Add song transition detection and sync
- Build micro-adjustment controls
- Add network latency compensation

### Phase 4: Polish & Testing (Week 7-8)
- Error handling and edge cases
- UI/UX improvements
- Cross-device testing
- Performance optimization

---

## Getting Started

### Prerequisites
- Node.js 18+
- React Native development environment
- Spotify Premium accounts (2) for testing
- Spotify Developer account for API credentials

### Setup Steps

1. **Register Spotify App**
   - Go to https://developer.spotify.com/dashboard
   - Create new app
   - Add redirect URI: `spotify-sync://callback`
   - Note your Client ID and Client Secret

2. **Clone & Install**
   ```bash
   # Backend
   cd spotify-sync-backend
   npm install
   
   # Frontend
   cd ../spotify-sync-app
   npm install
   ```

3. **Configure Environment**
   - Backend: Create `.env` with Spotify credentials
   - Frontend: Update config with backend URL

4. **Run Development**
   ```bash
   # Backend
   npm run dev
   
   # Frontend (separate terminal)
   npm run start
   npm run android  # or npm run ios
   ```

---

## Security Considerations

- Never store Spotify credentials in the app
- Use token refresh flow for long sessions
- Validate all WebSocket messages on backend
- Implement rate limiting on API endpoints
- Use HTTPS for all API communication
- Encrypt session codes

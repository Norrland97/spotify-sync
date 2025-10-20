# Backend Integration Guide

## Overview
This guide explains how to connect the frontend prototype to a backend server. The frontend uses a clean service layer architecture that makes it easy for backend developers to implement the actual API calls.

---

## Frontend Service Layer Structure

The frontend has **4 service classes** that backend developers need to implement:

### 1. `SpotifyService` - Spotify SDK Integration
**Location**: `src/services/SpotifyService.ts`

**Responsibilities**:
- Authenticate with Spotify
- Control playback (play, pause, seek)
- Get current playback state

**Methods to implement**:
```typescript
async authenticate(): Promise<boolean>
async getCurrentPlayback(): Promise<PlaybackState | null>
async play(trackUri?: string): Promise<void>
async pause(): Promise<void>
async seek(positionMs: number): Promise<void>
```

### 2. `WebSocketService` - Real-time Communication
**Location**: `src/services/WebSocketService.ts`

**Responsibilities**:
- Establish WebSocket connection to backend
- Send and receive real-time events
- Handle reconnection logic

**Methods to implement**:
```typescript
connect(url: string): Promise<void>
emit(event: string, data: any): void
on(event: string, callback: Function): void
disconnect(): void
```

### 3. `SessionService` - Session Management
**Location**: `src/services/SessionService.ts`

**Responsibilities**:
- Create new sync sessions
- Join existing sessions
- Update session settings

**Methods to implement**:
```typescript
async createSession(): Promise<string>
async joinSession(sessionId: string): Promise<boolean>
async updateOffset(offset: number): Promise<void>
```

### 4. `SyncService` - Synchronization Logic
**Location**: `src/services/SyncService.ts`

**Responsibilities**:
- Broadcast host state every 2 minutes
- Handle sync commands from backend
- Watch for song changes

**Methods to implement**:
```typescript
startHostSync(): void
stopSync(): void
async requestSync(): Promise<void>
```

---

## Backend API Specification

### Base URL
```
http://your-backend-url.com/api
```

For local development:
```
http://localhost:3001/api
```

### Authentication
All API requests should include the Spotify access token:
```
Authorization: Bearer <spotify_access_token>
```

---

## REST API Endpoints

### 1. Create Session
**Endpoint**: `POST /api/sessions`

**Request Body**:
```json
{
  "userId": "spotify_user_id",
  "userName": "User Display Name"
}
```

**Response** (201 Created):
```json
{
  "sessionId": "ABC123",
  "role": "host",
  "createdAt": "2025-10-20T10:30:00Z",
  "expiresAt": "2025-10-20T14:30:00Z"
}
```

**Frontend Implementation Location**:
```typescript
// src/services/SessionService.ts
async createSession(): Promise<string> {
  const response = await fetch(`${API_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    body: JSON.stringify({
      userId: currentUserId,
      userName: currentUserName
    })
  });
  const data = await response.json();
  return data.sessionId;
}
```

---

### 2. Join Session
**Endpoint**: `POST /api/sessions/:sessionId/join`

**Request Body**:
```json
{
  "userId": "spotify_user_id",
  "userName": "User Display Name"
}
```

**Response** (200 OK):
```json
{
  "sessionId": "ABC123",
  "role": "client",
  "hostName": "Host User Name",
  "joinedAt": "2025-10-20T10:35:00Z"
}
```

**Error Response** (404 Not Found):
```json
{
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```

**Frontend Implementation Location**:
```typescript
// src/services/SessionService.ts
async joinSession(sessionId: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    body: JSON.stringify({
      userId: currentUserId,
      userName: currentUserName
    })
  });
  return response.ok;
}
```

---

### 3. Update Client Offset
**Endpoint**: `PATCH /api/sessions/:sessionId/offset`

**Request Body**:
```json
{
  "offsetMs": 150
}
```

**Response** (200 OK):
```json
{
  "sessionId": "ABC123",
  "offsetMs": 150,
  "updatedAt": "2025-10-20T10:40:00Z"
}
```

**Frontend Implementation Location**:
```typescript
// src/services/SessionService.ts
async updateOffset(offset: number): Promise<void> {
  await fetch(`${API_URL}/sessions/${sessionId}/offset`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    body: JSON.stringify({ offsetMs: offset })
  });
}
```

---

### 4. Get Session State
**Endpoint**: `GET /api/sessions/:sessionId/state`

**Response** (200 OK):
```json
{
  "sessionId": "ABC123",
  "host": {
    "userId": "host_id",
    "userName": "Host Name"
  },
  "client": {
    "userId": "client_id",
    "userName": "Client Name",
    "offsetMs": 150
  },
  "currentTrack": {
    "uri": "spotify:track:xxx",
    "name": "Song Name",
    "artist": "Artist Name",
    "position": 45000,
    "duration": 180000,
    "isPlaying": true
  },
  "lastSync": "2025-10-20T10:40:00Z"
}
```

---

### 5. End Session
**Endpoint**: `DELETE /api/sessions/:sessionId`

**Response** (204 No Content)

---

## WebSocket Events

### Connection URL
```
ws://your-backend-url.com
```

For local development:
```
ws://localhost:3001
```

### Connection Flow
```typescript
// src/services/WebSocketService.ts
import io from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(url, {
        auth: {
          token: spotifyAccessToken
        }
      });

      this.socket.on('connect', () => {
        console.log('Connected to backend');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });
    });
  }
}
```

---

### Events: Client → Server

#### 1. Join Session
**Event**: `join_session`

**Payload**:
```json
{
  "sessionId": "ABC123",
  "role": "client",
  "userId": "spotify_user_id"
}
```

**Frontend Implementation**:
```typescript
// After WebSocket connection established
this.socket.emit('join_session', {
  sessionId,
  role: 'client',
  userId: currentUserId
});
```

---

#### 2. Broadcast Playback State (Host only)
**Event**: `playback_state`

**Payload**:
```json
{
  "sessionId": "ABC123",
  "trackUri": "spotify:track:xxx",
  "position": 45000,
  "isPlaying": true,
  "timestamp": 1697800000000
}
```

**Frontend Implementation**:
```typescript
// src/services/SyncService.ts - called every 2 minutes by host
private async broadcastState(): Promise<void> {
  const state = await this.spotifyService.getCurrentPlayback();
  if (state) {
    this.wsService.emit('playback_state', {
      sessionId: currentSessionId,
      trackUri: state.trackUri,
      position: state.position,
      isPlaying: state.isPlaying,
      timestamp: Date.now()
    });
  }
}
```

---

#### 3. Request Immediate Sync (Client only)
**Event**: `request_sync`

**Payload**:
```json
{
  "sessionId": "ABC123"
}
```

**Frontend Implementation**:
```typescript
// Triggered when user clicks "Force Sync Now" button
async requestSync(): Promise<void> {
  this.wsService.emit('request_sync', {
    sessionId: currentSessionId
  });
}
```

---

### Events: Server → Client

#### 1. Sync Command
**Event**: `sync_command`

**Payload**:
```json
{
  "action": "play",
  "trackUri": "spotify:track:xxx",
  "position": 45150,
  "timestamp": 1697800000000
}
```

**Actions**: `"play"` | `"pause"` | `"seek"` | `"switch_track"`

**Frontend Implementation**:
```typescript
// src/services/SyncService.ts
private setupListeners(): void {
  this.wsService.on('sync_command', async (data) => {
    const { action, trackUri, position } = data;
    
    switch (action) {
      case 'play':
        await this.spotifyService.play(trackUri);
        await this.spotifyService.seek(position);
        break;
      case 'pause':
        await this.spotifyService.pause();
        break;
      case 'seek':
        await this.spotifyService.seek(position);
        break;
      case 'switch_track':
        await this.spotifyService.play(trackUri);
        await this.spotifyService.seek(0);
        break;
    }
  });
}
```

---

#### 2. Session Ended
**Event**: `session_ended`

**Payload**:
```json
{
  "sessionId": "ABC123",
  "reason": "host_disconnected"
}
```

**Reasons**: `"host_disconnected"` | `"session_expired"` | `"host_ended"`

**Frontend Implementation**:
```typescript
this.wsService.on('session_ended', (data) => {
  // Show notification to user
  alert(`Session ended: ${data.reason}`);
  // Navigate back to home screen
  navigateToHome();
});
```

---

#### 3. Sync Status Update
**Event**: `sync_status`

**Payload**:
```json
{
  "drift": 250,
  "lastSync": "2025-10-20T10:40:00Z",
  "quality": "good"
}
```

**Quality**: `"excellent"` (< 100ms) | `"good"` (< 500ms) | `"fair"` (< 1000ms) | `"poor"` (> 1000ms)

**Frontend Implementation**:
```typescript
this.wsService.on('sync_status', (data) => {
  // Update UI to show sync quality
  updateSyncIndicator(data.quality);
});
```

---

## Backend Sync Logic

### Drift Calculation Algorithm

The backend should calculate drift using this logic:

```typescript
// Backend pseudo-code
function calculateSyncCommand(hostState, clientState, clientOffset) {
  // 1. Get current time
  const now = Date.now();
  
  // 2. Calculate how much time has passed since host reported state
  const timeSinceHostReport = now - hostState.timestamp;
  
  // 3. Calculate where host should be NOW
  const expectedHostPosition = hostState.position + timeSinceHostReport;
  
  // 4. Add client's manual offset
  const targetClientPosition = expectedHostPosition + clientOffset;
  
  // 5. Calculate drift (difference between where client is and where they should be)
  const drift = clientState.position - targetClientPosition;
  
  // 6. Decide if sync command is needed
  if (Math.abs(drift) > 1000) { // More than 1 second drift
    return {
      action: 'seek',
      trackUri: hostState.trackUri,
      position: targetClientPosition,
      timestamp: now
    };
  }
  
  return null; // No sync needed
}
```

### When to Send Sync Commands

1. **Every 2 minutes** - Check drift and sync if needed
2. **Song transitions** - Immediately when host's trackUri changes
3. **Manual request** - When client sends `request_sync` event
4. **Play/Pause changes** - When host changes play state

---

## Environment Variables

### Frontend (.env)
```bash
# Backend API
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_WS_URL=ws://localhost:3001

# Spotify OAuth
REACT_APP_SPOTIFY_CLIENT_ID=your_spotify_client_id
REACT_APP_SPOTIFY_REDIRECT_URI=spotify-sync://callback
```

### Backend (.env)
```bash
# Server
PORT=3001
NODE_ENV=development

# Spotify API
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Database
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:password@localhost:5432/spotify_sync

# Session
SESSION_TIMEOUT_HOURS=4
SESSION_CODE_LENGTH=6
```

---

## Testing the Integration

### 1. Test REST API
```bash
# Create session
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SPOTIFY_TOKEN" \
  -d '{"userId": "test_user", "userName": "Test User"}'

# Join session
curl -X POST http://localhost:3001/api/sessions/ABC123/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SPOTIFY_TOKEN" \
  -d '{"userId": "test_user_2", "userName": "Test User 2"}'
```

### 2. Test WebSocket Connection
```javascript
// Browser console
const socket = io('ws://localhost:3001', {
  auth: { token: 'YOUR_SPOTIFY_TOKEN' }
});

socket.on('connect', () => console.log('Connected!'));
socket.emit('join_session', { sessionId: 'ABC123', role: 'client' });
```

### 3. Monitor WebSocket Events
```bash
# Backend should log:
[WebSocket] Client connected: socket_id_123
[WebSocket] join_session: { sessionId: 'ABC123', role: 'client' }
[Sync] Broadcasting state to session ABC123
```

---

## Frontend-Backend Data Flow Example

### Scenario: Client joins and syncs

```
1. CLIENT: User enters session code "ABC123"
   └─> Frontend: sessionService.joinSession("ABC123")
       └─> POST /api/sessions/ABC123/join
           └─> Backend: Validates session, returns success

2. CLIENT: Establishes WebSocket connection
   └─> Frontend: wsService.connect("ws://localhost:3001")
       └─> WebSocket connection established
           └─> Frontend: Emits 'join_session' event
               └─> Backend: Registers client in session

3. HOST: Every 2 minutes, broadcasts state
   └─> Frontend (Host): syncService.broadcastState()
       └─> Emits 'playback_state' event
           └─> Backend: Receives host state
               └─> Backend: Calculates drift for client
                   └─> Backend: Emits 'sync_command' to client
                       └─> Frontend (Client): Receives sync command
                           └─> Frontend: spotifyService.seek(position)

4. CLIENT: User adjusts offset by +100ms
   └─> Frontend: sessionService.updateOffset(100)
       └─> PATCH /api/sessions/ABC123/offset
           └─> Backend: Stores new offset
               └─> Backend: Recalculates and sends new sync command
```

---

## Implementation Checklist

### Frontend Tasks
- [ ] Replace mock `SpotifyService` with actual Spotify SDK calls
- [ ] Implement real `WebSocketService` using socket.io-client
- [ ] Connect `SessionService` to backend REST API
- [ ] Update `SyncService` to use real Spotify playback state
- [ ] Add error handling for network failures
- [ ] Implement token refresh logic
- [ ] Add loading states in UI

### Backend Tasks
- [ ] Set up Express server with CORS
- [ ] Implement WebSocket server using socket.io
- [ ] Create session management endpoints (POST, GET, DELETE)
- [ ] Implement sync engine with drift calculation
- [ ] Add Redis for session state storage
- [ ] Implement Spotify OAuth token validation
- [ ] Add rate limiting and security measures
- [ ] Set up logging and monitoring

### Integration Tasks
- [ ] Test create session flow end-to-end
- [ ] Test join session flow end-to-end
- [ ] Verify WebSocket events work correctly
- [ ] Test sync accuracy with real devices
- [ ] Test edge cases (disconnection, reconnection)
- [ ] Load test with multiple sessions
- [ ] Document any API changes

---

## Common Issues & Solutions

### Issue: WebSocket connection fails
**Solution**: 
- Check CORS settings on backend
- Verify WebSocket URL is correct
- Ensure backend is running on expected port

### Issue: Sync drift is too high
**Solution**:
- Measure actual network latency
- Adjust sync threshold in SyncService
- Consider using more frequent sync checks

### Issue: Spotify SDK errors
**Solution**:
- Verify Spotify Premium account
- Check Spotify app is installed and logged in
- Ensure OAuth token has correct scopes

---

## Next Steps

1. **Backend Developer**: Start by implementing the REST API endpoints for session management
2. **Frontend Developer**: Implement real Spotify SDK integration in SpotifyService
3. **Together**: Set up WebSocket connection and test end-to-end flow
4. **Polish**: Add error handling, loading states, and edge case handlin# Backend Integration Guide

## Overview
This guide explains how to connect the frontend prototype to a backend server. The frontend uses a clean service layer architecture that makes it easy for backend developers to implement the actual API calls.

---

## Frontend Service Layer Structure

The frontend has **4 service classes** that backend developers need to implement:

### 1. `SpotifyService` - Spotify SDK Integration
**Location**: `src/services/SpotifyService.ts`

**Responsibilities**:
- Authenticate with Spotify
- Control playback (play, pause, seek)
- Get current playback state

**Methods to implement**:
```typescript
async authenticate(): Promise<boolean>
async getCurrentPlayback(): Promise<PlaybackState | null>
async play(trackUri?: string): Promise<void>
async pause(): Promise<void>
async seek(positionMs: number): Promise<void>
```

### 2. `WebSocketService` - Real-time Communication
**Location**: `src/services/WebSocketService.ts`

**Responsibilities**:
- Establish WebSocket connection to backend
- Send and receive real-time events
- Handle reconnection logic

**Methods to implement**:
```typescript
connect(url: string): Promise<void>
emit(event: string, data: any): void
on(event: string, callback: Function): void
disconnect(): void
```

### 3. `SessionService` - Session Management
**Location**: `src/services/SessionService.ts`

**Responsibilities**:
- Create new sync sessions
- Join existing sessions
- Update session settings

**Methods to implement**:
```typescript
async createSession(): Promise<string>
async joinSession(sessionId: string): Promise<boolean>
async updateOffset(offset: number): Promise<void>
```

### 4. `SyncService` - Synchronization Logic
**Location**: `src/services/SyncService.ts`

**Responsibilities**:
- Broadcast host state every 2 minutes
- Handle sync commands from backend
- Watch for song changes

**Methods to implement**:
```typescript
startHostSync(): void
stopSync(): void
async requestSync(): Promise<void>
```

---

## Backend API Specification

### Base URL
```
http://your-backend-url.com/api
```

For local development:
```
http://localhost:3001/api
```

### Authentication
All API requests should include the Spotify access token:
```
Authorization: Bearer <spotify_access_token>
```

---

## REST API Endpoints

### 1. Create Session
**Endpoint**: `POST /api/sessions`

**Request Body**:
```json
{
  "userId": "spotify_user_id",
  "userName": "User Display Name"
}
```

**Response** (201 Created):
```json
{
  "sessionId": "ABC123",
  "role": "host",
  "createdAt": "2025-10-20T10:30:00Z",
  "expiresAt": "2025-10-20T14:30:00Z"
}
```

**Frontend Implementation Location**:
```typescript
// src/services/SessionService.ts
async createSession(): Promise<string> {
  const response = await fetch(`${API_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    body: JSON.stringify({
      userId: currentUserId,
      userName: currentUserName
    })
  });
  const data = await response.json();
  return data.sessionId;
}
```

---

### 2. Join Session
**Endpoint**: `POST /api/sessions/:sessionId/join`

**Request Body**:
```json
{
  "userId": "spotify_user_id",
  "userName": "User Display Name"
}
```

**Response** (200 OK):
```json
{
  "sessionId": "ABC123",
  "role": "client",
  "hostName": "Host User Name",
  "joinedAt": "2025-10-20T10:35:00Z"
}
```

**Error Response** (404 Not Found):
```json
{
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```

**Frontend Implementation Location**:
```typescript
// src/services/SessionService.ts
async joinSession(sessionId: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/sessions/${sessionId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    body: JSON.stringify({
      userId: currentUserId,
      userName: currentUserName
    })
  });
  return response.ok;
}
```

---

### 3. Update Client Offset
**Endpoint**: `PATCH /api/sessions/:sessionId/offset`

**Request Body**:
```json
{
  "offsetMs": 150
}
```

**Response** (200 OK):
```json
{
  "sessionId": "ABC123",
  "offsetMs": 150,
  "updatedAt": "2025-10-20T10:40:00Z"
}
```

**Frontend Implementation Location**:
```typescript
// src/services/SessionService.ts
async updateOffset(offset: number): Promise<void> {
  await fetch(`${API_URL}/sessions/${sessionId}/offset`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    body: JSON.stringify({ offsetMs: offset })
  });
}
```

---

### 4. Get Session State
**Endpoint**: `GET /api/sessions/:sessionId/state`

**Response** (200 OK):
```json
{
  "sessionId": "ABC123",
  "host": {
    "userId": "host_id",
    "userName": "Host Name"
  },
  "client": {
    "userId": "client_id",
    "userName": "Client Name",
    "offsetMs": 150
  },
  "currentTrack": {
    "uri": "spotify:track:xxx",
    "name": "Song Name",
    "artist": "Artist Name",
    "position": 45000,
    "duration": 180000,
    "isPlaying": true
  },
  "lastSync": "2025-10-20T10:40:00Z"
}
```

---

### 5. End Session
**Endpoint**: `DELETE /api/sessions/:sessionId`

**Response** (204 No Content)

---

## WebSocket Events

### Connection URL
```
ws://your-backend-url.com
```

For local development:
```
ws://localhost:3001
```

### Connection Flow
```typescript
// src/services/WebSocketService.ts
import io from 'socket.io-client';

class WebSocketService {
  private socket: Socket | null = null;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(url, {
        auth: {
          token: spotifyAccessToken
        }
      });

      this.socket.on('connect', () => {
        console.log('Connected to backend');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });
    });
  }
}
```

---

### Events: Client → Server

#### 1. Join Session
**Event**: `join_session`

**Payload**:
```json
{
  "sessionId": "ABC123",
  "role": "client",
  "userId": "spotify_user_id"
}
```

**Frontend Implementation**:
```typescript
// After WebSocket connection established
this.socket.emit('join_session', {
  sessionId,
  role: 'client',
  userId: currentUserId
});
```

---

#### 2. Broadcast Playback State (Host only)
**Event**: `playback_state`

**Payload**:
```json
{
  "sessionId": "ABC123",
  "trackUri": "spotify:track:xxx",
  "position": 45000,
  "isPlaying": true,
  "timestamp": 1697800000000
}
```

**Frontend Implementation**:
```typescript
// src/services/SyncService.ts - called every 2 minutes by host
private async broadcastState(): Promise<void> {
  const state = await this.spotifyService.getCurrentPlayback();
  if (state) {
    this.wsService.emit('playback_state', {
      sessionId: currentSessionId,
      trackUri: state.trackUri,
      position: state.position,
      isPlaying: state.isPlaying,
      timestamp: Date.now()
    });
  }
}
```

---

#### 3. Request Immediate Sync (Client only)
**Event**: `request_sync`

**Payload**:
```json
{
  "sessionId": "ABC123"
}
```

**Frontend Implementation**:
```typescript
// Triggered when user clicks "Force Sync Now" button
async requestSync(): Promise<void> {
  this.wsService.emit('request_sync', {
    sessionId: currentSessionId
  });
}
```

---

### Events: Server → Client

#### 1. Sync Command
**Event**: `sync_command`

**Payload**:
```json
{
  "action": "play",
  "trackUri": "spotify:track:xxx",
  "position": 45150,
  "timestamp": 1697800000000
}
```

**Actions**: `"play"` | `"pause"` | `"seek"` | `"switch_track"`

**Frontend Implementation**:
```typescript
// src/services/SyncService.ts
private setupListeners(): void {
  this.wsService.on('sync_command', async (data) => {
    const { action, trackUri, position } = data;
    
    switch (action) {
      case 'play':
        await this.spotifyService.play(trackUri);
        await this.spotifyService.seek(position);
        break;
      case 'pause':
        await this.spotifyService.pause();
        break;
      case 'seek':
        await this.spotifyService.seek(position);
        break;
      case 'switch_track':
        await this.spotifyService.play(trackUri);
        await this.spotifyService.seek(0);
        break;
    }
  });
}
```

---

#### 2. Session Ended
**Event**: `session_ended`

**Payload**:
```json
{
  "sessionId": "ABC123",
  "reason": "host_disconnected"
}
```

**Reasons**: `"host_disconnected"` | `"session_expired"` | `"host_ended"`

**Frontend Implementation**:
```typescript
this.wsService.on('session_ended', (data) => {
  // Show notification to user
  alert(`Session ended: ${data.reason}`);
  // Navigate back to home screen
  navigateToHome();
});
```

---

#### 3. Sync Status Update
**Event**: `sync_status`

**Payload**:
```json
{
  "drift": 250,
  "lastSync": "2025-10-20T10:40:00Z",
  "quality": "good"
}
```

**Quality**: `"excellent"` (< 100ms) | `"good"` (< 500ms) | `"fair"` (< 1000ms) | `"poor"` (> 1000ms)

**Frontend Implementation**:
```typescript
this.wsService.on('sync_status', (data) => {
  // Update UI to show sync quality
  updateSyncIndicator(data.quality);
});
```

---

## Backend Sync Logic

### Drift Calculation Algorithm

The backend should calculate drift using this logic:

```typescript
// Backend pseudo-code
function calculateSyncCommand(hostState, clientState, clientOffset) {
  // 1. Get current time
  const now = Date.now();
  
  // 2. Calculate how much time has passed since host reported state
  const timeSinceHostReport = now - hostState.timestamp;
  
  // 3. Calculate where host should be NOW
  const expectedHostPosition = hostState.position + timeSinceHostReport;
  
  // 4. Add client's manual offset
  const targetClientPosition = expectedHostPosition + clientOffset;
  
  // 5. Calculate drift (difference between where client is and where they should be)
  const drift = clientState.position - targetClientPosition;
  
  // 6. Decide if sync command is needed
  if (Math.abs(drift) > 1000) { // More than 1 second drift
    return {
      action: 'seek',
      trackUri: hostState.trackUri,
      position: targetClientPosition,
      timestamp: now
    };
  }
  
  return null; // No sync needed
}
```

### When to Send Sync Commands

1. **Every 2 minutes** - Check drift and sync if needed
2. **Song transitions** - Immediately when host's trackUri changes
3. **Manual request** - When client sends `request_sync` event
4. **Play/Pause changes** - When host changes play state

---

## Environment Variables

### Frontend (.env)
```bash
# Backend API
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_WS_URL=ws://localhost:3001

# Spotify OAuth
REACT_APP_SPOTIFY_CLIENT_ID=your_spotify_client_id
REACT_APP_SPOTIFY_REDIRECT_URI=spotify-sync://callback
```

### Backend (.env)
```bash
# Server
PORT=3001
NODE_ENV=development

# Spotify API
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Database
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:password@localhost:5432/spotify_sync

# Session
SESSION_TIMEOUT_HOURS=4
SESSION_CODE_LENGTH=6
```

---

## Testing the Integration

### 1. Test REST API
```bash
# Create session
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SPOTIFY_TOKEN" \
  -d '{"userId": "test_user", "userName": "Test User"}'

# Join session
curl -X POST http://localhost:3001/api/sessions/ABC123/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SPOTIFY_TOKEN" \
  -d '{"userId": "test_user_2", "userName": "Test User 2"}'
```

### 2. Test WebSocket Connection
```javascript
// Browser console
const socket = io('ws://localhost:3001', {
  auth: { token: 'YOUR_SPOTIFY_TOKEN' }
});

socket.on('connect', () => console.log('Connected!'));
socket.emit('join_session', { sessionId: 'ABC123', role: 'client' });
```

### 3. Monitor WebSocket Events
```bash
# Backend should log:
[WebSocket] Client connected: socket_id_123
[WebSocket] join_session: { sessionId: 'ABC123', role: 'client' }
[Sync] Broadcasting state to session ABC123
```

---

## Frontend-Backend Data Flow Example

### Scenario: Client joins and syncs

```
1. CLIENT: User enters session code "ABC123"
   └─> Frontend: sessionService.joinSession("ABC123")
       └─> POST /api/sessions/ABC123/join
           └─> Backend: Validates session, returns success

2. CLIENT: Establishes WebSocket connection
   └─> Frontend: wsService.connect("ws://localhost:3001")
       └─> WebSocket connection established
           └─> Frontend: Emits 'join_session' event
               └─> Backend: Registers client in session

3. HOST: Every 2 minutes, broadcasts state
   └─> Frontend (Host): syncService.broadcastState()
       └─> Emits 'playback_state' event
           └─> Backend: Receives host state
               └─> Backend: Calculates drift for client
                   └─> Backend: Emits 'sync_command' to client
                       └─> Frontend (Client): Receives sync command
                           └─> Frontend: spotifyService.seek(position)

4. CLIENT: User adjusts offset by +100ms
   └─> Frontend: sessionService.updateOffset(100)
       └─> PATCH /api/sessions/ABC123/offset
           └─> Backend: Stores new offset
               └─> Backend: Recalculates and sends new sync command
```

---

## Implementation Checklist

### Frontend Tasks
- [ ] Replace mock `SpotifyService` with actual Spotify SDK calls
- [ ] Implement real `WebSocketService` using socket.io-client
- [ ] Connect `SessionService` to backend REST API
- [ ] Update `SyncService` to use real Spotify playback state
- [ ] Add error handling for network failures
- [ ] Implement token refresh logic
- [ ] Add loading states in UI

### Backend Tasks
- [ ] Set up Express server with CORS
- [ ] Implement WebSocket server using socket.io
- [ ] Create session management endpoints (POST, GET, DELETE)
- [ ] Implement sync engine with drift calculation
- [ ] Add Redis for session state storage
- [ ] Implement Spotify OAuth token validation
- [ ] Add rate limiting and security measures
- [ ] Set up logging and monitoring

### Integration Tasks
- [ ] Test create session flow end-to-end
- [ ] Test join session flow end-to-end
- [ ] Verify WebSocket events work correctly
- [ ] Test sync accuracy with real devices
- [ ] Test edge cases (disconnection, reconnection)
- [ ] Load test with multiple sessions
- [ ] Document any API changes

---

## Common Issues & Solutions

### Issue: WebSocket connection fails
**Solution**: 
- Check CORS settings on backend
- Verify WebSocket URL is correct
- Ensure backend is running on expected port

### Issue: Sync drift is too high
**Solution**:
- Measure actual network latency
- Adjust sync threshold in SyncService
- Consider using more frequent sync checks

### Issue: Spotify SDK errors
**Solution**:
- Verify Spotify Premium account
- Check Spotify app is installed and logged in
- Ensure OAuth token has correct scopes

---

## Next Steps

1. **Backend Developer**: Start by implementing the REST API endpoints for session management
2. **Frontend Developer**: Implement real Spotify SDK integration in SpotifyService
3. **Together**: Set up WebSocket connection and test end-to-end flow
4. **Polish**: Add error handling, loading states, and edge case handling

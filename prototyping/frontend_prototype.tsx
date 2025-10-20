import React, { useState, useEffect } from 'react';
import { Play, Pause, Users, Plus, Radio, Settings, Wifi, WifiOff } from 'lucide-react';

// ============================================
// TYPES & INTERFACES
// ============================================

interface PlaybackState {
  trackName: string;
  artistName: string;
  albumArt: string;
  position: number;
  duration: number;
  isPlaying: boolean;
  trackUri: string;
}

interface SessionState {
  sessionId: string | null;
  role: 'host' | 'client' | null;
  isConnected: boolean;
  lastSyncTime: number | null;
  drift: number;
  userOffset: number;
}

// ============================================
// SERVICE LAYER (Logic - Backend devs work here)
// ============================================

class SpotifyService {
  // Mock implementation - Replace with actual Spotify SDK calls
  async authenticate(): Promise<boolean> {
    console.log('SpotifyService: Authenticating...');
    // TODO: Implement Spotify OAuth flow
    return true;
  }

  async getCurrentPlayback(): Promise<PlaybackState | null> {
    console.log('SpotifyService: Getting current playback');
    // TODO: Call Spotify SDK getCurrentState()
    return null;
  }

  async play(trackUri?: string): Promise<void> {
    console.log('SpotifyService: Playing', trackUri);
    // TODO: Call Spotify SDK play()
  }

  async pause(): Promise<void> {
    console.log('SpotifyService: Pausing');
    // TODO: Call Spotify SDK pause()
  }

  async seek(positionMs: number): Promise<void> {
    console.log('SpotifyService: Seeking to', positionMs);
    // TODO: Call Spotify SDK seek()
  }
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Function[]> = new Map();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('WebSocketService: Connecting to', url);
      // TODO: Implement actual WebSocket connection
      // this.ws = new WebSocket(url);
      // this.ws.onopen = () => resolve();
      // this.ws.onmessage = (e) => this.handleMessage(e);
      
      // Mock connection
      setTimeout(() => {
        console.log('WebSocketService: Connected (mock)');
        resolve();
      }, 500);
    });
  }

  emit(event: string, data: any): void {
    console.log('WebSocketService: Emitting', event, data);
    // TODO: Send via WebSocket
    // this.ws?.send(JSON.stringify({ event, data }));
  }

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  private handleMessage(message: any): void {
    // TODO: Parse message and call appropriate listeners
    const { event, data } = JSON.parse(message.data);
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  disconnect(): void {
    console.log('WebSocketService: Disconnecting');
    this.ws?.close();
  }
}

class SessionService {
  constructor(
    private wsService: WebSocketService,
    private spotifyService: SpotifyService
  ) {}

  async createSession(): Promise<string> {
    console.log('SessionService: Creating session');
    // TODO: POST /api/sessions
    // Return actual session ID from backend
    return 'ABC123';
  }

  async joinSession(sessionId: string): Promise<boolean> {
    console.log('SessionService: Joining session', sessionId);
    // TODO: POST /api/sessions/:id/join
    this.wsService.emit('join_session', { sessionId, role: 'client' });
    return true;
  }

  async updateOffset(offset: number): Promise<void> {
    console.log('SessionService: Updating offset', offset);
    // TODO: PATCH /api/sessions/:id/offset
  }
}

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(
    private spotifyService: SpotifyService,
    private wsService: WebSocketService
  ) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.wsService.on('sync_command', (data: any) => {
      console.log('SyncService: Received sync command', data);
      this.handleSyncCommand(data);
    });
  }

  startHostSync(): void {
    console.log('SyncService: Starting host sync');
    // Send state every 2 minutes
    this.syncInterval = setInterval(() => {
      this.broadcastState();
    }, 120000); // 2 minutes

    // Also broadcast on song changes
    this.watchForSongChanges();
  }

  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private async broadcastState(): Promise<void> {
    const state = await this.spotifyService.getCurrentPlayback();
    if (state) {
      this.wsService.emit('playback_state', {
        trackUri: state.trackUri,
        position: state.position,
        isPlaying: state.isPlaying,
        timestamp: Date.now()
      });
    }
  }

  private watchForSongChanges(): void {
    // TODO: Poll Spotify every 5 seconds to detect song changes
    // When detected, immediately broadcast new state
  }

  private async handleSyncCommand(command: any): Promise<void> {
    const { action, trackUri, position } = command;
    
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
    }
  }

  async requestSync(): Promise<void> {
    console.log('SyncService: Requesting immediate sync');
    this.wsService.emit('request_sync', {});
  }
}

// ============================================
// UI COMPONENTS (Frontend devs work here)
// ============================================

const App: React.FC = () => {
  const [screen, setScreen] = useState<'home' | 'create' | 'join' | 'playback'>('home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Session state
  const [session, setSession] = useState<SessionState>({
    sessionId: null,
    role: null,
    isConnected: false,
    lastSyncTime: null,
    drift: 0,
    userOffset: 0
  });

  // Playback state
  const [playback, setPlayback] = useState<PlaybackState>({
    trackName: 'No track playing',
    artistName: 'Unknown Artist',
    albumArt: 'https://via.placeholder.com/300',
    position: 0,
    duration: 180000,
    isPlaying: false,
    trackUri: ''
  });

  // Services (initialized once)
  const [services] = useState(() => {
    const spotify = new SpotifyService();
    const ws = new WebSocketService();
    const sessionService = new SessionService(ws, spotify);
    const sync = new SyncService(spotify, ws);
    return { spotify, ws, sessionService, sync };
  });

  useEffect(() => {
    // Auto-authenticate on mount (in real app, check if token exists)
    services.spotify.authenticate().then(() => {
      setIsAuthenticated(true);
    });

    return () => {
      services.sync.stopSync();
      services.ws.disconnect();
    };
  }, []);

  const handleCreateSession = async () => {
    const sessionId = await services.sessionService.createSession();
    await services.ws.connect('ws://localhost:3001'); // TODO: Use actual backend URL
    
    setSession({
      ...session,
      sessionId,
      role: 'host',
      isConnected: true
    });
    
    services.sync.startHostSync();
    setScreen('playback');
  };

  const handleJoinSession = async (sessionId: string) => {
    await services.ws.connect('ws://localhost:3001'); // TODO: Use actual backend URL
    await services.sessionService.joinSession(sessionId);
    
    setSession({
      ...session,
      sessionId,
      role: 'client',
      isConnected: true
    });
    
    setScreen('playback');
  };

  const handleOffsetChange = (delta: number) => {
    const newOffset = session.userOffset + delta;
    setSession({ ...session, userOffset: newOffset });
    services.sessionService.updateOffset(newOffset);
  };

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  switch (screen) {
    case 'home':
      return <HomeScreen onCreateSession={() => setScreen('create')} onJoinSession={() => setScreen('join')} />;
    case 'create':
      return <CreateSessionScreen onCreateSession={handleCreateSession} onBack={() => setScreen('home')} />;
    case 'join':
      return <JoinSessionScreen onJoinSession={handleJoinSession} onBack={() => setScreen('home')} />;
    case 'playback':
      return (
        <PlaybackScreen 
          session={session} 
          playback={playback}
          onOffsetChange={handleOffsetChange}
          onRequestSync={() => services.sync.requestSync()}
        />
      );
    default:
      return null;
  }
};

const AuthScreen: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
      <div className="w-16 h-16 bg-green-500 rounded-full mx-auto mb-4 flex items-center justify-center">
        <Radio className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-3xl font-bold mb-2">Spotify Sync</h1>
      <p className="text-gray-600 mb-6">Listen together, perfectly in sync</p>
      <button className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition">
        Connect with Spotify
      </button>
      <p className="text-xs text-gray-500 mt-4">Requires Spotify Premium</p>
    </div>
  </div>
);

const HomeScreen: React.FC<{ onCreateSession: () => void; onJoinSession: () => void }> = ({ onCreateSession, onJoinSession }) => (
  <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
      <h1 className="text-3xl font-bold mb-6 text-center">Spotify Sync</h1>
      
      <div className="space-y-4">
        <button 
          onClick={onCreateSession}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-4 px-6 rounded-lg transition flex items-center justify-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>Create Sync Session</span>
        </button>
        
        <button 
          onClick={onJoinSession}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-4 px-6 rounded-lg transition flex items-center justify-center space-x-2"
        >
          <Users className="w-5 h-5" />
          <span>Join Session</span>
        </button>
      </div>
      
      <p className="text-center text-gray-600 mt-6 text-sm">
        Create a session to be the host, or join an existing session to sync with a friend
      </p>
    </div>
  </div>
);

const CreateSessionScreen: React.FC<{ onCreateSession: () => void; onBack: () => void }> = ({ onCreateSession, onBack }) => (
  <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
      <button onClick={onBack} className="text-gray-600 hover:text-gray-800 mb-4">← Back</button>
      
      <h2 className="text-2xl font-bold mb-4">Create Session</h2>
      <p className="text-gray-600 mb-6">You'll be the host. Your friend will sync to your playback.</p>
      
      <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-700 mb-2">As the host:</p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4">
          <li>• Control playback normally on your device</li>
          <li>• Your friend's device will automatically sync</li>
          <li>• Sync happens every 2 minutes and at song changes</li>
        </ul>
      </div>
      
      <button 
        onClick={onCreateSession}
        className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 px-6 rounded-lg transition"
      >
        Create Session
      </button>
    </div>
  </div>
);

const JoinSessionScreen: React.FC<{ onJoinSession: (id: string) => void; onBack: () => void }> = ({ onJoinSession, onBack }) => {
  const [sessionId, setSessionId] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <button onClick={onBack} className="text-gray-600 hover:text-gray-800 mb-4">← Back</button>
        
        <h2 className="text-2xl font-bold mb-4">Join Session</h2>
        <p className="text-gray-600 mb-6">Enter the session code from your friend</p>
        
        <input 
          type="text"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value.toUpperCase())}
          placeholder="ABC123"
          className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 mb-4 text-center text-2xl font-mono tracking-wider focus:outline-none focus:border-pink-500"
          maxLength={6}
        />
        
        <button 
          onClick={() => onJoinSession(sessionId)}
          disabled={sessionId.length < 6}
          className="w-full bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition"
        >
          Join Session
        </button>
      </div>
    </div>
  );
};

const PlaybackScreen: React.FC<{
  session: SessionState;
  playback: PlaybackState;
  onOffsetChange: (delta: number) => void;
  onRequestSync: () => void;
}> = ({ session, playback, onOffsetChange, onRequestSync }) => {
  const [showSettings, setShowSettings] = useState(false);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatOffset = (ms: number) => {
    const sign = ms >= 0 ? '+' : '-';
    const abs = Math.abs(ms);
    if (abs < 1000) return `${sign}${abs}ms`;
    return `${sign}${(abs / 1000).toFixed(2)}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col">
      {/* Header */}
      <div className="p-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          {session.isConnected ? (
            <Wifi className="w-5 h-5 text-green-300" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-300" />
          )}
          <span className="text-white text-sm">
            {session.role === 'host' ? 'Host' : 'Client'} • {session.sessionId}
          </span>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="text-white hover:text-gray-200"
        >
          <Settings className="w-6 h-6" />
        </button>
      </div>

      {/* Album Art & Track Info */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <img 
          src={playback.albumArt}
          alt="Album art"
          className="w-64 h-64 rounded-lg shadow-2xl mb-6"
        />
        
        <h2 className="text-white text-2xl font-bold mb-2 text-center">{playback.trackName}</h2>
        <p className="text-gray-200 text-lg mb-6">{playback.artistName}</p>

        {/* Progress Bar */}
        <div className="w-full max-w-md mb-2">
          <div className="bg-gray-700 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-white h-full transition-all duration-1000"
              style={{ width: `${(playback.position / playback.duration) * 100}%` }}
            />
          </div>
        </div>
        
        <div className="flex justify-between w-full max-w-md text-white text-sm mb-8">
          <span>{formatTime(playback.position)}</span>
          <span>{formatTime(playback.duration)}</span>
        </div>

        {/* Playback Controls (disabled for client) */}
        <div className="flex items-center space-x-6">
          <button 
            disabled={session.role === 'client'}
            className={`${
              session.role === 'client' ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'
            } transition-transform`}
          >
            {playback.isPlaying ? (
              <Pause className="w-12 h-12 text-white" />
            ) : (
              <Play className="w-12 h-12 text-white" />
            )}
          </button>
        </div>

        {session.role === 'client' && (
          <p className="text-gray-300 text-sm mt-4">
            Synced to host's playback
          </p>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-t-3xl p-6 shadow-2xl">
          <h3 className="text-xl font-bold mb-4">Sync Settings</h3>
          
          {session.role === 'client' && (
            <>
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-gray-700 font-semibold">Micro-adjustment</label>
                  <span className="text-indigo-600 font-mono">{formatOffset(session.userOffset)}</span>
                </div>
                
                <div className="flex space-x-2 mb-3">
                  <button 
                    onClick={() => onOffsetChange(-1000)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded-lg text-sm font-semibold"
                  >
                    -1s
                  </button>
                  <button 
                    onClick={() => onOffsetChange(-100)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded-lg text-sm font-semibold"
                  >
                    -100ms
                  </button>
                  <button 
                    onClick={() => onOffsetChange(-10)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded-lg text-sm font-semibold"
                  >
                    -10ms
                  </button>
                </div>
                
                <div className="flex space-x-2 mb-4">
                  <button 
                    onClick={() => onOffsetChange(10)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded-lg text-sm font-semibold"
                  >
                    +10ms
                  </button>
                  <button 
                    onClick={() => onOffsetChange(100)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded-lg text-sm font-semibold"
                  >
                    +100ms
                  </button>
                  <button 
                    onClick={() => onOffsetChange(1000)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded-lg text-sm font-semibold"
                  >
                    +1s
                  </button>
                </div>

                <button 
                  onClick={() => onOffsetChange(-session.userOffset)}
                  className="w-full bg-gray-100 hover:bg-gray-200 py-2 px-4 rounded-lg text-sm font-semibold mb-4"
                >
                  Reset to 0ms
                </button>

                <p className="text-xs text-gray-500 mb-4">
                  Adjust if you hear your playback slightly before or after your friend's
                </p>
              </div>

              <button 
                onClick={onRequestSync}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 px-6 rounded-lg"
              >
                Force Sync Now
              </button>
            </>
          )}

          {session.role === 'host' && (
            <div className="text-center py-4">
              <p className="text-gray-600 mb-4">
                Your friend is syncing to your playback. Control Spotify normally on your device.
              </p>
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
                <p className="text-sm text-gray-700 font-semibold mb-2">Share this code:</p>
                <p className="text-3xl font-mono font-bold text-indigo-600 tracking-wider">
                  {session.sessionId}
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Last sync:</span>
              <span className="font-semibold">
                {session.lastSyncTime 
                  ? `${Math.floor((Date.now() - session.lastSyncTime) / 1000)}s ago`
                  : 'Never'
                }
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Connection:</span>
              <span className={`font-semibold ${session.isConnected ? 'text-green-600' : 'text-red-600'}`}>
                {session.isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

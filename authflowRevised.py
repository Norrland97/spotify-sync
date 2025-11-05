import asyncio
import requests
import base64
import json
from urllib.parse import urlencode
import webbrowser
import os
import logging
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

SECRETS_FILE = ".secrets/.secrets"

# TODO:
#   - Kolla imports och ta bort onödigt skit
#   - kolla på alla try catch ifall det finns onödiga saker som kan lömnas till spotify
#     eller om det finns saker som man vill ska krascha
#     Error hanteringen är nog lite over the top... kan finnas massa extra logik med detta som är bös.
#   - Kolla funtionsstruktur ifall det makear sense att ha alla funktioner, och ifall de kan optimeras'
#   - Kolla läsbarhet på koden. kan det förbättras?


class SpotifyClient:
    """Spotify API client with OAuth2 authentication and token management"""

    # Spotify API endpoints
    AUTH_URL = "https://accounts.spotify.com/authorize"
    TOKEN_URL = "https://accounts.spotify.com/api/token"
    API_BASE_URL = "https://api.spotify.com/v1"

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str = "http://127.0.0.1:8888/callback",
        scopes: str = "user-read-private user-read-email user-modify-playback-state user-read-playback-state",
        token_file: str = ".spotify_tokens.json",
    ):
        """
        Initialize Spotify client

        Args:
            client_id: Spotify application client ID
            client_secret: Spotify application client secret
            redirect_uri: OAuth redirect URI (must match app settings)
            scopes: Space-separated list of permission scopes
            token_file: Path to file for storing tokens
        """
        self.logger = logging.getLogger(self.__class__.__name__)
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.scopes = scopes
        self.token_file = token_file

        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None

        self.logger.info("SpotifyClient initialized")

    def _get_auth_header(self) -> str:
        """Generate base64 encoded authorization header"""
        auth_string = f"{self.client_id}:{self.client_secret}"
        auth_base64 = base64.b64encode(auth_string.encode("utf-8")).decode("utf-8")
        return f"Basic {auth_base64}"

    def _save_tokens_to_file(self):
        """Save tokens and expiration time to file"""

        token_data = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_at": self.token_expires_at.isoformat(),
        }

        try:
            with open(self.token_file, "w") as f:
                json.dump(token_data, f, indent=2)
            self.logger.info("Tokens saved successfully")
        except Exception as e:
            self.logger.error(f"Failed to save tokens: {e}")

    def _load_tokens(self) -> bool:
        """Load tokens from file if they exist and are valid"""
        if not os.path.exists(self.token_file):
            self.logger.info("No saved tokens found")
            return False

        try:
            with open(self.token_file, "r") as f:
                token_data = json.load(f)

            self.access_token = token_data.get("access_token")
            self.refresh_token = token_data.get("refresh_token")
            expires_at_str = token_data.get("expires_at")
            if expires_at_str:
                self.token_expires_at = datetime.fromisoformat(expires_at_str)

            if not self.refresh_token:
                self.logger.warning("No refresh token found in saved data")
                return False

            self.logger.info("Tokens loaded from file")
            return True

        except Exception as e:
            self.logger.error(f"Failed to load tokens: {e}")
            return False

    def _is_token_expired(self) -> bool:
        """Check if access token is expired or will expire soon"""
        if not self.token_expires_at:
            return True

        # Add 5 minute buffer to refresh before actual expiration
        buffer = timedelta(minutes=5)
        return datetime.now() >= (self.token_expires_at - buffer)

    def _get_authorization_url(self) -> str:
        """Generate the authorization URL for OAuth flow"""
        auth_params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "scope": self.scopes,
        }
        return f"{self.AUTH_URL}?{urlencode(auth_params)}"

    def _get_access_token(self, auth_code: str) -> bool:
        """Request and store access and refresh tokens"""
        headers = {
            "Authorization": self._get_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": self.redirect_uri,
        }

        try:
            response = requests.post(
                self.TOKEN_URL, headers=headers, data=data, timeout=10
            )
        except requests.RequestException as e:
            self.logger.error(f"Network error during token exchange: {e}")
            return False

        if response.status_code != 200:
            self.logger.error(
                f"Token exchange failed: {response.status_code} - {response.text}"
            )
            return False

        response_data = response.json()

        self.access_token = response_data["access_token"]
        self.refresh_token = response_data["refresh_token"]
        expires_in = response_data.get("expires_in", 3600)
        self.token_expires_at = datetime.now() + timedelta(seconds=expires_in)

        self.logger.info("Successfully exchanged code for tokens")
        self._save_tokens_to_file()
        return True

    def _refresh_access_token(self) -> bool:
        """Refresh the access token using refresh token"""
        if not self.refresh_token:
            self.logger.warning("No refresh token available")
            return False
        headers = {
            "Authorization": self._get_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {"grant_type": "refresh_token", "refresh_token": self.refresh_token}

        try:
            response = requests.post(
                self.TOKEN_URL, headers=headers, data=data, timeout=10
            )
            if response.status_code != 200:
                self.logger.error(
                    f"Token refresh failed: {response.status_code} - {response.text}"
                )
                return False
        except requests.RequestException as e:
            self.logger.error(f"Network error during token refresh: {e}")
            return False

        token_data = response.json()
        self.access_token = token_data["access_token"]
        # Refresh token might not be returned, keep existing one
        if "refresh_token" in token_data:
            self.refresh_token = token_data["refresh_token"]
        expires_in = token_data.get("expires_in", 3600)
        self.token_expires_at = datetime.now() + timedelta(seconds=expires_in)

        self.logger.info("Access token refreshed successfully")
        self._save_tokens_to_file()
        return True

    def authorize(self, force_reauth: bool = False) -> bool:
        """
        Authorize the client with Spotify

        Args:
            force_reauth: Force full re-authorization even if tokens exist

        Returns:
            True if authorization successful, False otherwise
        """
        # Try to load existing tokens unless forced to re-auth
        if not force_reauth and self._load_tokens():
            # Check if token is expired and try to refresh
            if self._is_token_expired():
                self.logger.info("Token expired, attempting refresh...")
                if self._refresh_access_token():
                    return True
                else:
                    self.logger.warning(
                        "Token refresh failed, need full re-authorization"
                    )
            else:
                self.logger.info("Using valid cached tokens")
                return True

        # Perform full authorization flow
        self.logger.info("Starting OAuth authorization flow...")
        auth_url = self._get_authorization_url()

        print("\n" + "=" * 60)
        print("SPOTIFY AUTHORIZATION REQUIRED")
        print("=" * 60)
        print("\nOpening browser for authorization...")
        print(f"\nIf browser doesn't open, visit this URL manually:")
        print(auth_url)
        print("\n" + "=" * 60)

        webbrowser.open(auth_url)

        print("\nAfter authorizing, you'll be redirected to a URL.")
        print("Copy the ENTIRE redirect URL and paste it below:")
        redirect_response = input("\nPaste redirect URL: ").strip()

        try:
            # Extract authorization code from URL
            auth_code = redirect_response.split("code=")[1].split("&")[0]
            self.logger.info("Authorization code extracted from redirect URL")
        except (IndexError, AttributeError) as e:
            self.logger.error(f"Failed to extract authorization code: {e}")
            print("Error: Could not extract authorization code from URL")
            return False

        return self._get_access_token(auth_code)

    def _ensure_valid_token(self) -> bool:
        """Ensure we have a valid access token, refreshing if necessary"""
        if not self.access_token:
            self.logger.error("No access token available")
            return False

        if self._is_token_expired():
            self.logger.info("Token expired, refreshing...")
            return self._refresh_access_token()

        return True

    def _api_request(
        self, method: str, endpoint: str, **kwargs
    ) -> Optional[Dict[Any, Any]]:
        """
        Make an authenticated API request

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON or None if request failed
        """
        if not self._ensure_valid_token():
            self.logger.error("Cannot make API request: no valid token")
            return None

        url = f"{self.API_BASE_URL}/{endpoint.lstrip('/')}"
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.access_token}"

        try:
            response = requests.request(
                method, url, headers=headers, timeout=10, **kwargs
            )

            # 204 No Content is success for some endpoints
            if response.status_code == 204:
                return {"status": "success"}
            response.raise_for_status()

            if response.content:
                return response.json()
            return {"status": "success"}

        except requests.RequestException as e:
            self.logger.error(f"API request failed: {e}")
            if hasattr(e, "response") and e.response is not None:
                try:
                    error_data = e.response.json()
                    self.logger.error(f"Error response: {error_data}")
                    return error_data
                except:
                    pass
            return None

    # API Methods

    def get_user_profile(self) -> Optional[Dict[Any, Any]]:
        """Get current user's profile"""
        self.logger.info("Fetching user profile")
        return self._api_request("GET", "/me")

    def start_playback(
        self,
        context_uri: str,
        position_ms: int = 0,
        offset_position: int = 0,
        device_id: Optional[str] = None,
    ) -> Optional[Dict[Any, Any]]:
        """
        Start playback on user's active device

        Args:
            context_uri: Spotify URI of context (album, artist, playlist)
            position_ms: Position in milliseconds to start playback
            offset_position: Track offset in context
            device_id: Optional device ID to target specific device

        Returns:
            Response dict or None if failed
        """
        endpoint = "/me/player/play"
        if device_id:
            endpoint += f"?device_id={device_id}"

        data = {
            "context_uri": context_uri,
            "offset": {"position": offset_position},
            "position_ms": position_ms,
        }

        self.logger.info(f"Starting playback: {context_uri}")
        return self._api_request("PUT", endpoint, json=data)

    async def skip_playback(self) -> str:
        """Skip song.
        This function does not use _api_request().
        The request should rerurn 204 (empty response) when successfull, but we get 200 with a body
        """
        headers = {"Authorization": f"Bearer {self.access_token}"}
        url = f"{self.API_BASE_URL}/me/player/next"
        requests.request(
            "POST", url, headers=headers, timeout=10, allow_redirects=False
        )
        return "success"

    def get_playback_state(self) -> Optional[Dict[Any, Any]]:
        """Get information about user's current playback"""
        self.logger.info("Fetching playback state")
        return self._api_request("GET", "/me/player")

    def get_devices(self) -> Optional[Dict[Any, Any]]:
        """Get user's available devices"""
        self.logger.info("Fetching available devices")
        return self._api_request("GET", "/me/player/devices")


def load_credentials(secrets_file: str = SECRETS_FILE) -> tuple[str, str]:
    """Load Spotify credentials from secrets file"""
    try:
        with open(secrets_file) as f:
            data = json.load(f)

        client_id = data.get("ClientId")
        client_secret = data.get("ClientSecret")

        if not client_id or not client_secret:
            raise ValueError("ClientId or ClientSecret missing from secrets file")

        return client_id, client_secret

    except FileNotFoundError:
        raise FileNotFoundError(f"Secrets file '{secrets_file}' not found")
    except json.JSONDecodeError:
        raise ValueError(f"Invalid JSON in secrets file '{secrets_file}'")


def show_playback_state(client):
    # Get current playback state
    playback = client.get_playback_state()
    if playback and playback.get("item"):
        track = playback["item"]
        print(
            f"\nCurrently playing: {track.get('name')} by {track.get('artists', [{}])[0].get('name')}"
        )
        print(f"Current timestamp: {playback.get('progress_ms')} ms")
        print(
            f"Album uri and song nr: {track.get('uri')} nr:{track.get('track_number')}"
        )
        print(f"Playing on: {playback.get('device').get('name')}")


async def main():
    """Example usage of SpotifyClient"""
    try:
        # Load credentials
        client_id, client_secret = load_credentials()

        # Initialize client
        client = SpotifyClient(client_id, client_secret)

        # Authorize (will use cached tokens if valid)
        if not client.authorize():
            print("Authorization failed!")
            return

        print("\n" + "=" * 60)
        print("AUTHORIZATION SUCCESSFUL")
        print("=" * 60)

        # Get user profile
        profile = client.get_user_profile()
        if profile:
            print(f"\nWelcome, {profile.get('display_name', 'User')}!")
            print(f"Email: {profile.get('email', 'N/A')}")

        # Get available devices
        devices = client.get_devices()
        if devices and devices.get("devices"):
            print("\nAvailable devices:")
            for device in devices["devices"]:
                active = " (ACTIVE)" if device.get("is_active") else ""
                print(f"  - {device.get('name')}{active}")
        else:
            print("\nNo active Spotify devices found. Please open Spotify on a device.")
            return

        show_playback_state(client=client)

        # Example: Start playback (uncomment to use)
        # playlist_uri = "spotify:playlist:68RKIEnAb5sPJv5645Uqjj"
        # result = client.start_playback(playlist_uri)
        # print(f"\nPlayback result: {result}")
        selection = ""
        while selection not in ["exit", "e"]:
            selection = input("k = pause, j = previous, l = next \nSelect: ")
            match selection:
                case "j":
                    print("\nPrevious song selected, not implemented yet!\n")
                case "k":
                    print("\nPausing... (not implemented)\n")
                case "l":
                    print("\nSkipping song...")
                    await client.skip_playback()
                    time.sleep(0.2)
                    print("Song skipped\n")

            show_playback_state(client=client)

        # client.skip_playback()
        # print(f"Playback skipped")

    except Exception as e:
        logging.error(f"Application error: {e}")
        print(f"\nError: {e}")


if __name__ == "__main__":
    asyncio.run(main())

import asyncio
import logging
from homeassistant.components.camera import Camera
from homeassistant.helpers.aiohttp_client import async_get_clientsession, async_aiohttp_proxy_web
from homeassistant.helpers.device_registry import DeviceInfo
from .const import DOMAIN, CONF_IP_ADDRESS

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass, entry, async_add_entities):
    ip = entry.data[CONF_IP_ADDRESS]
    async_add_entities([SnapmakerCamera(hass, ip)])

class SnapmakerCamera(Camera):
    _attr_has_entity_name = True

    def __init__(self, hass, ip):
        super().__init__()
        self.hass = hass
        self.ip = ip
        ip_safe = ip.replace(".", "_")
        self._attr_name = "Webcam"
        self._attr_unique_id = f"snapmaker_{ip_safe}_webcam"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(identifiers={(DOMAIN, self.ip)})

    async def async_camera_image(self, width: int | None = None, height: int | None = None) -> bytes | None:
        """Extract a single pristine JPEG frame from the continuous stream for dashboard previews."""
        session = async_get_clientsession(self.hass)
        url = f"http://{self.ip}/webcam/stream.mjpg"
        try:
            # Open the stream connection
            async with session.get(url, timeout=3) as response:
                if response.status != 200:
                    return None
                
                buffer = b""
                # Read chunks sequentially until a full frame boundary is isolated
                async for chunk in response.content.iter_chunked(4096):
                    buffer += chunk
                    start = buffer.find(b"\xff\xd8")  # JPEG Start of Image magic bytes
                    if start != -1:
                        end = buffer.find(b"\xff\xd9", start)  # JPEG End of Image magic bytes
                        if end != -1:
                            # Return the isolated complete standalone frame
                            return buffer[start:end + 2]
                    
                    # Prevent memory bloating if stream is garbled
                    if len(buffer) > 512000:
                        break
        except Exception as err:
            _LOGGER.debug("Failed parsing snapshot frame: %s", err)
        return None

    async def handle_async_mjpeg_stream(self, request):
        """Proxy the live MJPEG video stream securely through Home Assistant."""
        session = async_get_clientsession(self.hass)
        url = f"http://{self.ip}/webcam/stream.mjpg"
        try:
            return await async_aiohttp_proxy_web(self.hass, request, session.get(url))
        except Exception as err:
            _LOGGER.error("Error proxying camera stream: %s", err)
            return None

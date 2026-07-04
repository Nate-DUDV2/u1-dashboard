import json
import logging
from homeassistant.components.text import TextEntity
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.device_registry import DeviceInfo
from .const import DOMAIN, CONF_IP_ADDRESS

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass, entry, async_add_entities):
    ip = entry.data[CONF_IP_ADDRESS]
    async_add_entities([SnapmakerTerminal(hass, ip)])

class SnapmakerTerminal(TextEntity):
    """A smart virtual terminal that bypasses string length limits."""
    _attr_has_entity_name = True

    def __init__(self, hass, ip):
        self.hass = hass
        self.ip = ip
        self.ip_safe = ip.replace(".", "_")
        self._attr_name = "Terminal"
        self._attr_unique_id = f"snapmaker_{self.ip_safe}_terminal"
        self._attr_icon = "mdi:shadow-box"
        self._attr_native_value = ""

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(identifiers={(DOMAIN, self.ip)})

    async def async_set_value(self, value: str) -> None:
        """Intercepts long strings and safely processes them as sequential requests."""
        self._attr_native_value = value[:30] + "..." if len(value) > 30 else value
        self.async_write_ha_state()
        
        session = async_get_clientsession(self.hass)
        
        # If the incoming payload is compressed JSON options
        if value.startswith("{"):
            try:
                payload = json.loads(value)
                for cmd in payload.get("commands", []):
                    url = f"http://{self.ip}:7125/printer/gcode/script?script={cmd}"
                    async with session.post(url, timeout=5) as resp:
                        await resp.read()
                return
            except Exception as json_err:
                _LOGGER.error("JSON split macro transmission failed: %s", json_err)
                return

        # Fallback for standard basic commands
        try:
            url = f"http://{self.ip}:7125/printer/gcode/script?script={value}"
            async with session.post(url, timeout=5) as response:
                await response.read()
        except Exception as fallback_err:
            _LOGGER.error("Fallback raw terminal command failed: %s", fallback_err)

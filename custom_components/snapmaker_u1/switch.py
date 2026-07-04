import aiohttp
from homeassistant.components.switch import SwitchEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .const import DOMAIN, CONF_IP_ADDRESS

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    ip = entry.data[CONF_IP_ADDRESS]
    
    switches = [
        SnapmakerFanSwitch(coordinator, hass, ip, "Cooling Fan", "fan")
    ]
    
    async_add_entities(switches)

class SnapmakerFanSwitch(CoordinatorEntity, SwitchEntity):
    _attr_has_entity_name = True
    _attr_icon = "mdi:fan"

    def __init__(self, coordinator, hass, ip, name, obj_key):
        super().__init__(coordinator)
        self.hass = hass
        self.ip = ip
        self.obj_key = obj_key
        
        ip_safe = ip.replace(".", "_")
        self._attr_name = name
        self._attr_unique_id = f"snapmaker_{ip_safe}_switch_{obj_key}"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(identifiers={(DOMAIN, self.ip)})

    @property
    def is_on(self) -> bool:
        data = self.coordinator.data or {}
        speed = data.get(self.obj_key, {}).get("speed", 0.0)
        return speed > 0

    async def async_turn_on(self, **kwargs) -> None:
        await self._send_gcode("M106 S255")

    async def async_turn_off(self, **kwargs) -> None:
        await self._send_gcode("M107")

    async def _send_gcode(self, gcode: str) -> None:
        session = async_get_clientsession(self.hass)
        url = f"http://{self.ip}:7125/printer/gcode/script?script={gcode.replace(' ', '%20')}"
        try:
            await session.post(url)
            await self.coordinator.async_request_refresh()
        except Exception:
            pass

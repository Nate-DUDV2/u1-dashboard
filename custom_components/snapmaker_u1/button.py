from homeassistant.components.button import ButtonEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .const import DOMAIN, CONF_IP_ADDRESS

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    ip = entry.data[CONF_IP_ADDRESS]
    
    buttons = [
        # Main Printing Controls
        SnapmakerButton(coordinator, hass, ip, "Pause Print", "pause", "PAUSE", "mdi:pause"),
        SnapmakerButton(coordinator, hass, ip, "Resume Print", "resume", "RESUME", "mdi:play"),
        SnapmakerButton(coordinator, hass, ip, "Stop Print", "stop", "CANCEL_PRINT", "mdi:stop"),
        
        # Axis Homing Controls
        SnapmakerButton(coordinator, hass, ip, "Home All Axes", "home_all", "G28", "mdi:home-assistant"),
        SnapmakerButton(coordinator, hass, ip, "Home Z Axis", "home_z", "G28 Z", "mdi:arrow-up-down"),
        
        # Multi-Toolhead Selection
        SnapmakerButton(coordinator, hass, ip, "Select Tool 1", "select_t0", "T0", "mdi:numeric-1-box"),
        SnapmakerButton(coordinator, hass, ip, "Select Tool 2", "select_t1", "T1", "mdi:numeric-2-box"),
        SnapmakerButton(coordinator, hass, ip, "Select Tool 3", "select_t2", "T2", "mdi:numeric-3-box"),
        SnapmakerButton(coordinator, hass, ip, "Select Tool 4", "select_t3", "T3", "mdi:numeric-4-box"),
        
        # Filament Management
        SnapmakerButton(coordinator, hass, ip, "Load Filament", "load_filament", "LOAD_FILAMENT", "mdi:printer-3d-nozzle-heat"),
        SnapmakerButton(coordinator, hass, ip, "Unload Filament", "unload_filament", "UNLOAD_FILAMENT", "mdi:printer-3d-nozzle-alert"),
    ]
    
    async_add_entities(buttons)

class SnapmakerButton(CoordinatorEntity, ButtonEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, hass, ip, name, obj_key, gcode, icon):
        super().__init__(coordinator)
        self.hass = hass
        self.ip = ip
        self.gcode = gcode
        self._attr_icon = icon
        
        ip_safe = ip.replace(".", "_")
        self._attr_name = name
        self._attr_unique_id = f"snapmaker_{ip_safe}_btn_{obj_key}"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(identifiers={(DOMAIN, self.ip)})

    async def async_press(self) -> None:
        """Execute the targeted macro command over the local API."""
        session = async_get_clientsession(self.hass)
        safe_gcode = self.gcode.replace(" ", "%20")
        url = f"http://{self.ip}:7125/printer/gcode/script?script={safe_gcode}"
        try:
            await session.post(url)
            await self.coordinator.async_request_refresh()
        except Exception:
            pass

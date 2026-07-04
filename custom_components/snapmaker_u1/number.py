import aiohttp
from homeassistant.components.number import NumberEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from .const import DOMAIN, CONF_IP_ADDRESS

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    ip = entry.data[CONF_IP_ADDRESS]
    
    numbers = [
        SnapmakerTempControl(coordinator, hass, ip, "Bed Target Temp", "heater_bed", "M140 S", 110),
        SnapmakerTempControl(coordinator, hass, ip, "Tool 1 Target Temp", "extruder", "M104 T0 S", 300),
        SnapmakerTempControl(coordinator, hass, ip, "Tool 2 Target Temp", "extruder1", "M104 T1 S", 300),
        SnapmakerTempControl(coordinator, hass, ip, "Tool 3 Target Temp", "extruder2", "M104 T2 S", 300),
        SnapmakerTempControl(coordinator, hass, ip, "Tool 4 Target Temp", "extruder3", "M104 T3 S", 300),
    ]
    
    async_add_entities(numbers)

class SnapmakerTempControl(CoordinatorEntity, NumberEntity):
    _attr_has_entity_name = True
    _attr_native_unit_of_measurement = "°C"
    _attr_native_step = 1.0
    _attr_native_min_value = 0.0
    # This turns the slider into a typeable input box!
    _attr_mode = "box"

    def __init__(self, coordinator, hass, ip, name, obj_key, gcode_prefix, max_temp):
        super().__init__(coordinator)
        self.hass = hass
        self.ip = ip
        self.obj_key = obj_key
        self.gcode_prefix = gcode_prefix
        
        ip_safe = ip.replace(".", "_")
        self._attr_name = name
        self._attr_unique_id = f"snapmaker_{ip_safe}_control_{obj_key}"
        self._attr_native_max_value = max_temp

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(identifiers={(DOMAIN, self.ip)})

    @property
    def native_value(self):
        data = self.coordinator.data or {}
        return data.get(self.obj_key, {}).get("target", 0.0)

    async def async_set_native_value(self, value: float) -> None:
        """Send the G-Code to change the temperature."""
        session = async_get_clientsession(self.hass)
        gcode = f"{self.gcode_prefix}{int(value)}"
        url = f"http://{self.ip}:7125/printer/gcode/script?script={gcode}"
        
        try:
            await session.post(url)
            await self.coordinator.async_request_refresh()
        except Exception:
            pass

from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.const import EntityCategory
from .const import DOMAIN, CONF_IP_ADDRESS

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    ip = entry.data[CONF_IP_ADDRESS]

    sensors = [
        # Main Sensors
        SnapmakerSensor(coordinator, ip, "Printer State", "print_stats", "state", None),
        SnapmakerSensor(coordinator, ip, "Print Progress", "display_status", "progress", "%", is_progress=True),
        SnapmakerSensor(coordinator, ip, "Current File", "print_stats", "filename", None),

        # Temps
        SnapmakerSensor(coordinator, ip, "Tool 1 Temp", "extruder", "temperature", "°C"),
        SnapmakerSensor(coordinator, ip, "Tool 2 Temp", "extruder1", "temperature", "°C"),
        SnapmakerSensor(coordinator, ip, "Tool 3 Temp", "extruder2", "temperature", "°C"),
        SnapmakerSensor(coordinator, ip, "Tool 4 Temp", "extruder3", "temperature", "°C"),
        SnapmakerSensor(coordinator, ip, "Bed Temp", "heater_bed", "temperature", "°C"),

        # Diagnostics
        SnapmakerSensor(coordinator, ip, "Current Layer", "print_stats", "current_layer", None, sub_key="info", category=EntityCategory.DIAGNOSTIC),
        SnapmakerSensor(coordinator, ip, "Total Layers", "print_stats", "total_layer", None, sub_key="info", category=EntityCategory.DIAGNOSTIC),
        SnapmakerSensor(coordinator, ip, "Print Message", "print_stats", "message", None, category=EntityCategory.DIAGNOSTIC),
        SnapmakerSensor(coordinator, ip, "Print Speed", "gcode_move", "speed_factor", "%", is_progress=True, category=EntityCategory.DIAGNOSTIC),
        SnapmakerSensor(coordinator, ip, "Fan Speed", "fan", "speed", "%", is_progress=True, category=EntityCategory.DIAGNOSTIC),
    ]

    # Spool Sensors
    for i in range(4):
        sensors.append(SnapmakerSpoolSensor(coordinator, ip, i))

    # 🌟 THE NEW GCODE FILE LIST SENSOR
    sensors.append(SnapmakerFileListSensor(coordinator, ip))

    async_add_entities(sensors)


class SnapmakerSensor(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, ip, name, obj_key, val_key, unit, is_progress=False, sub_key=None, category=None):
        super().__init__(coordinator)
        self.ip = ip
        self.ip_safe = ip.replace(".", "_")
        self.obj_key = obj_key
        self.val_key = val_key
        self.is_progress = is_progress
        self.sub_key = sub_key

        self._attr_name = name
        self._attr_unique_id = f"snapmaker_{self.ip_safe}_{name.lower().replace(' ', '_')}"
        
        if unit:
            self._attr_native_unit_of_measurement = unit
        if category:
            self._attr_entity_category = category

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self.ip)},
            name=f"Snapmaker U1 ({self.ip})",
            manufacturer="Nate's Print Shop",
            model="U1 Multi-Tool",
            sw_version=getattr(self.coordinator, "snapmaker_sw_version", "Moonraker API"),
            serial_number=getattr(self.coordinator, "snapmaker_serial", "Unknown")
        )

    @property
    def native_value(self):
        data = self.coordinator.data or {}
        obj_data = data.get(self.obj_key) or {}

        if self.sub_key:
            sub_data = obj_data.get(self.sub_key) or {}
            val = sub_data.get(self.val_key)
        else:
            val = obj_data.get(self.val_key)

        if val is None:
            return None

        if self.is_progress:
            try:
                return round(float(val) * 100, 1)
            except (ValueError, TypeError):
                return 0.0

        return val

class SnapmakerSpoolSensor(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, ip, tool_index):
        super().__init__(coordinator)
        self.ip = ip
        self.ip_safe = ip.replace(".", "_")
        self.tool_index = tool_index
        self._attr_name = f"Tool {tool_index + 1} Spool"
        self._attr_unique_id = f"snapmaker_{self.ip_safe}_spool_{tool_index}"
        self._attr_icon = "mdi:printer-3d-nozzle-outline"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self.ip)},
            name=f"Snapmaker U1 ({self.ip})",
            manufacturer="Nate's Print Shop"
        )

    @property
    def native_value(self):
        data = self.coordinator.data.get("print_task_config", {})
        types = data.get("filament_type", [])
        if types and len(types) > self.tool_index and types[self.tool_index]:
            return types[self.tool_index]
        return "NONE"

    @property
    def extra_state_attributes(self):
        data = self.coordinator.data.get("print_task_config", {})
        colors = data.get("filament_color_rgba", [])
        color_hex = "333333"
        
        if colors and len(colors) > self.tool_index and colors[self.tool_index]:
            raw_color = str(colors[self.tool_index])
            if len(raw_color) >= 6:
                color_hex = raw_color[:6]
                
        return {"hex_color": f"#{color_hex}"}

class SnapmakerFileListSensor(CoordinatorEntity, SensorEntity):
    """Fetches the G-Code file list from the printer."""
    _attr_has_entity_name = True

    def __init__(self, coordinator, ip):
        super().__init__(coordinator)
        self.ip = ip
        self.ip_safe = ip.replace(".", "_")
        self._attr_name = "GCode File List"
        self._attr_unique_id = f"snapmaker_{self.ip_safe}_gcode_files"
        self._attr_icon = "mdi:folder-open"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self.ip)},
            name=f"Snapmaker U1 ({self.ip})"
        )

    @property
    def native_value(self):
        # Shows the total count of files
        files = self.coordinator.data.get("gcode_files", [])
        return len(files) if isinstance(files, list) else 0

    @property
    def extra_state_attributes(self):
        # Hides the massive array of files here so the JS card can read it!
        return {"file_list": self.coordinator.data.get("gcode_files", [])}

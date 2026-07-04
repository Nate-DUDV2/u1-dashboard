import os
import asyncio
import logging
import re
import json
import urllib.parse
import aiohttp
from datetime import timedelta
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.components.http import StaticPathConfig, HomeAssistantView
from .const import DOMAIN, CONF_IP_ADDRESS, POLL_INTERVAL

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "number", "switch", "button", "camera", "text"]

class SnapmakerQueryView(HomeAssistantView):
    """Secure Proxy for fetching real-time temps and progress."""
    url = "/api/snapmaker_u1/query"
    name = "api:snapmaker_u1:query"
    requires_auth = True

    async def get(self, request):
        ip = request.query.get("ip")
        if not ip: return self.json({"error": "Missing IP"}, status_code=400)
        session = async_get_clientsession(request.app["hass"])
        try:
            url = f"http://{ip}:7125/printer/objects/query?heater_bed&extruder&extruder1&extruder2&extruder3&display_status&gcode_move&print_stats&fan"
            async with session.get(url, timeout=5) as resp:
                return self.json(await resp.json())
        except Exception as e:
            return self.json({"error": str(e)}, status_code=500)

class SnapmakerTerminalView(HomeAssistantView):
    url = "/api/snapmaker_u1/terminal"
    name = "api:snapmaker_u1:terminal"
    requires_auth = True

    async def get(self, request):
        ip = request.query.get("ip")
        if not ip: return self.json({"error": "Missing IP"}, status_code=400)
        session = async_get_clientsession(request.app["hass"])
        try:
            async with session.get(f"http://{ip}:7125/server/gcode_store", timeout=5) as resp:
                return self.json(await resp.json())
        except Exception as e:
            return self.json({"error": str(e)}, status_code=500)

class SnapmakerUploadView(HomeAssistantView):
    url = "/api/snapmaker_u1/upload"
    name = "api:snapmaker_u1:upload"
    requires_auth = True

    async def post(self, request):
        session = async_get_clientsession(request.app["hass"])
        try:
            reader = await request.multipart()
            ip_address, file_content, filename, t0_map = None, None, "upload.gcode", 0

            while True:
                part = await reader.next()
                if part is None: break
                if part.name == "ip": ip_address = await part.text()
                elif part.name == "t0_map": t0_map = int(await part.text())
                elif part.name == "file": filename = part.filename; file_content = await part.read()

            if not ip_address or not file_content: return self.json({"error": "Missing Data"}, status_code=400)

            if t0_map != 0:
                try:
                    text_content = file_content.decode('utf-8')
                    text_content = re.sub(r'\bT0\b', f'T{t0_map}', text_content)
                    file_content = text_content.encode('utf-8')
                except UnicodeDecodeError: pass

            form = aiohttp.FormData()
            form.add_field('print', 'false')
            form.add_field('file', file_content, filename=filename)

            async with session.post(f"http://{ip_address}:7125/server/files/upload", data=form) as resp:
                return self.json(await resp.json())
        except Exception as e:
            return self.json({"error": str(e)}, status_code=500)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ip_address = entry.data[CONF_IP_ADDRESS]
    session = async_get_clientsession(hass)

    card_path = os.path.join(os.path.dirname(__file__), "snapmaker-card.js")
    await hass.http.async_register_static_paths([StaticPathConfig("/snapmaker_u1/snapmaker-card.js", card_path, False)])

    hass.http.register_view(SnapmakerUploadView())
    hass.http.register_view(SnapmakerTerminalView())
    hass.http.register_view(SnapmakerQueryView())

    sw_version = "Unknown"
    try:
        async with session.get(f"http://{ip_address}:7125/printer/info", timeout=5) as info_res:
            sw_version = (await info_res.json()).get("result", {}).get("software_version", "Moonraker")
    except Exception: pass

    async def async_update_data():
        try:
            url = f"http://{ip_address}:7125/printer/objects/query?webhooks&print_stats&toolhead&extruder&extruder1&extruder2&extruder3&heater_bed&fan&gcode_move&display_status&virtual_sdcard&print_task_config"
            async with session.get(url, timeout=10) as response:
                status = (await response.json()).get("result", {}).get("status", {})
            try:
                files_url = f"http://{ip_address}:7125/server/files/list?root=gcodes"
                async with session.get(files_url, timeout=5) as files_res:
                    status["gcode_files"] = (await files_res.json()).get("result", [])
            except Exception:
                status["gcode_files"] = []
            return status
        except Exception as err:
            raise UpdateFailed(f"API Error: {err}")

    coordinator = DataUpdateCoordinator(hass, _LOGGER, name="snapmaker_u1", update_method=async_update_data, update_interval=timedelta(seconds=POLL_INTERVAL))
    coordinator.snapmaker_sw_version = sw_version
    coordinator.snapmaker_serial = ip_address.replace(".", "")

    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    async def handle_start_job(call):
        ip = call.data.get("ip_address")
        filename = call.data.get("filename")
        bed, timelapse, multicolor = call.data.get("bed_leveling", True), call.data.get("timelapse", False), call.data.get("multicolor", False)
        t0, t1, t2, t3 = int(call.data.get("t0_map", 0)), int(call.data.get("t1_map", 1)), int(call.data.get("t2_map", 2)), int(call.data.get("t3_map", 3))
        is_upload_flow = call.data.get("is_upload_flow", False)

        mapping = [t0, t1, t2, t3] + [0]*28 if multicolor else [t0, 1, 2, 3] + [0]*28
        base_url = f"http://{ip}:7125"

        # REMOVED BROKEN MACRO CALLS - JSON UPLOAD IS ENOUGH
        task_data = {"auto_bed_leveling": bed, "time_lapse_camera": timelapse, "flow_calibrate": False, "extruder_map_table": mapping, "extruders_used": [True]*4}
        form = aiohttp.FormData()
        form.add_field('root', 'config')
        form.add_field('file', json.dumps(task_data), filename='print_task.json', content_type='application/json')
        await session.post(f"{base_url}/server/files/upload", data=form)

        if not is_upload_flow and t0 != 0:
            async with session.get(f"{base_url}/server/files/gcodes/{urllib.parse.quote(filename)}") as resp:
                if resp.status == 200:
                    content = re.sub(r'\bT0\b', f'T{t0}', await resp.text())
                    uform = aiohttp.FormData()
                    uform.add_field('print', 'false')
                    uform.add_field('file', content.encode('utf-8'), filename=filename, content_type='text/plain')
                    await session.post(f"{base_url}/server/files/upload", data=uform)

        await asyncio.sleep(0.5)
        await session.post(f"{base_url}/printer/print/start?filename={urllib.parse.quote(filename)}")
        await coordinator.async_request_refresh()

    async def handle_delete_file(call):
        await session.delete(f"http://{call.data.get('ip_address')}:7125/server/files/gcodes/{urllib.parse.quote(call.data.get('filename'))}")
        await coordinator.async_request_refresh()

    async def handle_edit_spool(call):
        ip, tool, material, color_hex = call.data.get("ip_address"), int(call.data.get("tool", 0)), call.data.get("material", "PLA"), call.data.get("color", "FFFFFF").replace("#", "")
        try:
            payload = {"channel": tool, "info": {"VENDOR": "Generic", "MAIN_TYPE": material, "RGB_1": int(color_hex, 16), "ALPHA": 255}}
            async with session.post(f"http://{ip}:7125/printer/filament_detect/set", json=payload) as resp: await resp.read()
            await coordinator.async_request_refresh()
        except Exception: pass

    hass.services.async_register(DOMAIN, "start_print_job", handle_start_job)
    hass.services.async_register(DOMAIN, "delete_file", handle_delete_file)
    hass.services.async_register(DOMAIN, "edit_spool", handle_edit_spool)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok: hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok

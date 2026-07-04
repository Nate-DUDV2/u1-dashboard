import voluptuous as vol
from homeassistant import config_entries
from .const import DOMAIN, CONF_IP_ADDRESS

class SnapmakerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(
                title=f"Snapmaker U1 ({user_input[CONF_IP_ADDRESS]})", 
                data=user_input
            )
            
        data_schema = vol.Schema({
            vol.Required(CONF_IP_ADDRESS): str
        })
        
        return self.async_show_form(
            step_id="user", 
            data_schema=data_schema,
            description_placeholders={"setup_msg": "Enter your printer's IP"}
        )

"""Modbus coordinator for direct inverter connection."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException

from .const import (
    CONF_MODBUS_IP,
    CONF_MODBUS_PORT,
    CONF_MODBUS_SLAVE_ID,
)

_LOGGER = logging.getLogger(__name__)

# Confirmed register mapping shared with the standalone inverter dashboard.
# Registers whose meaning is still speculative are intentionally not exposed as
# Home Assistant entities.
REGISTER_MAP = {
    70: {"name": "parallel_status", "unit": "", "factor": 1.0},
    71: {"name": "fault_code_1", "unit": "", "factor": 1.0},
    72: {"name": "fault_code_2", "unit": "", "factor": 1.0},
    73: {"name": "alarm_code_1", "unit": "", "factor": 1.0},
    74: {"name": "alarm_code_2", "unit": "", "factor": 1.0},
    75: {"name": "rgb_foreground_color_high", "unit": "", "factor": 1.0},
    76: {"name": "rgb_foreground_color_low", "unit": "", "factor": 1.0},
    77: {"name": "rgb_foreground_mode", "unit": "", "factor": 1.0},
    78: {"name": "rgb_background_color_high", "unit": "", "factor": 1.0},
    79: {"name": "rgb_background_color_low", "unit": "", "factor": 1.0},
    80: {"name": "rgb_background_mode", "unit": "", "factor": 1.0},
    81: {"name": "grid_voltage_l1", "unit": "V", "factor": 0.1, "signed": True},
    82: {"name": "grid_current_l1", "unit": "A", "factor": 0.01, "signed": True},
    83: {"name": "grid_frequency_l1", "unit": "Hz", "factor": 0.01, "signed": True},
    84: {"name": "grid_power_l1", "unit": "W", "factor": 1.0, "signed": True},
    85: {"name": "generator_voltage_l1", "unit": "V", "factor": 0.1},
    86: {"name": "generator_current_l1", "unit": "A", "factor": 0.01},
    87: {"name": "generator_frequency_l1", "unit": "Hz", "factor": 0.01},
    88: {"name": "generator_power_l1", "unit": "W", "factor": 1.0},
    89: {"name": "load_voltage_l1", "unit": "V", "factor": 0.1, "signed": True},
    90: {"name": "ac_output_current", "unit": "A", "factor": 0.01},
    91: {"name": "load_frequency", "unit": "Hz", "factor": 0.01, "signed": True},
    92: {"name": "load_active_power", "unit": "W", "factor": 1.0, "signed": True},
    93: {"name": "load_apparent_power", "unit": "VA", "factor": 1.0, "signed": True},
    94: {"name": "inverter_load", "unit": "%", "factor": 0.1},
    95: {"name": "grid_load_l1", "unit": "W", "factor": 1.0, "signed": True},
    129: {"name": "battery_voltage", "unit": "V", "factor": 0.1},
    130: {
        "name": "battery_current",
        "unit": "A",
        "factor": 0.1,
        "signed": True,
        "invert": True,
    },
    133: {"name": "battery_state_of_charge", "unit": "%", "factor": 0.1, "signed": True},
    134: {"name": "battery_power", "unit": "W", "factor": 1.0, "signed": True},
    137: {"name": "bms_battery_voltage", "unit": "V", "factor": 0.1},
    138: {"name": "bms_battery_current", "unit": "A", "factor": 0.1, "signed": True},
    139: {"name": "bms_state_of_charge", "unit": "%", "factor": 1.0},
    140: {"name": "bms_battery_temperature", "unit": "°C", "factor": 0.1, "signed": True},
    141: {"name": "bms_max_charge_voltage", "unit": "V", "factor": 0.1},
    144: {"name": "bms_status_flags", "unit": "", "factor": 1.0},
    151: {"name": "pv1_voltage", "unit": "V", "factor": 0.1, "signed": True},
    152: {"name": "pv1_current", "unit": "A", "factor": 0.01, "signed": True},
    153: {"name": "pv1_power", "unit": "W", "factor": 1.0, "signed": True},
    154: {"name": "pv2_voltage", "unit": "V", "factor": 0.1, "signed": True},
    155: {"name": "pv2_current", "unit": "A", "factor": 0.01, "signed": True},
    156: {"name": "pv2_power", "unit": "W", "factor": 1.0, "signed": True},
    157: {"name": "pv_energy_today", "unit": "kWh", "factor": 0.1},
    158: {"name": "pv_energy_total", "unit": "kWh", "factor": 0.1},
    159: {"name": "pv1_charging_current", "unit": "A", "factor": 0.1},
    160: {"name": "pv2_charging_current", "unit": "A", "factor": 0.1},
    161: {"name": "pv_total_power", "unit": "W", "factor": 1.0},
    162: {"name": "pv_energy_month", "unit": "kWh", "factor": 0.1},
    163: {"name": "pv_energy_year", "unit": "kWh", "factor": 0.1},
    164: {"name": "charging_energy_today", "unit": "kWh", "factor": 0.1},
    165: {"name": "charging_energy_month", "unit": "kWh", "factor": 0.1},
    166: {"name": "charging_energy_year", "unit": "kWh", "factor": 0.1},
    167: {"name": "charging_energy_total", "unit": "kWh", "factor": 0.1},
    168: {"name": "discharging_energy_today", "unit": "kWh", "factor": 0.1},
    169: {"name": "discharging_energy_month", "unit": "kWh", "factor": 0.1},
    170: {"name": "discharging_energy_year", "unit": "kWh", "factor": 0.1},
    171: {"name": "discharging_energy_total", "unit": "kWh", "factor": 0.1},
    172: {"name": "inverting_energy_today", "unit": "kWh", "factor": 0.1},
    173: {"name": "inverting_energy_month", "unit": "kWh", "factor": 0.1},
    174: {"name": "inverting_energy_year", "unit": "kWh", "factor": 0.1},
    175: {"name": "inverting_energy_total", "unit": "kWh", "factor": 0.1},
    176: {"name": "load_energy_today", "unit": "kWh", "factor": 0.1},
    177: {"name": "load_energy_month", "unit": "kWh", "factor": 0.1},
    178: {"name": "load_energy_year", "unit": "kWh", "factor": 0.1},
    179: {"name": "load_energy_total", "unit": "kWh", "factor": 0.1},
    180: {"name": "grid_feed_in_energy_today", "unit": "kWh", "factor": 0.1},
    181: {"name": "grid_feed_in_energy_month", "unit": "kWh", "factor": 0.1},
    182: {"name": "grid_feed_in_energy_year", "unit": "kWh", "factor": 0.1},
    183: {"name": "grid_feed_in_energy_total", "unit": "kWh", "factor": 0.1},
    184: {"name": "grid_consumption_energy_today", "unit": "kWh", "factor": 0.1},
    185: {"name": "grid_consumption_energy_month", "unit": "kWh", "factor": 0.1},
    186: {"name": "grid_consumption_energy_year", "unit": "kWh", "factor": 0.1},
    187: {"name": "grid_consumption_energy_total", "unit": "kWh", "factor": 0.1},
    188: {"name": "output_side_load_power_l1", "unit": "W", "factor": 1.0},
    189: {"name": "output_side_load_power_l2", "unit": "W", "factor": 1.0},
    190: {"name": "output_side_load_power_l3", "unit": "W", "factor": 1.0},
    321: {"name": "output_mode", "unit": "", "factor": 1.0},
    322: {"name": "parallel_mode", "unit": "", "factor": 1.0},
    323: {"name": "actual_output_priority", "unit": "", "factor": 1.0},
    324: {"name": "actual_charging_priority", "unit": "", "factor": 1.0},
    325: {"name": "inverter_state", "unit": "", "factor": 1.0},
    337: {"name": "battery_type", "unit": "", "factor": 1.0},
    339: {"name": "battery_extended_soc", "unit": "%", "factor": 1.0, "signed": True},
    341: {"name": "positive_bus_voltage", "unit": "V", "factor": 0.1, "signed": True},
    342: {"name": "positive_battery_voltage", "unit": "V", "factor": 0.1, "signed": True},
    343: {"name": "battery_discharge_current", "unit": "A", "factor": 0.1, "signed": True},
    344: {"name": "battery_charge_current", "unit": "A", "factor": 0.1, "signed": True},
    345: {"name": "battery_overvoltage_alarm", "unit": "V", "factor": 0.1, "signed": True},
    346: {"name": "battery_low_voltage_alarm", "unit": "V", "factor": 0.1, "signed": True},
    349: {"name": "dual_output_cutoff_voltage", "unit": "V", "factor": 0.1, "signed": True},
    350: {"name": "dual_output_cutoff_time", "unit": "h", "factor": 1.0},
    376: {"name": "charge_voltage", "unit": "V", "factor": 0.1},
    377: {"name": "float_voltage", "unit": "V", "factor": 0.1},
    378: {"name": "maximum_charge_current", "unit": "A", "factor": 0.1},
    379: {"name": "additional_charge_current_limit", "unit": "A", "factor": 0.1},
    383: {"name": "high_voltage_threshold", "unit": "V", "factor": 0.1},
    385: {"name": "equalization_charge_delay", "unit": "h", "factor": 1.0},
    386: {"name": "equalization_charge_interval", "unit": "d", "factor": 1.0},
    401: {"name": "bms_communication_protocol", "unit": "", "factor": 1.0},
    402: {"name": "bms_communication_status", "unit": "", "factor": 1.0},
    403: {"name": "bms_package_id", "unit": "", "factor": 1.0},
    404: {"name": "bms_primary_voltage", "unit": "V", "factor": 0.1},
    405: {"name": "bms_primary_current", "unit": "A", "factor": 0.1, "signed": True},
    406: {"name": "bms_primary_temperature", "unit": "°C", "factor": 1.0, "signed": True},
    407: {"name": "bms_primary_soc", "unit": "%", "factor": 1.0},
    408: {"name": "bms_primary_soh", "unit": "%", "factor": 1.0},
    409: {"name": "bms_current_capacity", "unit": "Ah", "factor": 0.01},
    410: {"name": "bms_full_charge_capacity", "unit": "Ah", "factor": 0.01},
    411: {"name": "bms_cv_point", "unit": "V", "factor": 0.1, "signed": True},
    412: {"name": "bms_max_charge_current", "unit": "A", "factor": 0.01, "signed": True},
    413: {"name": "bms_permitted_continuous_battery_discharge_current", "unit": "A", "factor": 0.1},
    414: {"name": "bms_low_soc_alarm", "unit": "%", "factor": 1.0, "signed": True},
    415: {"name": "bms_low_soc_shutdown", "unit": "%", "factor": 1.0, "signed": True},
    416: {"name": "bms_low_soc_switching_reserve", "unit": "V", "factor": 0.1, "signed": True},
    417: {"name": "bms_high_soc_cutoff_reserve", "unit": "V", "factor": 0.1, "signed": True},
    448: {"name": "grid_consumption_today_high", "unit": "", "factor": 1.0},
    449: {"name": "grid_consumption_today_low", "unit": "", "factor": 1.0},
    450: {"name": "grid_consumption_month_high", "unit": "", "factor": 1.0},
    451: {"name": "grid_consumption_month_low", "unit": "", "factor": 1.0},
    452: {"name": "grid_consumption_year_high", "unit": "", "factor": 1.0},
    453: {"name": "grid_consumption_year_low", "unit": "", "factor": 1.0},
    454: {"name": "grid_consumption_total_high", "unit": "", "factor": 1.0},
    455: {"name": "grid_consumption_total_low", "unit": "", "factor": 1.0},
    529: {"name": "actual_output_source_priority", "unit": "", "factor": 1.0},
    530: {"name": "actual_ac_input_mode", "unit": "", "factor": 1.0},
    537: {"name": "inverter_output_voltage", "unit": "V", "factor": 0.1, "signed": True},
    538: {"name": "inverter_output_frequency", "unit": "Hz", "factor": 0.01, "signed": True},
    539: {"name": "inverter_output_current", "unit": "A", "factor": 0.01, "signed": True},
    541: {"name": "inverter_output_active_power", "unit": "W", "factor": 1.0, "signed": True},
    542: {"name": "inverter_output_apparent_power", "unit": "VA", "factor": 1.0, "signed": True},
    545: {"name": "inverter_output_load", "unit": "%", "factor": 0.1, "signed": True},
    818: {"name": "inverter_temperature", "unit": "°C", "factor": 0.1, "signed": True},
    823: {"name": "pv2_temperature", "unit": "°C", "factor": 0.1, "signed": True},
    16643: {"name": "output_source_priority", "unit": "", "factor": 1.0},
    16644: {"name": "ac_input_mode", "unit": "", "factor": 1.0},
    16645: {"name": "charging_source_priority", "unit": "", "factor": 1.0},
    16655: {"name": "grid_input_low_voltage_threshold", "unit": "V", "factor": 1.0},
}

# The Modbus limit of 125 applies to the quantity in one FC03 request. Public
# R-numbers are one-based references; pymodbus takes zero-based PDU addresses.
REGISTER_BLOCKS: tuple[tuple[int, int], ...] = (
    (70, 26),
    (129, 62),
    (321, 30),
    (375, 14),
    (401, 19),
    (448, 8),
    (529, 2),
    (537, 9),
    (817, 7),
    (16643, 3),
    (16655, 1),
)


def convert_value(
    raw_value: int,
    factor: float,
    *,
    signed: bool = False,
    invert: bool = False,
) -> float | None:
    """Convert raw register value to engineering units."""
    if signed and raw_value > 32767:
        raw_value = raw_value - 65536
    if invert:
        raw_value = -raw_value
    return round(raw_value * factor, 2)


class ModbusCoordinator(DataUpdateCoordinator):
    """Coordinator to fetch data from Modbus inverter."""

    def __init__(self, hass: HomeAssistant, config_data: dict[str, Any]) -> None:
        """Initialize the coordinator."""
        self.modbus_ip = config_data[CONF_MODBUS_IP]
        self.modbus_port = config_data.get(CONF_MODBUS_PORT, 502)
        self.modbus_slave_id = config_data.get(CONF_MODBUS_SLAVE_ID, 1)
        
        self.client = ModbusTcpClient(self.modbus_ip, port=self.modbus_port)
        
        super().__init__(
            hass,
            _LOGGER,
            name="SolarAssistant Modbus",
            update_interval=timedelta(seconds=1),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch data from Modbus device."""
        return await self.hass.async_add_executor_job(self._read_register_data)

    def _read_holding_block(self, start: int, count: int) -> Any:
        """Read one one-based public R block with pymodbus compatibility."""
        address = start - 1
        try:
            return self.client.read_holding_registers(
                address,
                count=count,
                device_id=self.modbus_slave_id,
            )
        except TypeError:
            return self.client.read_holding_registers(
                address,
                count=count,
                slave=self.modbus_slave_id,
            )

    def _read_register_data(self) -> dict[str, Any]:
        """Perform blocking Modbus I/O outside Home Assistant's event loop."""
        try:
            if not self.client.connect():
                _LOGGER.error("Failed to connect to Modbus device")
                return {}

            data: dict[str, Any] = {}
            successful_blocks = 0
            for start, count in REGISTER_BLOCKS:
                try:
                    result = self._read_holding_block(start, count)
                except (ModbusException, OSError) as error:
                    _LOGGER.warning("Modbus block R%s-R%s failed: %s", start, start + count - 1, error)
                    continue
                if result.isError():
                    _LOGGER.warning("Modbus block R%s-R%s returned error: %s", start, start + count - 1, result)
                    continue
                successful_blocks += 1
                for offset, raw_value in enumerate(result.registers):
                    reg_addr = start + offset
                    reg_info = REGISTER_MAP.get(reg_addr)
                    if reg_info is None:
                        continue
                    converted = convert_value(
                        raw_value,
                        reg_info["factor"],
                        signed=reg_info.get("signed", False),
                        invert=reg_info.get("invert", False),
                    )
                    
                    if converted is not None:
                        data[reg_info["name"]] = {
                            "value": converted,
                            "unit": reg_info["unit"],
                        }

            if successful_blocks == 0:
                _LOGGER.error("All Modbus register blocks failed")
                return {}

            for period in ("today", "month", "year", "total"):
                high = data.get(f"grid_consumption_{period}_high", {}).get("value")
                low = data.get(f"grid_consumption_{period}_low", {}).get("value")
                if isinstance(high, (int, float)) and isinstance(low, (int, float)):
                    data[f"grid_consumption_{period}"] = {
                        "value": round(((int(high) << 16) | int(low)) * 0.01, 2),
                        "unit": "kWh",
                    }

            battery_current = data.get("battery_current", {}).get("value")
            battery_power = data.get("battery_power", {}).get("value")
            if (
                isinstance(battery_current, (int, float))
                and abs(battery_current) >= 0.3
                and isinstance(battery_power, (int, float))
            ):
                data["battery_power"]["value"] = (
                    abs(battery_power) if battery_current > 0 else -abs(battery_power)
                )
            
            return data

        except ModbusException as error:
            _LOGGER.error("Modbus exception: %s", error)
            return {}
        except Exception:
            _LOGGER.exception("Unexpected error reading Modbus")
            return {}
        finally:
            self.client.close()

    async def async_stop(self) -> None:
        """Stop the coordinator and close connection."""
        self.client.close()
        await super().async_stop()

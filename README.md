# Snapmaker U1 Dashboard 🖨️

A standalone, cross-platform desktop control panel designed specifically for Snapmaker U1 3D Printers. Originally built for **Nates Print Shop**, this dashboard provides a clean, unified interface to monitor and control multi-color prints without needing a browser.

### ⚠️ IMPORTANT REQUIREMENT
**This dashboard requires your printer to be running the Extended Firmware.** Before using this app, you must install the custom firmware found here: 
👉 [SnapmakerU1-Extended-Firmware by paxx12](https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware)

## ✨ Features
* **Live Video Feed:** Real-time monitoring of your print bed.
* **Multi-OS Support:** Runs natively as a desktop app on Windows, macOS, and Linux.
* **Full Toolhead Control:** Monitor and adjust target temperatures for the bed and up to 4 extruders.
* **Live Adjustments:** Babystep Z-offsets, adjust fan speeds, and control global print speed on the fly.
* **Material Management:** Edit spool colors and filament types directly from the dashboard.
* **Internal Storage Manager:** View, launch, or delete G-Code files saved on the printer.
* **Advanced Print Launching:** Configure Auto Bed Leveling, Timelapse, and Multi-Color mapping before starting a job.
* **Klipper Terminal:** Built-in console to send direct G-Code commands and read system logs.

## 🚀 How to Run the App (End Users)
You do not need to install anything to run this dashboard.
1. Download the latest release for your operating system.
2. Extract the `.zip` folder.
3. **Windows:** Double-click `Snapmaker U1 Dashboard.exe`.
4. **Linux:** Right-click the executable, check "Allow executing file as program", and run it.
5. **macOS:** Due to Apple's Gatekeeper, you may need to right-click the app and select "Open" the first time, or allow it via *System Settings > Privacy & Security*.

## 🛠️ Development Setup
If you want to build this application from source:

1. **Install Node.js** (v18 or newer).
2. Clone this repository.
3. Install dependencies:
   ```bash
   npm install
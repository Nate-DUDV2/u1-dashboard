# Snapmaker U1 Dashboard 🖨️

A standalone, cross-platform desktop control panel designed specifically for Snapmaker U1 3D Printers. Originally built for **Nates Print Shop**, this dashboard provides a clean, unified interface to monitor and control multi-color prints without needing a browser.

### ⚠️ IMPORTANT REQUIREMENT
**This dashboard requires your printer to be running the Extended Firmware.** You can download our pre-compiled `v4.5-NatesPrintShop-Extended.bin` file directly from our [Releases Page](https://github.com/Nate-DUDV2/u1-dashboard/releases), or visit the upstream repository here:
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

## 🏠 Home Assistant Integration (Full-Screen Control Panel)

You can run this custom dashboard natively inside Home Assistant as a blazing-fast, full-screen control center. 

### Step 1: Copy the Web Files to Home Assistant
The compiled web files live in the `/dist` folder of this repository. You need to place them into your Home Assistant `www` directory.

* **Option A: Via SSH/Terminal (Easiest for Linux/Docker/Ubuntu)**
  SSH into your Home Assistant server and run this single command to pull the files directly into the right place:
  ```bash
  git clone [https://github.com/Nate-DUDV2/u1-dashboard.git](https://github.com/Nate-DUDV2/u1-dashboard.git) /tmp/u1-dashboard && mv /tmp/u1-dashboard/dist /config/www/nates-dashboard && rm -rf /tmp/u1-dashboard
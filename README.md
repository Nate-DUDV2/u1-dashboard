# Snapmaker U1 Dashboard Suite 🖨️
[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)

A standalone, cross-platform desktop control panel and **Home Assistant Integration** designed specifically for Snapmaker U1 3D Printers. Originally built for **Nates Print Shop**, this suite provides a clean, unified interface to monitor and control multi-color prints without relying on the cloud.

## ⚠️ IMPORTANT REQUIREMENT
**This dashboard requires your printer to be running the Extended Firmware.** You can download our pre-compiled `v4.5-NatesPrintShop-Extended.bin` file directly from our [Releases Page](https://github.com/Nate-DUDV2/u1-dashboard/releases), or visit the upstream repository here: 👉 [SnapmakerU1-Extended-Firmware by paxx12](https://github.com/paxx12/SnapmakerU1-Extended-Firmware)

---

## ✨ Features
* **Multi-Platform:** Runs natively as a desktop app on Windows, macOS, and Linux, OR directly inside Home Assistant.
* **Live Video Feed & Telemetry:** Real-time monitoring of your print bed, temperatures, and print progress.
* **Full Toolhead Control:** Monitor and adjust target temperatures for the bed and up to 4 extruders.
* **Spool Management (AMS):** Heat, load, unload, and edit spool colors and filament types directly from the dashboard with a dynamic learning UI.
* **Live Adjustments:** Babystep Z-offsets, adjust fan speeds, and control global print speed on the fly.
* **Internal Storage Manager:** View, launch, or delete G-Code files saved on the printer.
* **Advanced Print Launching:** Configure Auto Bed Leveling, Timelapse, and Multi-Color mapping before starting a job.
* **Klipper Terminal:** Built-in console to send direct G-Code commands and read color-coded system logs.

---

## 🏠 Home Assistant Integration (Via HACS)
You can run this custom dashboard natively inside Home Assistant as a blazing-fast, modular control center.

### 📦 Installation
1. Open **HACS** in Home Assistant.
2. Click the 3 dots in the top right corner and select **Custom repositories**.
3. Paste the URL of this repository: `https://github.com/Nate-DUDV2/u1-dashboard`
4. Select **Integration** as the category and click **Add**.
5. Click on **Snapmaker U1 Dashboard Suite** and click **Download**.
6. **Restart Home Assistant.**

### ⚙️ Dashboard Setup
1. Go to **Settings > Devices & Services > Add Integration**. Search for **Snapmaker U1** and enter your printer's IP address.
2. Go to **Settings > Dashboards**, click the 3 dots in the top right, and select **Resources**.
3. Click **Add Resource**.
   * URL: `/snapmaker_u1/snapmaker-card.js?v=226`
   * Resource Type: **JavaScript Module**
4. Go to your Lovelace Dashboard, click **Edit**, click **Add Card**, and add the 4 custom Snapmaker cards to your UI!

---

## 🚀 How to Run the Desktop App (End Users)
You do not need to install anything to run the standalone desktop dashboard.

1. Download the latest release for your operating system from the Releases page.
2. Extract the `.zip` folder.
3. **Windows:** Double-click `Snapmaker U1 Dashboard.exe`.
4. **Linux:** Right-click the executable, check "Allow executing file as program", and run it.
5. **macOS:** Due to Apple's Gatekeeper, you may need to right-click the app and select "Open" the first time, or allow it via System Settings > Privacy & Security.
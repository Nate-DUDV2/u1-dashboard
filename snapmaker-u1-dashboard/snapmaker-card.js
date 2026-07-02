import { LitElement, html, css } from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

class SnapmakerCardEditor extends LitElement {
  static get properties() { return { hass: {}, _config: {} }; }
  setConfig(config) { this._config = config; }

  render() {
    if (!this.hass || !this._config) return html``;
    return html`
      <div class="card-config">
        <h3>Snapmaker Connection Settings</h3>
        <ha-textfield label="Printer IP Address (e.g., 192.168.1.50)" .value=${this._config.printer_ip || ""} @input=${this._valueChanged}></ha-textfield>
      </div>
    `;
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) return;
    const target = ev.target;
    if (this._config.printer_ip === target.value) return;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config, printer_ip: target.value } }, bubbles: true, composed: true }));
  }
}
customElements.define("snapmaker-card-editor", SnapmakerCardEditor);

class SnapmakerCard extends LitElement {
  static get properties() {
    return {
      hass: {}, config: {},
      printerState: { type: String }, progress: { type: Number },
      bedTemp: { type: Object }, toolTemps: { type: Array },
      printStats: { type: Object }, jobInfo: { type: Object },
      filename: { type: String }, files: { type: Array },
      spools: { type: Array }, selectedFile: { type: String }
    };
  }

  static getConfigElement() { return document.createElement("snapmaker-card-editor"); }
  static getStubConfig() { return { printer_ip: "" }; }

  constructor() {
    super();
    this.printerState = "disconnected";
    this.filename = "";
    this.files = [];
    this.selectedFile = null;
    
    // Exactly matching your React States
    this.bedTemp = { current: 0, target: 0 };
    this.toolTemps = [{ current: 0, target: 0 }, { current: 0, target: 0 }, { current: 0, target: 0 }, { current: 0, target: 0 }];
    this.printStats = { layer: 0, totalLayers: 0, speed: 100, fan: 0 };
    this.jobInfo = { state: '', progress: 0, elapsed: 0, remaining: 0, filament: 0 };
    this.spools = [
      { vendor: '', type: '---', color: 'FFFFFF' }, { vendor: '', type: '---', color: 'FFFFFF' },
      { vendor: '', type: '---', color: 'FFFFFF' }, { vendor: '', type: '---', color: 'FFFFFF' }
    ];
  }

  setConfig(config) {
    if (!config.printer_ip) throw new Error("Please define a printer IP");
    let cleanIp = config.printer_ip.replace(/\/$/, ""); 
    let baseUrl = cleanIp.includes(":7125") ? cleanIp.replace(":7125", "") : cleanIp;
    if (!baseUrl.startsWith("http")) baseUrl = `http://${baseUrl}`;
    this.config = { ...config, clean_url: `${baseUrl}:7125`, base_url: baseUrl };
  }

  connectedCallback() {
    super.connectedCallback();
    this._pollMoonraker();
    this._fetchFiles();
    this._pollingInterval = setInterval(() => this._pollMoonraker(), 2000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollingInterval) clearInterval(this._pollingInterval);
  }

  async _pollMoonraker() {
    if (!this.config?.clean_url) return;
    try {
      const res = await fetch(`${this.config.clean_url}/printer/objects/query?print_stats&toolhead&extruder&extruder1&extruder2&extruder3&heater_bed&fan&gcode_move&display_status&print_task_config&virtual_sdcard`);
      const data = await res.json();
      const status = data?.result?.status;

      if (status) {
        this.bedTemp = { current: Number(status.heater_bed?.temperature || 0), target: Number(status.heater_bed?.target || 0) };
        this.toolTemps = [
          { current: Number(status.extruder?.temperature || 0), target: Number(status.extruder?.target || 0) },
          { current: Number(status.extruder1?.temperature || 0), target: Number(status.extruder1?.target || 0) },
          { current: Number(status.extruder2?.temperature || 0), target: Number(status.extruder2?.target || 0) },
          { current: Number(status.extruder3?.temperature || 0), target: Number(status.extruder3?.target || 0) }
        ];
        
        this.printStats = { 
          layer: Number(status.print_stats?.info?.current_layer || 0), 
          totalLayers: Number(status.print_stats?.info?.total_layer || 0), 
          speed: Number((status.gcode_move?.speed_factor || 1) * 100), 
          fan: Number((status.fan?.speed || 0) * 100) 
        };
        
        this.filename = status.print_stats?.filename || "";
        this.printerState = status.print_stats?.state || "standby";

        const duration = Number(status.print_stats?.print_duration || 0);
        const prog = Number(status.display_status?.progress || 0);
        const fileProg = Number(status.virtual_sdcard?.progress || prog);
        
        this.jobInfo = {
          state: status.print_stats?.state || '', progress: prog * 100, elapsed: duration,
          remaining: (fileProg > 0 && fileProg < 1) ? (duration / fileProg) - duration : 0,
          filament: Number(status.print_stats?.filament_used || 0) / 1000
        };

        const config = status.print_task_config;
        if (config && config.filament_color_rgba && config.filament_type) {
          this.spools = [0,1,2,3].map(i => {
            const rawColor = String(config.filament_color_rgba[i] || 'FFFFFF');
            return { vendor: config.filament_vendor?.[i] || 'Snapmaker', type: String(config.filament_type[i] || '---'), color: rawColor.length >= 6 ? rawColor.substring(0, 6) : 'FFFFFF' };
          });
        }
      }
    } catch (err) {}
  }

  async _fetchFiles() {
    if (!this.config?.clean_url) return;
    try {
      const res = await fetch(`${this.config.clean_url}/server/files/list?root=gcodes`);
      const data = await res.json();
      if (data.result) this.files = data.result.sort((a, b) => b.modified - a.modified).slice(0, 10);
    } catch (err) {}
  }

  _formatTime(s) { const h = Math.floor((s || 0) / 3600); const m = Math.floor(((s || 0) % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; }
  _formatSize(b) { return (Number(b || 0) / 1024 / 1024).toFixed(2) + ' MB'; }
  _formatDate(u) { return u ? new Date(u * 1000).toLocaleString() : 'Unknown'; }

  async _postApi(endpoint) {
    if (this.config?.clean_url) await fetch(`${this.config.clean_url}${endpoint}`, { method: 'POST' }).catch(console.error);
  }
  async _sendGcode(gcode) {
    if (this.config?.clean_url) await fetch(`${this.config.clean_url}/printer/gcode/script?script=${encodeURIComponent(gcode)}`, { method: 'POST' }).catch(console.error);
  }

  // --- HTML UI EXACT MATCH TO REACT ---
  render() {
    if (!this.config) return html``;

    return html`
      <ha-card style="display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; background-color: #0f1115; color: white; font-family: sans-serif;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 15px;">
          <div style="display: flex; align-items: center;">
             <div style="background: #ff4f4f; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px; font-size: 14px; margin-right: 10px;">U1</div>
             <div style="font-size: 18px; font-weight: bold; text-transform: uppercase;">Command Center</div>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <div style="padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; background: #2c313c; color: #888; text-transform: uppercase;">${this.printerState}</div>
            <button style="display: flex; align-items: center; gap: 5px; background-color: #1e1b2e; border: 1px solid #3d2b4f; color: #b28dd4; padding: 8px 12px; border-radius: 4px; cursor: pointer;">⚙️ Control Panel</button>
          </div>
        </div>

        <div style="display: flex; margin-top: 20px; gap: 20px; height: 450px;">
          <div style="width: 150px; display: flex; flex-direction: column; gap: 15px;">
            <div style="font-size: 11px; color: #888; font-weight: bold; letter-spacing: 1px; margin-bottom: 5px;">TOOLHEADS</div>
            ${this.toolTemps.map((tool, index) => html`
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="background-color: #2c313c; color: #888; border-radius: 4px; padding: 4px 8px; font-size: 12px;">${index + 1}</div>
                <div style="display: flex; flex-direction: column;">
                  <span style="font-size: 18px; font-weight: bold; color: ${tool.target > 0 ? '#ff4f4f' : 'white'};">${Number(tool.current).toFixed(0)}°</span>
                  <span style="font-size: 11px; color: #888;">/${Number(tool.target).toFixed(0)}°C</span>
                </div>
              </div>
            `)}
            <div style="font-size: 11px; color: #888; font-weight: bold; letter-spacing: 1px; margin-top: 10px; margin-bottom: 5px;">BED</div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 24px; font-weight: bold; color: #ffb020;">${Number(this.bedTemp.current).toFixed(0)}°</span>
              <span style="font-size: 11px; color: #888;">/${Number(this.bedTemp.target).toFixed(0)}°C</span>
            </div>
          </div>
          
          <div style="flex: 1; background-color: #161B22; border-radius: 8px; border: 1px solid #333; display: flex; justify-content: center; align-items: center; overflow: hidden;">
             <img src="${this.config.base_url}/webcam/stream.mjpg" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
             <p style="color: #555; display: none;">No Print Active / Click for Camera</p>
          </div>
          
          <div style="width: 100px; display: flex; flex-direction: column; gap: 20px; align-items: flex-end; text-align: right;">
            <div style="display: flex; flex-direction: column;"><span style="font-size: 11px; color: #888; font-weight: bold; letter-spacing: 1px;">LAYER</span><span style="font-size: 24px; font-weight: bold;">${this.printStats.layer}</span><span style="font-size: 11px; color: #888;">/${this.printStats.totalLayers > 0 ? this.printStats.totalLayers : '-'}</span></div>
            <div style="display: flex; flex-direction: column;"><span style="font-size: 11px; color: #888; font-weight: bold; letter-spacing: 1px;">SPEED</span><span style="font-size: 24px; font-weight: bold;">${Number(this.printStats.speed).toFixed(0)}</span><span style="font-size: 11px; color: #888;">%</span></div>
            <div style="display: flex; flex-direction: column;"><span style="font-size: 11px; color: #888; font-weight: bold; letter-spacing: 1px;">FAN</span><span style="font-size: 24px; font-weight: bold;">${Number(this.printStats.fan).toFixed(0)}</span><span style="font-size: 11px; color: #888;">%</span></div>
          </div>
        </div>

        <div style="margin-top: 30px; display: flex; flex-direction: column; gap: 15px;">
          <div style="display: flex; gap: 20px;">
            ${this.spools.map((spool, i) => html`
              <div style="flex: 1; background-color: #1e2227; padding: 15px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
                <span style="font-size: 12px; color: #888; margin-bottom: 10px;">Toolhead ${i + 1}</span>
                <div style="width: 40px; height: 40px; border-radius: 50%; background-color: #${spool.color}; border: 2px solid #333;"></div>
                <span style="font-size: 14px; margin-top: 10px; font-weight: bold;">${spool.type}</span>
              </div>
            `)}
          </div>

          <div>
            <div style="color: #aaa; font-size: 12px; margin-bottom: 5px;">${this.filename || 'No File Active'}</div>
            <div style="display: flex; align-items: center; gap: 15px;">
              <div style="font-size: 28px; font-weight: bold;">${Number(this.jobInfo.progress).toFixed(1)}%</div>
              <div style="flex: 1; height: 8px; background-color: #333; border-radius: 4px; overflow: hidden;">
                <div style="width: ${this.jobInfo.progress}%; height: 100%; background-color: #00E5FF;"></div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 10px; padding: 0 5px;">
              <div><div style="font-size: 10px; color: #888; font-weight: bold; letter-spacing: 1px;">ELAPSED</div><div style="font-size: 16px; font-weight: bold;">${this._formatTime(this.jobInfo.elapsed)}</div></div>
              <div style="text-align: center;"><div style="font-size: 10px; color: #888; font-weight: bold; letter-spacing: 1px;">FILAMENT</div><div style="font-size: 16px; font-weight: bold;">${Number(this.jobInfo.filament).toFixed(1)}m</div></div>
              <div style="text-align: right;"><div style="font-size: 10px; color: #888; font-weight: bold; letter-spacing: 1px;">REMAINING</div><div style="font-size: 16px; font-weight: bold;">${this._formatTime(this.jobInfo.remaining)}</div></div>
            </div>
          </div>

          <div style="margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="font-size: 12px; color: #888; font-weight: bold; letter-spacing: 1px;">📁 INTERNAL STORAGE</div>
              <div style="display: flex; gap: 10px;">
                <button style="background-color: #3a2325; border: 1px solid #4a2c2f; color: #ff6b6b; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ Delete</button>
                <button @click=${this._fetchFiles} style="background-color: #232936; border: 1px solid #2c3547; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🔄 Refresh</button>
                <button style="background-color: #1d3b25; border: 1px solid #254e31; color: #6bfc8b; font-weight: bold; padding: 6px 12px; border-radius: 4px; cursor: pointer;">▶ Launch</button>
              </div>
            </div>
            <div style="height: 150px; overflow-y: auto; background-color: #181b21; border: 1px solid #333; border-radius: 4px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead style="position: sticky; top: 0; background-color: #222730; border-bottom: 1px solid #444;">
                  <tr><th style="padding: 8px;">Name</th><th style="padding: 8px;">Size</th><th style="padding: 8px;">Date</th></tr>
                </thead>
                <tbody>
                  ${this.files.map(f => html`
                    <tr @click=${() => this.selectedFile = f.path} style="border-bottom: 1px solid #222; cursor: pointer; background-color: ${this.selectedFile === f.path ? '#2a3b5c' : 'transparent'}">
                      <td style="padding: 8px;">${f.path}</td>
                      <td style="padding: 8px;">${this._formatSize(f.size)}</td>
                      <td style="padding: 8px;">${this._formatDate(f.modified)}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button style="flex: 1; padding: 15px; background-color: #1f2b23; border: 1px solid #2d4734; color: #84e296; font-size: 16px; border-radius: 4px; cursor: pointer;">📤 Upload & Print</button>
            <button @click=${() => this._postApi(this.jobInfo.state === 'paused' ? '/printer/print/resume' : '/printer/print/pause')} style="flex: 1; padding: 15px; background-color: #f0f0f0; border: none; color: #8a6dc2; font-size: 16px; font-weight: bold; border-radius: 4px; cursor: pointer;">${this.jobInfo.state === 'paused' ? '▶ Resume' : 'II Pause'}</button>
            <button @click=${() => { if(confirm("Cancel print?")) this._postApi('/printer/print/cancel'); }} style="flex: 1; padding: 15px; background-color: #f0f0f0; border: none; color: #ff4f4f; font-size: 16px; font-weight: bold; border-radius: 4px; cursor: pointer;">⏹ Stop</button>
            <button @click=${() => { if(confirm("EMERGENCY STOP! Proceed?")) { this._postApi('/emergency_stop'); this._sendGcode('M112'); } }} style="flex: 1; padding: 15px; background-color: #361e1e; border: 1px solid #552d2d; color: #ff4f4f; font-size: 16px; font-weight: bold; border-radius: 4px; cursor: pointer;">⚡ E-Stop</button>
          </div>
        </div>

      </ha-card>
    `;
  }
}
customElements.define("snapmaker-card", SnapmakerCard);

window.customCards = window.customCards || [];
window.customCards.push({ type: "snapmaker-card", name: "Snapmaker U1 Dashboard", description: "Native Home Assistant port matching the React layout.", preview: true });
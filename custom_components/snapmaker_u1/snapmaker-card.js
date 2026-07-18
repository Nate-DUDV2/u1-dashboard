import { LitElement, html, css } from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

// ==========================================
// UNIVERSAL EDITOR
// ==========================================
class SnapmakerUniversalEditor extends LitElement {
  static get properties() { return { hass: {}, _config: {} }; }
  setConfig(config) { this._config = config; }

  render() {
    if (!this.hass || !this._config) return html``;
    const entities = Object.keys(this.hass.states).filter(eid => eid.startsWith('sensor.') && eid.includes('_printer_state'));
    
    return html`
      <div class="card-config">
        <h3>Snapmaker U1 Card Setup</h3>
        <p style="font-size: 12px; color: var(--secondary-text-color);">Select your printer's state sensor.</p>
        <select @change=${this._valueChanged} style="width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; margin-bottom: 12px;">
          <option value="">Select Printer Entity...</option>
          ${entities.map(ent => html`<option value=${ent} ?selected=${this._config.entity === ent}>${ent}</option>`)}
        </select>

        <p style="font-size: 12px; color: var(--secondary-text-color); margin-top: 12px;">Custom Printer Name (Optional)</p>
        <input type="text" placeholder="e.g. Gantry Gourmet" .value=${this._config.name || ''} @input=${this._nameChanged} style="width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box;">
      </div>
    `;
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) return;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config, entity: ev.target.value } }, bubbles: true, composed: true }));
  }

  _nameChanged(ev) {
    if (!this._config || !this.hass) return;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: { ...this._config, name: ev.target.value } }, bubbles: true, composed: true }));
  }
}
customElements.define("snapmaker-universal-editor", SnapmakerUniversalEditor);

// ==========================================
// SHARED HELPER LOGIC
// ==========================================
class SnapmakerBaseCard extends LitElement {
  static get properties() { return { hass: {}, config: {}, _liveData: { type: Object } }; }
  
  constructor() { 
    super(); 
    this._liveData = {}; 
    this._liveInterval = null;
  }

  static getConfigElement() { return document.createElement("snapmaker-universal-editor"); }
  setConfig(config) { this.config = config; }

  connectedCallback() {
    super.connectedCallback();
    this._liveInterval = setInterval(() => this._fetchLiveData(), 2000);
    this._fetchLiveData();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._liveInterval) clearInterval(this._liveInterval);
  }

  async _fetchLiveData() {
    if (!this.hass || !this.config || !this.config.entity) return;
    const ip = this._getIpFromEntity();
    if (!ip || ip === "127.0.0.1") return;
    try {
      const data = await this.hass.callApi('GET', `snapmaker_u1/query?ip=${ip}`);
      if (data && data.result && data.result.status) {
        this._liveData = data.result.status;
      }
    } catch(e) {}
  }

  _getPrinterName() {
    if (this.config && this.config.name) return this.config.name;
    if (!this.hass || !this.config || !this.config.entity) return "Snapmaker U1";
    const stateObj = this.hass.states[this.config.entity];
    if (stateObj && stateObj.attributes && stateObj.attributes.friendly_name) {
      let name = stateObj.attributes.friendly_name.replace(/( Printer State|_printer_state)$/i, '').trim();
      name = name.replace(/\s*\(\d{1,3}(\.\d{1,3}){3}\)\s*/, '');
      return name;
    }
    return "Snapmaker U1";
  }

  _getIpSafe() {
    if (!this.config || !this.config.entity) return null;
    const match = this.config.entity.match(/_(\d{1,3}_\d{1,3}_\d{1,3}_\d{1,3})_/);
    return match ? match[1] : null;
  }

  _getIpFromEntity() {
    const ipSafe = this._getIpSafe();
    return ipSafe ? ipSafe.replace(/_/g, ".") : "127.0.0.1";
  }

  _getDerivedEntity(suffix) {
    if (!this.hass) return null;
    const ipSafe = this._getIpSafe();
    if (!ipSafe) return null;
    const targetSuffix = suffix.toLowerCase();
    const entityId = Object.keys(this.hass.states).find(id => id.includes(ipSafe) && id.endsWith(`_${targetSuffix}`));
    return entityId ? this.hass.states[entityId] : null;
  }

  _getState(suffix) { const e = this._getDerivedEntity(suffix); return e && e.state !== 'unknown' ? e.state : "—"; }
  _getAttr(suffix, attr) { const e = this._getDerivedEntity(suffix); return e && e.attributes ? e.attributes[attr] : null; }
  
  _formatSize(bytes) { return (bytes / (1024 * 1024)).toFixed(2) + " MB"; }

  _showToast(title, msg, isError = false) {
    let toast = this.shadowRoot.getElementById('sm-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sm-toast';
      toast.style.cssText = `position: absolute; top: 16px; right: 16px; background: #161B22; border: 1px solid #214A29; border-left: 4px solid #6BCB77; padding: 12px 16px; border-radius: 6px; color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s; z-index: 9999; pointer-events: none; display: flex; align-items: center; gap: 10px; max-width: 80%;`;
      toast.innerHTML = `<div id="sm-toast-dot" style="width:10px; height:10px; border-radius:50%; background:#6BCB77; flex-shrink:0;"></div><div><div id="sm-toast-title" style="font-weight:bold; font-size:14px; margin-bottom:2px;"></div><div id="sm-toast-msg" style="font-size:12px; color:#aaa;"></div></div>`;
      this.shadowRoot.appendChild(toast);
    }
    this.shadowRoot.getElementById('sm-toast-title').innerText = title;
    this.shadowRoot.getElementById('sm-toast-msg').innerText = msg;
    const dot = this.shadowRoot.getElementById('sm-toast-dot');
    const color = isError ? '#FF6B6B' : '#6BCB77';
    dot.style.background = color; toast.style.borderLeftColor = color; toast.style.borderColor = isError ? '#4A1D1D' : '#214A29';
    toast.style.opacity = '1';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
  }

  async _sendGcode(gcode) {
    if (!this.hass) return;
    const ipSafe = this._getIpSafe();
    const termId = Object.keys(this.hass.states).find(id => id.startsWith('text.') && id.includes(ipSafe));
    if (termId) {
      this.hass.callService('text', 'set_value', { entity_id: termId, value: gcode });
      this._showToast("Command Sent", gcode);
    } else {
      const ip = this._getIpFromEntity();
      try {
        await fetch(`http://${ip}:7125/printer/gcode/script?script=${encodeURIComponent(gcode)}`, { method: "POST" });
        this._showToast("Command Sent", gcode);
      } catch(e) { this._showToast("Send Failed", "Terminal Entity Missing.", true); }
    }
  }
}

// ==========================================
// 1. STATUS CARD
// ==========================================
class SnapmakerStatusCard extends SnapmakerBaseCard {
  static get properties() { return { ...super.properties, _showCamera: { type: Boolean }, _thumbnailUrl: { type: String }, _cameraType: { type: String } }; }

  constructor() { super(); this._showCamera = true; this._thumbnailUrl = null; this._lastFetchedFile = null; this._cameraType = 'case'; }

  static get styles() {
    return css`
      ha-card { padding: 16px; display: flex; flex-direction: column; gap: 16px; position: relative; }
      .header { display: flex; justify-content: space-between; align-items: center; }
      .title { font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
      .main-content { display: flex; gap: 16px; min-height: 200px; }
      .camera-feed { flex: 1; background: var(--secondary-background-color); border-radius: 8px; overflow: hidden; display: flex; justify-content: center; align-items: center; cursor: pointer; position: relative; border: 1px solid var(--divider-color); }
      .stats-panel { width: 100px; display: flex; flex-direction: column; gap: 12px; background: var(--secondary-background-color); padding: 12px; border-radius: 8px; border: 1px solid var(--divider-color); }
      .stat-item { display: flex; flex-direction: column; }
      .stat-label { font-size: 11px; color: var(--secondary-text-color); display: flex; align-items: center; gap: 4px; }
      .stat-value { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
      .progress-container { display: flex; flex-direction: column; gap: 4px; }
      .progress-label { font-size: 12px; color: var(--secondary-text-color); display: flex; justify-content: space-between; }
      .progress-bar-bg { height: 6px; background: var(--secondary-background-color); border-radius: 4px; overflow: hidden; border: 1px solid var(--divider-color); }
      .progress-bar-fill { height: 100%; background: var(--primary-color); transition: width 0.3s ease; }
      .actions-row { display: flex; gap: 10px; margin-top: 8px; }
      .btn { flex: 1; padding: 12px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; border: none; text-align: center; transition: 0.2s; }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .interactive-stat:hover { opacity: 0.7; cursor: pointer; }
    `;
  }

  async updated(changedProperties) {
    super.updated(changedProperties);
    const isPreview = !this.config || !this.config.entity || !this.hass;
    if (isPreview) return;

    const currentFile = this._getState('current_file');
    if (currentFile && currentFile !== '—' && currentFile !== this._lastFetchedFile) {
      this._lastFetchedFile = currentFile;
      const ip = this._getIpFromEntity();
      try {
        const res = await fetch(`http://${ip}:7125/server/files/metadata?filename=${encodeURIComponent(currentFile)}`);
        const data = await res.json();
        const thumbs = data.result?.thumbnails;
        if (thumbs && thumbs.length > 0) {
          const path = thumbs[thumbs.length - 1].relative_path;
          this._thumbnailUrl = `http://${ip}:7125/server/files/gcodes/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
        } else this._thumbnailUrl = null;
      } catch (e) { this._thumbnailUrl = null; }
    }
  }

  render() {
    const isPreview = !this.config || !this.config.entity || !this.hass;

    const printerName = isPreview ? "Snapmaker U1 (Preview)" : this._getPrinterName();
    const liveState = isPreview ? "printing" : (this._liveData?.print_stats?.state || this._getState('printer_state'));
    const isPaused = liveState.toLowerCase() === 'paused';
    const isPrinting = liveState.toLowerCase() === 'printing';

    const info = this._liveData?.print_stats?.info || {};
    const layer = isPreview ? '42' : (info.current_layer !== undefined ? info.current_layer : (this._getState('current_layer') === '—' ? '0' : this._getState('current_layer')));
    const tLayers = isPreview ? '150' : (info.total_layer !== undefined ? info.total_layer : (this._getState('total_layers') === '—' ? '0' : this._getState('total_layers')));
    
    const bedTempRaw = this._liveData?.heater_bed?.temperature;
    const bedTemp = isPreview ? '60.0' : (bedTempRaw !== undefined ? bedTempRaw.toFixed(1) : (this._getState('bed_temp') === '—' ? '0.0' : this._getState('bed_temp')));
    
    const progRaw = this._liveData?.display_status?.progress;
    const prog = isPreview ? '28.0' : (progRaw !== undefined ? (progRaw * 100).toFixed(1) : (this._getState('print_progress') === '—' ? '0' : this._getState('print_progress')));
    
    const fanRaw = this._liveData?.fan?.speed;
    const fan = isPreview ? '100' : (fanRaw !== undefined ? (fanRaw * 100).toFixed(0) : (this._getState('fan_speed') === '—' ? '0' : this._getState('fan_speed')));
    
    const speedRaw = this._liveData?.gcode_move?.speed_factor;
    const speed = isPreview ? '100' : (speedRaw !== undefined ? (speedRaw * 100).toFixed(0) : (this._getState('print_speed') === '—' ? '0' : this._getState('print_speed')));

    const currentFileStr = isPreview ? 'Awesome_Vase_Print.gcode' : (this._getState('current_file') !== '—' ? this._getState('current_file') : 'Idle');

    let camCaseUrl = "";
    let camUsbUrl = "";
    if (!isPreview) {
      const ipSafe = this._getIpSafe();
      const ip = this._getIpFromEntity();
      
      const camId = Object.keys(this.hass.states).find(id => id.startsWith('camera.') && id.includes(ipSafe));
      camCaseUrl = `http://${ip}:7125/webcam/stream.mjpg`; 
      if (camId) {
        const token = this.hass.states[camId].attributes?.access_token;
        camCaseUrl = token ? `/api/camera_proxy_stream/${camId}?token=${token}` : `/api/camera_proxy_stream/${camId}`;
      }
      camUsbUrl = `http://${ip}/webcam2/stream.mjpg`;
    }

    return html`
      <ha-card>
        <div class="header">
          <div class="title">${printerName}</div>
          <div style="color: var(--secondary-text-color); font-size: 14px; text-transform: capitalize;">${liveState}</div>
        </div>

        <div class="main-content">
          <div class="camera-feed" @click=${() => this._showCamera = !this._showCamera}>
            ${isPreview
              ? html`<div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#555;"><ha-icon icon="mdi:printer-3d" style="--mdc-icon-size: 48px; margin-bottom: 8px;"></ha-icon><div>Live View</div></div>`
              : html`
                  <!-- Strictly separated DOM elements to prevent MJPEG bleed over into Thumbnails -->
                  <img src="${camCaseUrl}" style="width: 100%; height: 100%; object-fit: contain; display: ${this._showCamera && this._cameraType === 'case' ? 'block' : 'none'};" />
                  <img src="${camUsbUrl}" style="width: 100%; height: 100%; object-fit: contain; display: ${this._showCamera && this._cameraType === 'usb' ? 'block' : 'none'};" />
                  
                  <div style="width: 100%; height: 100%; display: ${!this._showCamera ? 'flex' : 'none'}; flex-direction: column; justify-content: center; align-items: center;">
                    ${this._thumbnailUrl 
                      ? html`<img src="${this._thumbnailUrl}" style="width: 100%; height: 100%; object-fit: contain;" />` 
                      : html`<p style="color: #555; margin: 0;">No Thumbnail Available</p>`
                    }
                  </div>
                `
            }
          </div>
          <div class="stats-panel">
            <div class="stat-item interactive-stat" @click=${() => { if(!isPreview) { const t = prompt("Set Bed Temperature (°C):", "60"); if (t) this._sendGcode(`M140 S${t}`); }}}>
              <span class="stat-label">Bed</span>
              <span class="stat-value">${bedTemp}°C</span>
            </div>
            <div class="stat-item"><span class="stat-label">Layer</span><span class="stat-value">${layer}/${tLayers}</span></div>
            <div class="stat-item"><span class="stat-label">Speed</span><span class="stat-value">${speed}%</span></div>
            <div class="stat-item"><span class="stat-label">Fan</span><span class="stat-value">${fan}%</span></div>
            
            <!-- USB / CASE CAMERA TOGGLE -->
            <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
              <span class="stat-label" style="font-weight: bold; letter-spacing: 1px;">CAMERA</span>
              <label style="font-size: 11px; color: ${this._cameraType === 'case' ? 'var(--primary-color)' : 'var(--secondary-text-color)'}; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <input type="radio" name="haCamType" .checked=${this._cameraType === 'case'} @change=${() => this._cameraType = 'case'} style="margin:0; cursor: pointer;"> CASE
              </label>
              <label style="font-size: 11px; color: ${this._cameraType === 'usb' ? 'var(--primary-color)' : 'var(--secondary-text-color)'}; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <input type="radio" name="haCamType" .checked=${this._cameraType === 'usb'} @change=${() => this._cameraType = 'usb'} style="margin:0; cursor: pointer;"> USB
              </label>
            </div>
          </div>
        </div>

        <div class="progress-container">
          <div class="progress-label">
            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${currentFileStr}</span>
            <span>${prog}%</span>
          </div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${prog}%;"></div></div>
        </div>

        <div class="actions-row">
          <button class="btn" style="background:var(--secondary-background-color); color:var(--primary-text-color);" 
            ?disabled=${isPreview || (!isPaused && !isPrinting)}
            @click=${() => { this.hass.callService('button', 'press', {entity_id: this._getDerivedEntity(isPaused ? 'resume_print' : 'pause_print').entity_id}); this._showToast("Command Sent", isPaused ? "Resuming Print" : "Pausing Print"); }}>
            ${isPaused ? '▶ Resume' : 'II Pause'}
          </button>
          <button class="btn" style="background:#3a2325; color:#ff4f4f;" 
            ?disabled=${isPreview || (!isPaused && !isPrinting)}
            @click=${() => { if(confirm("Stop Print?")) { this.hass.callService('button', 'press', {entity_id: this._getDerivedEntity('stop_print').entity_id}); this._showToast("Command Sent", "Stopping Print", true); } }}>
            ⏹ Stop
          </button>
        </div>
      </ha-card>
    `;
  }
}
customElements.define("snapmaker-status-card", SnapmakerStatusCard);

// ==========================================
// 2. AMS / SPOOL CARD
// ==========================================
class SnapmakerSpoolCard extends SnapmakerBaseCard {
  static get properties() { return { ...super.properties, _selectedTool: { type: Number }, _customMaterials: { type: Array } }; }
  
  constructor() { 
    super(); 
    this._selectedTool = null;
    this._baseMaterials = ["PLA", "PLA Silk", "PETG", "TPU", "ABS", "ASA", "PC", "Nylon", "PVA", "HIPS"];
    const storedMats = localStorage.getItem('snapmaker_custom_mats');
    this._customMaterials = storedMats ? JSON.parse(storedMats) : [];
  }

  static get styles() {
    return css`
      ha-card { padding: 16px; position: relative; }
      .title { font-size: 16px; font-weight: 500; color: var(--primary-text-color); margin-bottom: 16px; }
      .spool-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      .spool-slot { background: var(--secondary-background-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer; transition: 0.2s; border: 1px solid var(--divider-color); }
      .spool-slot:hover { background: rgba(255,255,255,0.05); }
      .spool-index { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 8px; font-weight: bold; }
      .spool-color { width: 32px; height: 32px; border-radius: 50%; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3); margin-bottom: 8px; }
      .spool-type { font-size: 14px; font-weight: bold; color: var(--primary-text-color); text-transform: uppercase; }
      .spool-temp { font-size: 12px; color: var(--secondary-text-color); margin-top: 4px; padding: 4px 8px; border-radius: 4px; }
      
      .modal-overlay { position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.8); border-radius: var(--ha-card-border-radius, 12px); display: flex; justify-content: center; align-items: center; z-index: 10; }
      .modal-content { background: var(--card-background-color); padding: 20px; border-radius: 8px; width: 85%; border: 1px solid var(--divider-color); max-height: 90vh; overflow-y: auto; }
      .modal-title { font-size: 16px; color: var(--primary-text-color); margin-bottom: 16px; font-weight: bold; border-bottom: 1px solid var(--divider-color); padding-bottom: 8px; }
      .section-label { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 6px; margin-top: 12px; }
      .row { display: flex; gap: 8px; align-items: center; }
      .input-box { flex: 1; padding: 10px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; outline: none; }
      .btn { padding: 10px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; transition: 0.2s; }
      .btn:hover { opacity: 0.8; }
      .btn-cancel { background: var(--secondary-background-color); color: var(--primary-text-color); }
      .btn-save { background: var(--primary-color); color: var(--text-primary-color); }
      .btn-action { background: #2c313c; color: white; }
    `;
  }

  _runAttachMacro(ext) { this._sendGcode(ext === 0 ? "pick_extruder" : `pick_extruder${ext}`); }
  _runDetachMacro(ext) { this._sendGcode(ext === 0 ? "park_extruder" : `park_extruder${ext}`); }
  _runLoadMacro(ext) {
    const pickMacro = ext === 0 ? "pick_extruder" : `pick_extruder${ext}`;
    const toolName = ext === 0 ? "extruder" : `extruder${ext}`;
    this._sendGcode(`${pickMacro}\nACTIVATE_EXTRUDER EXTRUDER=${toolName}\nAUTO_FEEDING EXTRUDER=${ext} LOAD=1`);
  }
  _runUnloadMacro(ext) {
    const pickMacro = ext === 0 ? "pick_extruder" : `pick_extruder${ext}`;
    const toolName = ext === 0 ? "extruder" : `extruder${ext}`;
    this._sendGcode(`${pickMacro}\nACTIVATE_EXTRUDER EXTRUDER=${toolName}\nINNER_FILAMENT_UNLOAD`);
  }

  _handleAddCustomMaterial() {
    const newMat = prompt("Enter new custom material name (e.g., PLA-CF):");
    if (newMat && newMat.trim() !== "") {
      const cleanMat = newMat.trim().toUpperCase();
      if (!this._baseMaterials.includes(cleanMat) && !this._customMaterials.includes(cleanMat)) {
        this._customMaterials = [...this._customMaterials, cleanMat];
        localStorage.setItem('snapmaker_custom_mats', JSON.stringify(this._customMaterials));
      }
      setTimeout(() => {
        const selectBox = this.shadowRoot.getElementById('spool_mat_select');
        if (selectBox) selectBox.value = cleanMat;
      }, 50);
    } else {
      const selectBox = this.shadowRoot.getElementById('spool_mat_select');
      if (selectBox) selectBox.value = this._getState(`tool_${this._selectedTool + 1}_spool`);
    }
  }

  _saveSpool() {
    const matInput = this.shadowRoot.getElementById('spool_mat_select').value;
    const col = this.shadowRoot.getElementById('spool_col_input').value;
    this.hass.callService("snapmaker_u1", "edit_spool", {
      ip_address: this._getIpFromEntity(), tool: this._selectedTool, material: matInput, color: col
    });
    this._showToast("Spool Saved", `Saved settings for Tool ${this._selectedTool + 1}`);
    this._selectedTool = null;
  }

  render() {
    const isPreview = !this.config || !this.config.entity || !this.hass;
    const mockMats = ["PLA", "PETG", "TPU", "ABS"];
    const mockCols = ["#e91e63", "#00bcd4", "#ff9800", "#444444"];

    const allMaterials = [...this._baseMaterials, ...this._customMaterials];
    const currentMat = (this._selectedTool !== null && !isPreview) ? this._getState(`tool_${this._selectedTool + 1}_spool`) : "PLA";
    const extKeys = ['extruder', 'extruder1', 'extruder2', 'extruder3'];

    return html`
      <ha-card>
        <div class="title">Toolheads</div>
        <div class="spool-grid">
          ${[1, 2, 3, 4].map(i => {
            const mat = isPreview ? mockMats[i-1] : this._getState(`tool_${i}_spool`);
            const col = isPreview ? mockCols[i-1] : (this._getAttr(`tool_${i}_spool`, 'hex_color') || '#2c313c');
            
            let temp = "0.0";
            if (isPreview) {
               temp = i === 1 ? "200.0" : "0.0";
            } else {
               let tempRaw = this._liveData?.[extKeys[i-1]]?.temperature;
               temp = tempRaw !== undefined ? tempRaw.toFixed(1) : (this._getState(`tool_${i}_temp`) === '—' ? '0.0' : this._getState(`tool_${i}_temp`));
            }

            return html`
              <div class="spool-slot" @click=${() => { if(!isPreview) this._selectedTool = i-1; }}>
                <div class="spool-index">${i}</div>
                <div class="spool-color" style="background-color: ${mat === '—' || mat === 'NONE' ? '#2c313c' : col};"></div>
                <div class="spool-type">${mat === '—' ? 'NONE' : mat}</div>
                <div class="spool-temp">${temp}°C</div>
              </div>
            `;
          })}
        </div>

        ${this._selectedTool !== null && !isPreview ? html`
          <div class="modal-overlay">
            <div class="modal-content">
              <div class="modal-title">Settings: Tool ${this._selectedTool + 1}</div>
              
              <div class="row" style="margin-bottom: 16px;">
                <div style="flex:1;">
                  <div class="section-label" style="margin-top:0;">Set Temp (°C)</div>
                  <div class="row">
                    <input type="number" id="tool_temp_input" value="200" class="input-box">
                    <button class="btn btn-save" @click=${() => {
                      const t = this.shadowRoot.getElementById('tool_temp_input').value;
                      this._sendGcode(`M104 T${this._selectedTool} S${t}`);
                    }}>Heat</button>
                  </div>
                </div>
                <div style="flex:1;">
                  <div class="section-label" style="margin-top:0;">Toolhead</div>
                  <div class="row">
                    <button class="btn btn-action" style="flex:1;" @click=${() => this._runAttachMacro(this._selectedTool)}>Attach</button>
                    <button class="btn btn-action" style="flex:1;" @click=${() => this._runDetachMacro(this._selectedTool)}>Detach</button>
                  </div>
                </div>
              </div>

              <div class="section-label">Filament Actions</div>
              <div class="row" style="margin-bottom: 16px;">
                <button class="btn" style="flex:1; background:#1d3b25; color:#6bfc8b;" @click=${() => this._runLoadMacro(this._selectedTool)}>⬇ Load</button>
                <button class="btn" style="flex:1; background:#3a2325; color:#ff6b6b;" @click=${() => this._runUnloadMacro(this._selectedTool)}>⬆ Unload</button>
              </div>

              <hr style="border-color:var(--divider-color); opacity:0.3; margin:16px 0;">

              <div class="section-label">Material</div>
              <select id="spool_mat_select" class="input-box" style="width:100%;" @change=${(e) => { if(e.target.value === '__CUSTOM__') this._handleAddCustomMaterial(); }}>
                ${allMaterials.map(m => html`<option value="${m}" ?selected=${m === currentMat}>${m}</option>`)}
                ${!allMaterials.includes(currentMat) && currentMat !== '—' ? html`<option value="${currentMat}" selected>${currentMat}</option>` : ''}
                <option value="__CUSTOM__">➕ Add Custom Material...</option>
              </select>

              <div class="section-label">Color</div>
              <input type="color" id="spool_col_input" value="${this._getAttr(`tool_${this._selectedTool + 1}_spool`, 'hex_color') || '#ffffff'}" style="width:100%; height:40px; background:none; border:none; cursor:pointer;">

              <div class="row" style="justify-content: space-between; margin-top: 24px;">
                <button class="btn btn-cancel" @click=${() => this._selectedTool = null}>Cancel</button>
                <button class="btn btn-save" @click=${this._saveSpool}>Save Spool</button>
              </div>
            </div>
          </div>
        ` : ''}
      </ha-card>
    `;
  }
}
customElements.define("snapmaker-spool-card", SnapmakerSpoolCard);

// ==========================================
// 3. CONTROL PANEL CARD
// ==========================================
class SnapmakerControlCard extends SnapmakerBaseCard {
  static get properties() {
    return {
      ...super.properties,
      _activeTab: { type: String },
      _jogStep: { type: Number },
      _extrudeTool: { type: Number },
      _terminalHistory: { type: Array }
    };
  }

  constructor() {
    super();
    this._activeTab = 'move';
    this._jogStep = 10;
    this._extrudeTool = 0;
    this._terminalHistory = [];
    this._termInterval = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._termInterval = setInterval(() => this._fetchTerminal(), 2500);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._termInterval) clearInterval(this._termInterval);
  }

  async _fetchTerminal() {
    if (this._activeTab !== 'terminal' || !this.hass || !this.config || !this.config.entity) return;
    const ip = this._getIpFromEntity();
    try {
      const token = this.hass.auth?.data?.access_token || this.hass.connection?.options?.auth?.accessToken;
      if (!token) throw new Error("Auth token missing.");

      const res = await fetch(`/api/snapmaker_u1/terminal?ip=${ip}`, { headers: { "Authorization": `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Server returned ${res.status}.`);
      
      const data = await res.json();
      if (data && data.result && data.result.gcode_store) {
        const logs = data.result.gcode_store.map(item => item.message).filter(msg => msg !== 'ok');
        this._terminalHistory = logs.slice(-75); 
      } else {
        this._terminalHistory = [`Error: Unable to parse logs.`, JSON.stringify(data)];
      }
    } catch(e) {
      this._terminalHistory = [`❌ FAILED TO FETCH LOGS`, `Attempting IP: ${ip}`, `Error: ${e.message}`];
    }
    this.requestUpdate();
    setTimeout(() => {
      const termDiv = this.shadowRoot.getElementById('terminal-box');
      if (termDiv) termDiv.scrollTop = termDiv.scrollHeight;
    }, 50);
  }

  _colorizeTerminal(msg) {
    if (!msg) return html``;
    if (msg.startsWith('//')) return html`<div style="color: #00FFFF; margin-bottom:2px;">${msg}</div>`; 
    if (msg.startsWith('!!') || msg.includes('Error') || msg.includes('FAILED')) return html`<div style="color: #FF4F4F; margin-bottom:2px;">${msg}</div>`; 
    return html`<div style="color: #FFFFFF; margin-bottom:2px;">${msg}</div>`; 
  }

  static get styles() {
    return css`
      ha-card { padding: 16px; position: relative; }
      .tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--divider-color); padding-bottom: 8px; flex-wrap: wrap; }
      .tab { background: none; border: none; color: var(--secondary-text-color); font-size: 14px; font-weight: bold; cursor: pointer; padding: 6px 12px; border-radius: 4px; transition: 0.2s; }
      .tab.active { background: var(--secondary-background-color); color: var(--primary-text-color); }
      .tab:hover:not(.active) { color: var(--primary-text-color); }

      .grid-container { display: flex; gap: 16px; justify-content: center; align-items: center; flex-wrap: wrap; }
      .dpad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .zpad { display: flex; flex-direction: column; gap: 8px; }
      
      .btn { background: var(--secondary-background-color); color: var(--primary-text-color); border: none; border-radius: 6px; padding: 12px; font-size: 14px; font-weight: bold; cursor: pointer; transition: 0.2s; }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn:hover:not(:disabled) { filter: brightness(1.2); }
      .btn-primary { background: var(--primary-color); color: var(--text-primary-color); }

      .step-row { display: flex; gap: 8px; justify-content: center; margin-bottom: 16px; }
      .step-btn { flex: 1; padding: 8px; background: var(--secondary-background-color); border: none; border-radius: 4px; color: var(--primary-text-color); cursor: pointer; font-weight: bold; }
      .step-btn.active { background: var(--primary-color); color: var(--text-primary-color); }

      .terminal-row { display: flex; gap: 8px; margin-top: 16px; border-top: 1px solid var(--divider-color); padding-top: 16px; }
      input { flex: 1; padding: 10px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); outline: none; }
      
      .tune-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
      .tune-label { font-size: 14px; font-weight: 500; color: var(--primary-text-color); }

      .term-box { background: #0f1115; color: #fff; font-family: monospace; height: 220px; overflow-y: auto; padding: 12px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; word-break: break-all; border: 1px solid var(--divider-color); }
    `;
  }

  _jog(axis, direction) {
    const dist = direction * this._jogStep;
    const feedrate = (axis === 'Z') ? 600 : 6000;
    this._sendGcode(`SAVE_GCODE_STATE NAME=_ui_movement\nG91\nG1 ${axis}${dist} F${feedrate}\nRESTORE_GCODE_STATE NAME=_ui_movement`);
  }

  _extrude(distance) {
    this._sendGcode(`T${this._extrudeTool}\nM83\nG1 E${distance} F300\nM82`);
  }

  _submitTerminal() {
    const i = this.shadowRoot.getElementById('gcode');
    if (i && i.value) {
      this._sendGcode(i.value);
      this._terminalHistory = [...this._terminalHistory, `> ${i.value}`];
      i.value = '';
      setTimeout(() => {
        const termDiv = this.shadowRoot.getElementById('terminal-box');
        if (termDiv) termDiv.scrollTop = termDiv.scrollHeight;
      }, 50);
    }
  }

  render() {
    const isPreview = !this.config || !this.config.entity || !this.hass;

    return html`
      <ha-card>
        <div class="tabs">
          <button class="tab ${this._activeTab === 'move' ? 'active' : ''}" @click=${() => this._activeTab = 'move'}>Move</button>
          <button class="tab ${this._activeTab === 'extrude' ? 'active' : ''}" @click=${() => this._activeTab = 'extrude'}>Extrude</button>
          <button class="tab ${this._activeTab === 'tune' ? 'active' : ''}" @click=${() => this._activeTab = 'tune'}>Tune</button>
          <button class="tab ${this._activeTab === 'terminal' ? 'active' : ''}" @click=${() => { this._activeTab = 'terminal'; if(!isPreview) this._fetchTerminal(); }}>Terminal</button>
          <button class="tab ${this._activeTab === 'fwconfig' ? 'active' : ''}" @click=${() => this._activeTab = 'fwconfig'}>FW Config</button>
        </div>

        ${this._activeTab === 'move' ? html`
          <div class="step-row">
            <button class="step-btn ${this._jogStep === 0.1 ? 'active' : ''}" @click=${() => this._jogStep = 0.1}>0.1</button>
            <button class="step-btn ${this._jogStep === 1 ? 'active' : ''}" @click=${() => this._jogStep = 1}>1</button>
            <button class="step-btn ${this._jogStep === 10 ? 'active' : ''}" @click=${() => this._jogStep = 10}>10</button>
            <button class="step-btn ${this._jogStep === 50 ? 'active' : ''}" @click=${() => this._jogStep = 50}>50</button>
          </div>
          <div class="grid-container">
            <div class="dpad">
              <div></div><button class="btn" ?disabled=${isPreview} @click=${() => this._jog('Y', 1)}>Y+</button><div></div>
              <button class="btn" ?disabled=${isPreview} @click=${() => this._jog('X', -1)}>X-</button>
              <button class="btn" ?disabled=${isPreview} @click=${() => this._sendGcode('G28')} title="Home All"><ha-icon icon="mdi:home"></ha-icon></button>
              <button class="btn" ?disabled=${isPreview} @click=${() => this._jog('X', 1)}>X+</button>
              <div></div><button class="btn" ?disabled=${isPreview} @click=${() => this._jog('Y', -1)}>Y-</button><div></div>
            </div>
            <div class="zpad">
              <button class="btn" ?disabled=${isPreview} @click=${() => this._jog('Z', 1)}>Z+</button>
              <button class="btn" ?disabled=${isPreview} @click=${() => this._sendGcode('G28 Z')} title="Home Z"><ha-icon icon="mdi:home"></ha-icon> Z</button>
              <button class="btn" ?disabled=${isPreview} @click=${() => this._jog('Z', -1)}>Z-</button>
            </div>
          </div>
        ` : ''}

        ${this._activeTab === 'extrude' ? html`
          <div style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px;">Select Target Extruder:</div>
          <div class="step-row">
            <button class="step-btn ${this._extrudeTool === 0 ? 'active' : ''}" @click=${() => this._extrudeTool = 0}>1</button>
            <button class="step-btn ${this._extrudeTool === 1 ? 'active' : ''}" @click=${() => this._extrudeTool = 1}>2</button>
            <button class="step-btn ${this._extrudeTool === 2 ? 'active' : ''}" @click=${() => this._extrudeTool = 2}>3</button>
            <button class="step-btn ${this._extrudeTool === 3 ? 'active' : ''}" @click=${() => this._extrudeTool = 3}>4</button>
          </div>
          <div style="display: flex; gap: 16px; margin-top: 16px;">
            <button class="btn" style="flex:1; background:#1d3b25; color:#6bfc8b;" ?disabled=${isPreview} @click=${() => this._extrude(20)}>⬇ Extrude</button>
            <button class="btn" style="flex:1; background:#3a2325; color:#ff6b6b;" ?disabled=${isPreview} @click=${() => this._extrude(-20)}>⬆ Retract</button>
          </div>
        ` : ''}

        ${this._activeTab === 'tune' ? html`
          <div style="display: flex; flex-direction: column;">
            <div class="tune-row">
              <span class="tune-label">Z-Offset (Babystep)</span>
              <div style="display: flex; gap: 8px;">
                <button class="btn" style="padding: 8px 12px;" ?disabled=${isPreview} @click=${() => this._sendGcode('SET_GCODE_OFFSET Z_ADJUST=0.01 MOVE=1')}>+0.01</button>
                <button class="btn" style="padding: 8px 12px;" ?disabled=${isPreview} @click=${() => this._sendGcode('SET_GCODE_OFFSET Z_ADJUST=-0.01 MOVE=1')}>-0.01</button>
              </div>
            </div>
            <div class="tune-row">
              <span class="tune-label">Print Speed Override</span>
              <div style="display: flex; gap: 8px;">
                <button class="btn" style="padding: 8px 12px;" ?disabled=${isPreview} @click=${() => this._sendGcode('M220 S50')}>50%</button>
                <button class="btn" style="padding: 8px 12px;" ?disabled=${isPreview} @click=${() => this._sendGcode('M220 S100')}>100%</button>
                <button class="btn" style="padding: 8px 12px;" ?disabled=${isPreview} @click=${() => this._sendGcode('M220 S150')}>150%</button>
              </div>
            </div>
          </div>
        ` : ''}

        ${this._activeTab === 'terminal' ? html`
          <div id="terminal-box" class="term-box">
            ${isPreview ? html`<div style="color:#00FFFF;">// Connected to Snapmaker API Proxy</div><div style="color:#00FFFF;">// Waiting for terminal stream...</div>` : ''}
            ${this._terminalHistory.map(line => this._colorizeTerminal(line))}
            ${this._terminalHistory.length === 0 && !isPreview ? html`<div style="color:#555;">Waiting for logs...</div>` : ''}
          </div>
          
          <div class="terminal-row">
            <input type="text" id="gcode" placeholder="Send command..." ?disabled=${isPreview} @keydown=${e => { if(e.key === 'Enter') this._submitTerminal(); }}>
            <button class="btn btn-primary" ?disabled=${isPreview} @click=${this._submitTerminal}>Send</button>
          </div>
        ` : ''}

        ${this._activeTab === 'fwconfig' ? html`
          <div style="height: 280px; width: 100%; border-radius: 6px; overflow: hidden; border: 1px solid var(--divider-color); background: var(--secondary-background-color);">
            ${isPreview 
              ? html`<div style="display:flex; height:100%; justify-content:center; align-items:center; color:var(--secondary-text-color);">[Firmware Config Preveiw]</div>`
              : html`<iframe src="http://${this._getIpFromEntity()}/firmware-config/" style="width: 100%; height: 100%; border: none;"></iframe>`
            }
          </div>
        ` : ''}

      </ha-card>
    `;
  }
}
customElements.define("snapmaker-control-card", SnapmakerControlCard);

// ==========================================
// 4. STORAGE & LAUNCH CARD
// ==========================================
class SnapmakerStorageCard extends SnapmakerBaseCard {
  static get properties() { 
    return { 
      ...super.properties, 
      _showModal: { type: Boolean },
      _modalMode: { type: String },
      _selectedFilename: { type: String },
      _pendingFileObj: { type: Object },
      _bedLeveling: { type: Boolean }, _timelapse: { type: Boolean }, _multiColor: { type: Boolean },
      _t0: { type: Number }, _t1: { type: Number }, _t2: { type: Number }, _t3: { type: Number }
    }; 
  }
  
  constructor() { 
    super(); 
    this._showModal = false;
    this._selectedFilename = null;
    this._bedLeveling = true; this._timelapse = false; this._multiColor = false;
    this._t0 = 0; this._t1 = 1; this._t2 = 2; this._t3 = 3;
  }

  static get styles() {
    return css`
      ha-card { padding: 16px; position: relative; }
      .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .title { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
      .refresh-btn { background: none; border: none; color: var(--primary-color); cursor: pointer; display: flex; align-items: center; gap: 4px; }
      .upload-btn { width: 100%; padding: 12px; background: #1f2b23; border: 1px solid #2d4734; color: #84e296; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; margin-bottom: 12px; transition: 0.2s; }
      .upload-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      
      .file-list { max-height: 250px; overflow-y: auto; background: var(--secondary-background-color); border-radius: 6px; }
      .file-item { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--divider-color); cursor: pointer; transition: 0.1s; }
      .file-item:hover { background: rgba(255,255,255,0.05); }
      .file-item.selected { background: var(--primary-color); }
      .file-item.selected .file-name, .file-item.selected .file-size { color: var(--text-primary-color); }
      
      .file-name { font-size: 13px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
      .file-size { font-size: 12px; color: var(--secondary-text-color); }
      
      .modal-overlay { position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.8); border-radius: var(--ha-card-border-radius, 12px); display: flex; justify-content: center; align-items: center; z-index: 10; }
      .modal-content { background: var(--card-background-color); padding: 20px; border-radius: 8px; width: 85%; border: 1px solid var(--divider-color); }
      .modal-title { font-size: 14px; color: var(--primary-text-color); margin-bottom: 16px; word-break: break-all; font-weight: bold; }
      .modal-actions { display: flex; justify-content: space-between; margin-top: 20px; }
      .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; transition: 0.2s;}
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-cancel { background: var(--secondary-background-color); color: var(--primary-text-color); }
      .btn-launch { background: var(--primary-color); color: var(--text-primary-color); }
      
      .grid-2x2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
      .map-select { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; outline: none; font-size: 12px; }
    `;
  }

  _triggerFileUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gcode';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this._pendingFileObj = file;
      this._selectedFilename = file.name;
      this._modalMode = 'upload';
      this._showModal = true;
    };
    input.click();
  }

  _selectFile(filename) {
    this._selectedFilename = filename;
  }

  _deleteFile() {
    if (!this._selectedFilename) return;
    if (confirm(`Permanently delete ${this._selectedFilename}?`)) {
      this.hass.callService("snapmaker_u1", "delete_file", {
        ip_address: this._getIpFromEntity(),
        filename: this._selectedFilename
      });
      this._showToast("File Deleted", `${this._selectedFilename} removed.`);
      this._selectedFilename = null;
    }
  }

  async _launchJob() {
    this._showModal = false;

    if (this._modalMode === 'internal') {
      this._showToast("Starting Print", `Launching ${this._selectedFilename}...`);
      this.hass.callService("snapmaker_u1", "start_print_job", {
        ip_address: this._getIpFromEntity(), filename: this._selectedFilename,
        bed_leveling: this._bedLeveling, timelapse: this._timelapse, multicolor: this._multiColor,
        t0_map: this._t0, t1_map: this._t1, t2_map: this._t2, t3_map: this._t3,
        is_upload_flow: false
      });
    } else if (this._modalMode === 'upload' && this._pendingFileObj) {
      this._showToast("Uploading...", `Sending ${this._pendingFileObj.name} to printer...`);
      const formData = new FormData();
      formData.append("ip", this._getIpFromEntity());
      formData.append("t0_map", this._t0);
      formData.append("file", this._pendingFileObj);
      try {
        const token = this.hass.auth?.data?.access_token || this.hass.connection?.options?.auth?.accessToken;
        const response = await fetch("/api/snapmaker_u1/upload", { 
          method: "POST", body: formData, headers: { "Authorization": `Bearer ${token}` } 
        });
        const result = await response.json();
        if (result && result.item) {
          this._showToast("Upload Complete", "Starting print job...");
          this.hass.callService("snapmaker_u1", "start_print_job", {
            ip_address: this._getIpFromEntity(), filename: result.item.path,
            bed_leveling: this._bedLeveling, timelapse: this._timelapse, multicolor: this._multiColor,
            t0_map: this._t0, t1_map: this._t1, t2_map: this._t2, t3_map: this._t3,
            is_upload_flow: true
          });
        } else {
          this._showToast("Upload Failed", "Printer rejected the file.", true);
        }
      } catch (error) { 
        this._showToast("Upload Error", error.message, true); 
      }
    }
    this._pendingFileObj = null;
    this._selectedFilename = null;
  }

  render() {
    const isPreview = !this.config || !this.config.entity || !this.hass;

    const fileList = isPreview ? [
      {path: "OrcaCube_PLA_31m55s.gcode", size: 3565158},
      {path: "Benchy_DualColor.gcode", size: 8452104},
      {path: "Gantry_Bracket.gcode", size: 12045000}
    ] : (this._getAttr('gcode_file_list', 'file_list') || []);
    
    const mat1 = this._getState('tool_1_spool'); const mat2 = this._getState('tool_2_spool');
    const mat3 = this._getState('tool_3_spool'); const mat4 = this._getState('tool_4_spool');

    return html`
      <ha-card>
        <div class="header">
          <div class="title">Internal Storage</div>
          <div style="display:flex; gap:8px;">
            <button class="btn" style="background:#3a2325; color:#ff4f4f; padding:6px 12px; font-size:12px;" @click=${this._deleteFile} ?disabled=${!this._selectedFilename || this._modalMode === 'upload' || isPreview}>Delete</button>
            <button class="btn" style="padding:6px 12px; font-size:12px;" @click=${() => this.hass.callService('homeassistant', 'update_entity', { entity_id: this._getDerivedEntity('gcode_file_list').entity_id })} ?disabled=${isPreview}><ha-icon icon="mdi:refresh" style="--mdc-icon-size: 14px;"></ha-icon></button>
            <button class="btn" style="background:#1d3b25; color:#6bfc8b; padding:6px 12px; font-size:12px;" @click=${() => { this._modalMode = 'internal'; this._showModal = true; }} ?disabled=${!this._selectedFilename || this._modalMode === 'upload' || isPreview}>▶ Launch</button>
          </div>
        </div>

        <button class="upload-btn" @click=${this._triggerFileUpload} ?disabled=${isPreview}>📤 Upload & Print from PC</button>

        <div class="file-list">
          ${fileList.length === 0 ? html`<div style="padding: 12px; text-align: center; color: var(--secondary-text-color);">No files found.</div>` : ''}
          ${fileList.map(f => html`
            <div class="file-item ${this._selectedFilename === f.path ? 'selected' : ''}" @click=${() => this._selectFile(f.path)}>
              <div class="file-name" title="${f.path}">${f.path}</div>
              <div class="file-size">${(f.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
          `)}
        </div>

        ${this._showModal && !isPreview ? html`
          <div class="modal-overlay">
            <div class="modal-content">
              <div class="modal-title">Print Options: <br><span style="font-weight:normal; font-size:12px;">${this._selectedFilename}</span></div>
              
              <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:14px; color:var(--primary-text-color);">
                  <input type="checkbox" .checked=${this._bedLeveling} @change=${e => this._bedLeveling = e.target.checked}> Auto Bed Leveling
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:14px; color:var(--primary-text-color);">
                  <input type="checkbox" .checked=${this._timelapse} @change=${e => this._timelapse = e.target.checked}> Record Timelapse
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:14px; color:var(--primary-text-color);">
                  <input type="checkbox" .checked=${this._multiColor} @change=${e => this._multiColor = e.target.checked}> Multicolor Print
                </label>
              </div>

              <div style="font-size:12px; color:var(--secondary-text-color); margin-bottom:8px;">Toolhead Mapping:</div>
              <div class="grid-2x2">
                <div>
                  <div style="font-size:11px; margin-bottom:2px;">Map T0 (Main) To:</div>
                  <select class="map-select" @change=${e => this._t0 = Number(e.target.value)}>
                    <option value="0" selected>Tool 1 (${mat1})</option>
                    <option value="1">Tool 2 (${mat2})</option>
                    <option value="2">Tool 3 (${mat3})</option>
                    <option value="3">Tool 4 (${mat4})</option>
                  </select>
                </div>
                ${this._multiColor ? html`
                  <div>
                    <div style="font-size:11px; margin-bottom:2px;">Map T1 To:</div>
                    <select class="map-select" @change=${e => this._t1 = Number(e.target.value)}>
                      <option value="0">Tool 1 (${mat1})</option>
                      <option value="1" selected>Tool 2 (${mat2})</option>
                      <option value="2">Tool 3 (${mat3})</option>
                      <option value="3">Tool 4 (${mat4})</option>
                    </select>
                  </div>
                  <div>
                    <div style="font-size:11px; margin-bottom:2px;">Map T2 To:</div>
                    <select class="map-select" @change=${e => this._t2 = Number(e.target.value)}>
                      <option value="0">Tool 1 (${mat1})</option>
                      <option value="1">Tool 2 (${mat2})</option>
                      <option value="2" selected>Tool 3 (${mat3})</option>
                      <option value="3">Tool 4 (${mat4})</option>
                    </select>
                  </div>
                  <div>
                    <div style="font-size:11px; margin-bottom:2px;">Map T3 To:</div>
                    <select class="map-select" @change=${e => this._t3 = Number(e.target.value)}>
                      <option value="0">Tool 1 (${mat1})</option>
                      <option value="1">Tool 2 (${mat2})</option>
                      <option value="2">Tool 3 (${mat3})</option>
                      <option value="3" selected>Tool 4 (${mat4})</option>
                    </select>
                  </div>
                ` : ''}
              </div>

              <div class="modal-actions">
                <button class="btn btn-cancel" @click=${() => this._showModal = false}>Cancel</button>
                <button class="btn btn-launch" @click=${this._launchJob}>Launch Print</button>
              </div>
            </div>
          </div>
        ` : ''}
      </ha-card>
    `;
  }
}
customElements.define("snapmaker-storage-card", SnapmakerStorageCard);

window.customCards = window.customCards || [];
window.customCards.push(
  { type: "snapmaker-status-card", name: "Snapmaker: Status", description: "Live camera, temperatures, and print progress.", preview: true },
  { type: "snapmaker-spool-card", name: "Snapmaker: Spools", description: "AMS style filament management.", preview: true },
  { type: "snapmaker-control-card", name: "Snapmaker: Controls", description: "Jogging, Extruder, Tuning, and Terminal.", preview: true },
  { type: "snapmaker-storage-card", name: "Snapmaker: Storage", description: "Internal G-Code files and print launcher.", preview: true }
);
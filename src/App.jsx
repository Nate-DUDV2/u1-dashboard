import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  // --- CORE STATES ---
  const [printerIp, setPrinterIp] = useState('');
  const [savedPrinters, setSavedPrinters] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // --- LIVE PRINTER DATA STATES ---
  const [bedTemp, setBedTemp] = useState({ current: 0, target: 0 });
  const [toolTemps, setToolTemps] = useState([
    { current: 0, target: 0 }, { current: 0, target: 0 },
    { current: 0, target: 0 }, { current: 0, target: 0 }
  ]);
  const [printStats, setPrintStats] = useState({ layer: 0, totalLayers: 0, speed: 100, fan: 0 });
  const [filename, setFilename] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraType, setCameraType] = useState('case'); // 'case' or 'usb'

  // --- BOTTOM DASHBOARD STATES ---
  const [spools, setSpools] = useState([{ vendor: '', type: '', color: 'FFFFFF' }, { vendor: '', type: '', color: 'FFFFFF' }, { vendor: '', type: '', color: 'FFFFFF' }, { vendor: '', type: '', color: 'FFFFFF' }]);
  const [jobInfo, setJobInfo] = useState({ state: '', progress: 0, elapsed: 0, remaining: 0, filament: 0 });
  const [fileList, setFileList] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  // --- MODAL STATES ---
  const [activeMenuSlot, setActiveMenuSlot] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ index: 0, vendor: '', type: '', colorHex: '' });
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printActionType, setPrintActionType] = useState(null);
  const [pendingUploadFile, setPendingUploadFile] = useState(null);
  const fileInputRef = useRef(null);
  const [printConfig, setPrintConfig] = useState({ bedLeveling: false, timelapse: false, isMultiColor: false, t0Map: 0, t1Map: 1, t2Map: 2, t3Map: 3 });

  // --- CONTROL PANEL STATES ---
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [cpTab, setCpTab] = useState('Control');
  const [activeTool, setActiveTool] = useState(0);
  const [selectedTool, setSelectedTool] = useState(0);
  const [jogStep, setJogStep] = useState(10);
  const [ledOn, setLedOn] = useState(false);
  const [termLogs, setTermLogs] = useState('');
  const [termInput, setTermInput] = useState('');
  const [historyStats, setHistoryStats] = useState({ hrs: 0, fil: 0, jobs: 0, success: 0 });
  const termEndRef = useRef(null);

  const menuRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setActiveMenuSlot(null); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    try {
      const rawPrinters = localStorage.getItem('printers');
      const loadedPrinters = rawPrinters ? JSON.parse(rawPrinters) : [];
      setSavedPrinters(Array.isArray(loadedPrinters) ? loadedPrinters : []);
    } catch (e) {
      setSavedPrinters([]); localStorage.setItem('printers', JSON.stringify([]));
    }
    setPrinterIp(localStorage.getItem('lastIp') || '');
  }, []);

  const fetchFiles = async () => {
    if (!printerIp || !isConnected) return;
    try {
      const res = await fetch(`http://${printerIp}:7125/server/files/list?root=gcodes`);
      const data = await res.json();
      if (data.result && Array.isArray(data.result)) setFileList(data.result.sort((a, b) => (b.modified || 0) - (a.modified || 0)));
    } catch (err) {}
  };

  // --- MAIN POLLING LOOP ---
  useEffect(() => {
    let pollTimer;
    const fetchPrinterData = async () => {
      try {
        const res = await fetch(`http://${printerIp}:7125/printer/objects/query?print_stats&toolhead&extruder&extruder1&extruder2&extruder3&heater_bed&fan&gcode_move&display_status&print_task_config&virtual_sdcard`);
        if (!res.ok) throw new Error("Offline");
        const data = await res.json();
        const status = data?.result?.status;

        if (status) {
          setBedTemp({ current: Number(status.heater_bed?.temperature || 0), target: Number(status.heater_bed?.target || 0) });
          setToolTemps([
            { current: Number(status.extruder?.temperature || 0), target: Number(status.extruder?.target || 0) },
            { current: Number(status.extruder1?.temperature || 0), target: Number(status.extruder1?.target || 0) },
            { current: Number(status.extruder2?.temperature || 0), target: Number(status.extruder2?.target || 0) },
            { current: Number(status.extruder3?.temperature || 0), target: Number(status.extruder3?.target || 0) }
          ]);
          setPrintStats({ 
            layer: Number(status.print_stats?.info?.current_layer || 0), totalLayers: Number(status.print_stats?.info?.total_layer || 0), 
            speed: Number((status.gcode_move?.speed_factor || 1) * 100), fan: Number((status.fan?.speed || 0) * 100) 
          });
          setFilename(status.print_stats?.filename || '');

          const duration = Number(status.print_stats?.print_duration || 0);
          const prog = Number(status.display_status?.progress || 0);
          const fileProg = Number(status.virtual_sdcard?.progress || prog);
          setJobInfo({
            state: status.print_stats?.state || '', progress: prog * 100, elapsed: duration,
            remaining: (fileProg > 0 && fileProg < 1) ? (duration / fileProg) - duration : 0,
            filament: Number(status.print_stats?.filament_used || 0) / 1000
          });

          const config = status.print_task_config;
          if (config && config.filament_color_rgba && config.filament_type) {
            setSpools([0,1,2,3].map(i => {
              const rawColor = String(config.filament_color_rgba[i] || 'FFFFFF');
              return { vendor: config.filament_vendor?.[i] || 'Snapmaker', type: String(config.filament_type[i] || '---'), color: rawColor.length >= 6 ? rawColor.substring(0, 6) : 'FFFFFF' };
            }));
          }

          const tHeadName = status.toolhead?.extruder || "extruder";
          setActiveTool(tHeadName === "extruder" ? 0 : parseInt(tHeadName.replace("extruder", "")));
        }
      } catch (err) {}
    };

    if (isConnected && printerIp) { fetchPrinterData(); fetchFiles(); pollTimer = setInterval(fetchPrinterData, 2000); }
    return () => clearInterval(pollTimer);
  }, [isConnected, printerIp]);

  // --- TERMINAL POLLING ---
  useEffect(() => {
    let termTimer;
    let lastTime = 0;
    const fetchTerminal = async () => {
      try {
        const res = await fetch(`http://${printerIp}:7125/server/gcode_store`);
        const data = await res.json();
        const logs = data.result?.gcode_store || [];
        let newLogs = '';
        logs.forEach(log => {
          if (log.time > lastTime) {
            if (log.message !== "ok") newLogs += `${log.message}\n`;
            lastTime = log.time;
          }
        });
        if (newLogs) setTermLogs(prev => prev + newLogs);
      } catch (e) {}
    };

    if (isConnected && showControlPanel && cpTab === 'Terminal') {
      fetchTerminal(); termTimer = setInterval(fetchTerminal, 1500);
    }
    return () => clearInterval(termTimer);
  }, [isConnected, showControlPanel, cpTab, printerIp]);

  useEffect(() => { if (termEndRef.current) termEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [termLogs, showControlPanel]);

  // --- HISTORY FETCHER ---
  const fetchHistory = async () => {
    if (!printerIp) return;
    try {
      const res = await fetch(`http://${printerIp}:7125/server/history/list`);
      const data = await res.json();
      const jobs = data.result?.jobs || [];
      let tTime = 0, tFil = 0, comp = 0;
      jobs.forEach(j => {
        tTime += Number(j.print_duration || 0);
        tFil += Number(j.filament_used || 0);
        if (j.status === 'completed' || j.status === 'success') comp++;
      });
      setHistoryStats({ hrs: tTime / 3600, fil: tFil / 1000, jobs: jobs.length, success: jobs.length ? (comp / jobs.length) * 100 : 0 });
    } catch (e) {}
  };

  useEffect(() => {
    const getThumb = async () => {
      if (!filename || !printerIp) return setThumbnailUrl('');
      try {
        const res = await fetch(`http://${printerIp}:7125/server/files/metadata?filename=${encodeURIComponent(filename)}`);
        const data = await res.json();
        const thumbs = data.result?.thumbnails;
        if (thumbs && thumbs.length > 0) {
          const path = thumbs[thumbs.length - 1].relative_path.split('/').map(encodeURIComponent).join('/');
          setThumbnailUrl(`http://${printerIp}:7125/server/files/gcodes/${path}`);
        } else setThumbnailUrl('');
      } catch (err) {}
    };
    getThumb();
  }, [filename, printerIp]);

  const formatTime = (s) => { const h = Math.floor((s || 0) / 3600); const m = Math.floor(((s || 0) % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };
  const formatSize = (b) => (Number(b || 0) / 1024 / 1024).toFixed(2) + ' MB';
  const formatDate = (u) => u ? new Date(u * 1000).toLocaleString() : 'Unknown';

  const sendGcode = async (gcode) => { if (printerIp) fetch(`http://${printerIp}:7125/printer/gcode/script?script=${encodeURIComponent(gcode)}`, { method: 'POST' }).catch(console.error); };
  const postApi = async (endpoint) => { if (printerIp) fetch(`http://${printerIp}:7125${endpoint}`, { method: 'POST' }).catch(console.error); };

  // --- ACTIONS ---
  const handleAfcAction = (index, action) => {
    setActiveMenuSlot(null);
    const pickMacro = index === 0 ? "pick_extruder" : `pick_extruder${index}`;
    const toolName = index === 0 ? "extruder" : `extruder${index}`;
    if (action === 'load') { sendGcode(`${pickMacro}\nACTIVATE_EXTRUDER EXTRUDER=${toolName}\nAUTO_FEEDING EXTRUDER=${index} LOAD=1`); } 
    else if (action === 'unload') { sendGcode(`${pickMacro}\nACTIVATE_EXTRUDER EXTRUDER=${toolName}\nINNER_FILAMENT_UNLOAD`); } 
    else if (action === 'edit') { setEditForm({ index: index, vendor: spools[index].vendor, type: spools[index].type, colorHex: spools[index].color }); setShowEditModal(true); }
  };

  const handleSaveSpool = async () => {
    const rawDecimal = parseInt(editForm.colorHex.replace('#', ''), 16) || 16777215;
    const payload = { channel: editForm.index, info: { VENDOR: editForm.vendor, MAIN_TYPE: editForm.type, RGB_1: rawDecimal, ALPHA: 255 } };
    try {
      const res = await fetch(`http://${printerIp}:7125/printer/filament_detect/set`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) setShowEditModal(false); else alert("Firmware rejected the save.");
    } catch (err) {}
  };

  const handleLaunchStoredClick = () => {
    if (!selectedFile) return alert("Select a file from Internal Storage first!");
    setPrintActionType('launch');
    setShowPrintModal(true);
  };

  const triggerFileSelect = () => {
    if(!isConnected) return alert("Please connect to the printer first.");
    fileInputRef.current.click();
  };

  const executePrintJob = async () => {
    setShowPrintModal(false);
    const mapArray = new Array(32).fill(0);
    mapArray[0] = parseInt(printConfig.t0Map || 0);
    if (printConfig.isMultiColor) { mapArray[1] = parseInt(printConfig.t1Map || 1); mapArray[2] = parseInt(printConfig.t2Map || 2); mapArray[3] = parseInt(printConfig.t3Map || 3); } 
    else { mapArray[1] = 1; mapArray[2] = 2; mapArray[3] = 3; }

    try {
      let targetFilename = "";
      if (printActionType === 'upload' && pendingUploadFile) {
        alert("Preparing File... Uploading to storage.");
        const text = await pendingUploadFile.text();
        let modifiedGcode = mapArray[0] !== 0 ? text.replace(/\bT0\b/g, `T${mapArray[0]}`) : text;
        const newBlob = new Blob([modifiedGcode], { type: 'text/plain' });
        const formData = new FormData();
        formData.append("file", newBlob, pendingUploadFile.name);
        formData.append("print", "false");
        await fetch(`http://${printerIp}:7125/server/files/upload`, { method: 'POST', body: formData });
        targetFilename = pendingUploadFile.name;
        fetchFiles();
      } else { targetFilename = selectedFile; }

      await sendGcode(`SET_GCODE_VARIABLE MACRO=print_task_config VARIABLE=auto_bed_leveling VALUE=${printConfig.bedLeveling ? "True" : "False"}`);
      await sendGcode(`SET_GCODE_VARIABLE MACRO=print_task_config VARIABLE=time_lapse_camera VALUE=${printConfig.timelapse ? "True" : "False"}`);
      await sendGcode(`SET_GCODE_VARIABLE MACRO=print_task_config VARIABLE=extruder_map_table VALUE="[${mapArray.join(',')}]"`);

      const snapConfig = { auto_bed_leveling: printConfig.bedLeveling, time_lapse_camera: printConfig.timelapse, flow_calibrate: false, extruder_map_table: mapArray, extruders_used: [true, true, true, true] };
      const configForm = new FormData();
      configForm.append("file", new Blob([JSON.stringify(snapConfig)], { type: 'application/json' }), "print_task.json");
      configForm.append("root", "config");
      await fetch(`http://${printerIp}:7125/server/files/upload`, { method: 'POST', body: configForm });

      setTimeout(() => { postApi(`/printer/print/start?filename=${encodeURIComponent(targetFilename)}`); }, 500);
    } catch (err) { alert(`Error: ${err.message}`); }
  };

  const handleJog = (axis, dist) => { sendGcode(`SAVE_GCODE_STATE NAME=_ui_move\nG91\nG1 ${axis}${dist} F${axis==='Z'?600:6000}\nRESTORE_GCODE_STATE NAME=_ui_move`); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '20px', boxSizing: 'border-box' }}>
      
      <input type="file" accept=".gcode,.bgcode" style={{ display: 'none' }} ref={fileInputRef} onChange={(e) => { if(e.target.files[0]) { setPendingUploadFile(e.target.files[0]); setPrintActionType('upload'); setShowPrintModal(true); e.target.value = null; } }} />

      {/* HEADER WITH CORRECTED LOCAL LOGO PATH */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
        
        {/* Left Side: Custom Logo Container using dot relative path */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src="./logo.png" alt="Custom Logo" style={{ height: '55px', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input type="text" value={printerIp} onChange={(e) => setPrinterIp(e.target.value)} onFocus={() => setIsDropdownOpen(true)} onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)} disabled={isConnected} placeholder="Enter Printer IP..." style={{ width: '250px', paddingRight: '30px' }} />
            <button disabled={isConnected} onClick={() => setIsDropdownOpen(!isDropdownOpen)} style={{ position: 'absolute', right: '2px', background: 'transparent', border: 'none', color: '#888', padding: '4px 8px' }}>▼</button>
            {isDropdownOpen && savedPrinters.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#2c313c', border: '1px solid #444', borderRadius: '4px', marginTop: '4px', zIndex: 10 }}>
                {savedPrinters.map((ip, idx) => <div key={idx} onClick={() => { setPrinterIp(ip); setIsDropdownOpen(false); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: idx < savedPrinters.length - 1 ? '1px solid #333' : 'none' }}>{ip}</div>)}
              </div>
            )}
          </div>
          <button onClick={() => { if(!printerIp) return; if(!savedPrinters.includes(printerIp)) { const newList = [...savedPrinters, printerIp]; setSavedPrinters(newList); localStorage.setItem('printers', JSON.stringify(newList)); }}} disabled={isConnected} style={{ padding: '8px 12px', backgroundColor: '#1e2836', borderColor: '#2d3b55' }}>💾</button>
          <button onClick={() => { const newList = savedPrinters.filter(ip => ip !== printerIp); setSavedPrinters(newList); localStorage.setItem('printers', JSON.stringify(newList)); setPrinterIp(''); setIsDropdownOpen(false); }} disabled={isConnected} style={{ padding: '8px 12px', backgroundColor: '#361e1e', borderColor: '#552d2d' }}>🗑️</button>
          <button onClick={() => { if(isConnected) setIsConnected(false); else if(printerIp) { setIsConnected(true); localStorage.setItem('lastIp', printerIp); } }} style={{ backgroundColor: isConnected ? '#1e2227' : '#2d3b55', minWidth: '100px' }}>{isConnected ? 'Disconnect' : 'Connect'}</button>
          <button onClick={() => { if(isConnected){ setShowControlPanel(true); fetchHistory(); } else alert("Connect first!"); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#1e1b2e', border: '1px solid #3d2b4f', color: '#b28dd4' }}>⚙️ Control Panel</button>
        </div>
      </div>

      {/* CENTER GRID */}
      <div style={{ display: 'flex', marginTop: '20px', gap: '20px', height: '450px' }}>
        <div style={{ width: '150px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '5px' }}>TOOLHEADS</div>
          {toolTemps.map((tool, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ backgroundColor: '#2c313c', color: '#888', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}>{index + 1}</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: tool.target > 0 ? '#ff4f4f' : 'white' }}>{Number(tool.current).toFixed(0)}°</span>
                <span style={{ fontSize: '11px', color: '#888' }}>/{Number(tool.target).toFixed(0)}°C</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', letterSpacing: '1px', marginTop: '10px', marginBottom: '5px' }}>BED</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: bedTemp.target > 0 ? '#ffb020' : '#ffb020' }}>{Number(bedTemp.current).toFixed(0)}°</span>
            <span style={{ fontSize: '11px', color: '#888' }}>/{Number(bedTemp.target).toFixed(0)}°C</span>
          </div>
        </div>
        
        {/* CAMERA FEED - UPDATED FOR DUAL CAMERA TOGGLE */}
        <div style={{ flex: 1, backgroundColor: '#161B22', borderRadius: '8px', border: '1px solid #333', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative' }}>
          {isCameraActive ? (
            <img 
              src={cameraType === 'case' ? `http://${printerIp}/webcam/stream.mjpg` : `http://${printerIp}/webcam2/stream.mjpg`} 
              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }} 
              onError={(e) => { setTimeout(() => { e.target.src = e.target.src.split('?')[0] + `?${Date.now()}`; }, 2000); }}
              onClick={() => setIsCameraActive(false)}
            />
          ) : thumbnailUrl ? (
            <img src={thumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }} onClick={() => setIsCameraActive(true)} />
          ) : (
            <p style={{ color: '#555', cursor: 'pointer' }} onClick={() => setIsCameraActive(true)}>No Print Active / Click for Camera</p>
          )}
        </div>

        {/* STATS & RADIO BUTTONS */}
        <div style={{ width: '100px', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'flex-end', textAlign: 'right' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', letterSpacing: '1px' }}>LAYER</span><span style={{ fontSize: '24px', fontWeight: 'bold' }}>{printStats.layer}</span><span style={{ fontSize: '11px', color: '#888' }}>/{printStats.totalLayers > 0 ? printStats.totalLayers : '-'}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', letterSpacing: '1px' }}>SPEED</span><span style={{ fontSize: '24px', fontWeight: 'bold' }}>{Number(printStats.speed).toFixed(0)}</span><span style={{ fontSize: '11px', color: '#888' }}>%</span></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', letterSpacing: '1px' }}>FAN</span><span style={{ fontSize: '24px', fontWeight: 'bold' }}>{Number(printStats.fan).toFixed(0)}</span><span style={{ fontSize: '11px', color: '#888' }}>%</span></div>
          
          {/* CAMERA TOGGLE RADIO BUTTONS (SPACED OUT) */}
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#888', fontWeight: 'bold', letterSpacing: '1px' }}>CAMERA</span>
            <label style={{ fontSize: '13px', color: cameraType === 'case' ? '#00E5FF' : '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              CASE <input type="radio" name="camType" checked={cameraType === 'case'} onChange={() => setCameraType('case')} style={{ cursor: 'pointer' }}/>
            </label>
            <label style={{ fontSize: '13px', color: cameraType === 'usb' ? '#00E5FF' : '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              USB <input type="radio" name="camType" checked={cameraType === 'usb'} onChange={() => setCameraType('usb')} style={{ cursor: 'pointer' }}/>
            </label>
          </div>
        </div>
      </div>

      {/* BOTTOM DASHBOARD */}
      <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          {spools.map((spool, i) => (
            <div key={i} style={{ position: 'relative', flex: 1 }}>
              <div onClick={() => setActiveMenuSlot(activeMenuSlot === i ? null : i)} style={{ backgroundColor: '#1e2227', padding: '15px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2a313a'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1e2227'}>
                <span style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>Toolhead {i + 1}</span>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: `#${spool.color}`, border: '2px solid #333' }}></div>
                <span style={{ fontSize: '14px', marginTop: '10px', fontWeight: 'bold' }}>{spool.type}</span>
              </div>
              {activeMenuSlot === i && (
                <div ref={menuRef} style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '5px', backgroundColor: '#2c313c', border: '1px solid #444', borderRadius: '4px', zIndex: 50, width: '150px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                  <div onClick={() => handleAfcAction(i, 'load')} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #333' }}>⬇ Auto Load</div>
                  <div onClick={() => handleAfcAction(i, 'unload')} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #333' }}>⬆ Auto Unload</div>
                  <div onClick={() => handleAfcAction(i, 'edit')} style={{ padding: '10px', cursor: 'pointer' }}>✏️ Edit Material</div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div>
          <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '5px' }}>{filename || 'No File Active'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}><div style={{ fontSize: '28px', fontWeight: 'bold' }}>{Number(jobInfo.progress).toFixed(1)}%</div><div style={{ flex: 1, height: '8px', backgroundColor: '#333', borderRadius: '4px', overflow: 'hidden' }}><div style={{ width: `${jobInfo.progress}%`, height: '100%', backgroundColor: '#00E5FF' }}></div></div></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', padding: '0 5px' }}>
            <div><div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', letterSpacing: '1px' }}>ELAPSED</div><div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatTime(jobInfo.elapsed)}</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', letterSpacing: '1px' }}>FILAMENT</div><div style={{ fontSize: '16px', fontWeight: 'bold' }}>{Number(jobInfo.filament).toFixed(1)}m</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', letterSpacing: '1px' }}>REMAINING</div><div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatTime(jobInfo.remaining)}</div></div>
          </div>
        </div>

        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: '#888', fontWeight: 'bold', letterSpacing: '1px' }}>📁 INTERNAL STORAGE</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { if(!selectedFile) return; if(window.confirm(`Delete ${selectedFile}?`)) { fetch(`http://${printerIp}:7125/server/files/gcodes/${encodeURIComponent(selectedFile)}`, { method: 'DELETE' }).then(() => { setSelectedFile(null); fetchFiles(); }); } }} style={{ backgroundColor: '#3a2325', borderColor: '#4a2c2f', color: '#ff6b6b' }}>🗑️ Delete</button>
              <button onClick={fetchFiles} style={{ backgroundColor: '#232936', borderColor: '#2c3547' }}>🔄 Refresh</button>
              <button onClick={handleLaunchStoredClick} style={{ backgroundColor: '#1d3b25', borderColor: '#254e31', color: '#6bfc8b', fontWeight: 'bold' }}>▶ Launch</button>
            </div>
          </div>
          <div style={{ height: '150px', overflowY: 'auto', backgroundColor: '#181b21', border: '1px solid #333', borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#222730', borderBottom: '1px solid #444' }}><tr><th style={{ padding: '8px' }}>Name</th><th style={{ padding: '8px' }}>Size</th><th style={{ padding: '8px' }}>Date</th></tr></thead>
              <tbody>{fileList.map((f, i) => <tr key={i} onClick={() => setSelectedFile(f.path)} style={{ borderBottom: '1px solid #222', cursor: 'pointer', backgroundColor: selectedFile === f.path ? '#2a3b5c' : 'transparent' }}><td style={{ padding: '8px' }}>{f.path}</td><td style={{ padding: '8px' }}>{formatSize(f.size)}</td><td style={{ padding: '8px' }}>{formatDate(f.modified)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button onClick={triggerFileSelect} style={{ flex: 1, padding: '15px', backgroundColor: '#1f2b23', borderColor: '#2d4734', color: '#84e296', fontSize: '16px' }}>📤 Upload & Print</button>
          <button onClick={() => postApi(jobInfo.state === 'paused' ? '/printer/print/resume' : '/printer/print/pause')} style={{ flex: 1, padding: '15px', backgroundColor: '#f0f0f0', color: '#8a6dc2', fontSize: '16px', fontWeight: 'bold' }}>{jobInfo.state === 'paused' ? '▶ Resume' : 'II Pause'}</button>
          <button onClick={() => { if(window.confirm("Cancel print?")) postApi('/printer/print/cancel'); }} style={{ flex: 1, padding: '15px', backgroundColor: '#f0f0f0', color: '#ff4f4f', fontSize: '16px', fontWeight: 'bold' }}>⏹ Stop</button>
          <button onClick={() => { if(window.confirm("EMERGENCY STOP will kill all power! Proceed?")) { postApi('/emergency_stop'); sendGcode('M112'); } }} style={{ flex: 1, padding: '15px', backgroundColor: '#361e1e', borderColor: '#552d2d', color: '#ff4f4f', fontSize: '16px', fontWeight: 'bold' }}>⚡ E-Stop</button>
        </div>
      </div>

      {/* --- EDIT SPOOL MODAL --- */}
      {showEditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
          <div style={{ backgroundColor: '#161B22', padding: '30px', borderRadius: '8px', border: '1px solid #444', width: '300px' }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Edit Extruder {editForm.index + 1}</h2>
            <div style={{ marginBottom: '15px' }}><label style={{ display: 'block', fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '5px' }}>BRAND / VENDOR</label><input type="text" value={editForm.vendor} onChange={(e) => setEditForm({...editForm, vendor: e.target.value})} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: 'none' }} /></div>
            <div style={{ marginBottom: '15px' }}><label style={{ display: 'block', fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '5px' }}>MATERIAL TYPE</label>
              <select value={editForm.type} onChange={(e) => setEditForm({...editForm, type: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '4px' }}>
                <option value="PLA">PLA</option><option value="PETG">PETG</option><option value="ABS">ABS</option><option value="TPU">TPU</option><option value="ASA">ASA</option><option value="NYLON">NYLON</option>
              </select>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '5px' }}>PRESET COLOR</label>
              <select onChange={(e) => { if(e.target.value) setEditForm({...editForm, colorHex: e.target.value}); }} style={{ width: '100%', padding: '8px', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '4px' }}>
                <option value="">-- Custom (Use Hex Below) --</option><option value="FFFFFF">White</option><option value="000000">Black</option><option value="FF0000">Red</option><option value="0000FF">Blue</option><option value="00FF00">Green</option><option value="FFFF00">Yellow</option><option value="FFA500">Orange</option><option value="800080">Purple</option><option value="FFC0CB">Pink</option><option value="808080">Grey</option><option value="C0C0C0">Silver</option><option value="FFD700">Gold</option>
              </select>
            </div>
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#888', fontWeight: 'bold', marginBottom: '5px' }}>CUSTOM COLOR HEX (NO #)</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}><input type="text" maxLength={6} value={editForm.colorHex} onChange={(e) => setEditForm({...editForm, colorHex: e.target.value})} style={{ flex: 1, padding: '8px', borderRadius: '4px', border: 'none' }} /><div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: `#${editForm.colorHex}`, border: '2px solid #444' }}></div></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowEditModal(false)} style={{ backgroundColor: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveSpool} style={{ backgroundColor: '#2a2a3e', border: '1px solid #3d3d5c', color: '#9d9df0', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Save to Printer</button>
            </div>
          </div>
        </div>
      )}

      {/* --- PRINT MODAL --- */}
      {showPrintModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
          <div style={{ backgroundColor: '#161B22', padding: '30px', borderRadius: '8px', border: '1px solid #444', width: '400px' }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>{printActionType === 'upload' ? 'Upload & Print Options' : 'Launch Options'}</h2>
            <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}><input type="checkbox" checked={printConfig.bedLeveling} onChange={(e) => setPrintConfig({...printConfig, bedLeveling: e.target.checked})} /><label>Auto Bed Leveling</label></div>
            <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}><input type="checkbox" checked={printConfig.timelapse} onChange={(e) => setPrintConfig({...printConfig, timelapse: e.target.checked})} /><label>Record Timelapse</label></div>
            <hr style={{ borderColor: '#333', margin: '20px 0' }} />
            <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}><input type="checkbox" checked={printConfig.isMultiColor} onChange={(e) => setPrintConfig({...printConfig, isMultiColor: e.target.checked})} /><label style={{ fontWeight: 'bold', color: '#00E5FF' }}>Advanced (Multi-Color Print)</label></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Primary Tool (T0):</span><select value={printConfig.t0Map} onChange={(e) => setPrintConfig({...printConfig, t0Map: e.target.value})} style={{ padding: '5px', backgroundColor: '#222', color: 'white', border: '1px solid #555' }}>{spools.map((s, i) => <option key={i} value={i}>Tool {i + 1} ({s.type})</option>)}</select></div>
              {printConfig.isMultiColor && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Tool 2 (T1):</span><select value={printConfig.t1Map} onChange={(e) => setPrintConfig({...printConfig, t1Map: e.target.value})} style={{ padding: '5px', backgroundColor: '#222', color: 'white', border: '1px solid #555' }}>{spools.map((s, i) => <option key={i} value={i}>Tool {i + 1} ({s.type})</option>)}</select></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Tool 3 (T2):</span><select value={printConfig.t2Map} onChange={(e) => setPrintConfig({...printConfig, t2Map: e.target.value})} style={{ padding: '5px', backgroundColor: '#222', color: 'white', border: '1px solid #555' }}>{spools.map((s, i) => <option key={i} value={i}>Tool {i + 1} ({s.type})</option>)}</select></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Tool 4 (T3):</span><select value={printConfig.t3Map} onChange={(e) => setPrintConfig({...printConfig, t3Map: e.target.value})} style={{ padding: '5px', backgroundColor: '#222', color: 'white', border: '1px solid #555' }}>{spools.map((s, i) => <option key={i} value={i}>Tool {i + 1} ({s.type})</option>)}</select></div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPrintModal(false)} style={{ backgroundColor: '#333', borderColor: '#444', padding: '8px 16px' }}>Cancel</button>
              <button onClick={executePrintJob} style={{ backgroundColor: '#1d3b25', borderColor: '#254e31', color: '#6bfc8b', fontWeight: 'bold', padding: '8px 16px' }}>Confirm & Print</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* ⚙️ MASSIVE CONTROL PANEL MODAL OVERLAY */}
      {/* ==================================================== */}
      {showControlPanel && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0f1115', display: 'flex', flexDirection: 'column', zIndex: 1000, padding: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '20px' }}>
            <h1 style={{ margin: 0, fontSize: '24px' }}>Printer Control Panel</h1>
            <div style={{ display: 'flex', gap: '5px' }}>
              {['Control', 'Toolheads', 'Movement', 'Terminal', 'History', 'Fluidd', 'Firmware Config'].map(tab => (
                <button key={tab} onClick={() => setCpTab(tab)} style={{ padding: '10px 20px', backgroundColor: cpTab === tab ? '#2A3B5C' : 'transparent', border: 'none', borderBottom: cpTab === tab ? '2px solid #00E5FF' : '2px solid transparent', color: cpTab === tab ? '#fff' : '#888', fontWeight: 'bold', cursor: 'pointer' }}>
                  {tab}
                </button>
              ))}
            </div>
            <button onClick={() => setShowControlPanel(false)} style={{ backgroundColor: '#361e1e', borderColor: '#552d2d', color: '#ff4f4f', padding: '8px 16px' }}>✖ Close</button>
          </div>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'hidden' }}>
            
            {/* 🎛️ CONTROL TAB */}
            {cpTab === 'Control' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '800px' }}>
                <div style={{ backgroundColor: '#161B22', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
                  <h3 style={{ marginTop: 0, color: '#888' }}>Heated Bed Temp</h3>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '15px' }}>{Number(bedTemp.current).toFixed(0)}°C / {Number(bedTemp.target).toFixed(0)}°C</div>
                  <select onChange={(e) => { if(e.target.value) sendGcode(`M140 S${e.target.value}`); }} style={{ width: '100%', padding: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
                    <option value="">Set Bed Temp...</option><option value="0">❌ Turn Off (0°C)</option><option value="50">♨ 50°C (PLA)</option><option value="70">♨ 70°C (PETG)</option><option value="100">♨ 100°C (ABS)</option>
                  </select>
                </div>
                
                <div style={{ backgroundColor: '#161B22', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
                  <h3 style={{ marginTop: 0, color: '#888' }}>Printing Speed</h3>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '15px' }}>{Number(printStats.speed).toFixed(0)}%</div>
                  <select onChange={(e) => { if(e.target.value) sendGcode(`M220 S${e.target.value}`); }} style={{ width: '100%', padding: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
                    <option value="">Set Global Speed...</option><option value="50">🐢 50% Speed</option><option value="100">✅ 100% Speed</option><option value="150">🚀 150% Speed</option>
                  </select>
                </div>

                <div style={{ backgroundColor: '#161B22', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
                  <h3 style={{ marginTop: 0, color: '#888' }}>Fan Speed</h3>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '15px', color: printStats.fan > 0 ? '#00E5FF' : '#888' }}>{printStats.fan > 0 ? `${Number(printStats.fan).toFixed(0)}%` : 'OFF'}</div>
                  <select onChange={(e) => { 
                    if(!e.target.value) return;
                    if(activeTool === 0) sendGcode(`M106 S${e.target.value}`);
                    else sendGcode(`SET_FAN_SPEED FAN=e${activeTool}_fan SPEED=${(parseInt(e.target.value)/255).toFixed(2)}`);
                  }} style={{ width: '100%', padding: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
                    <option value="">Set Fan Speed...</option><option value="0">❌ OFF</option><option value="128">💨 50%</option><option value="255">🌪️ 100%</option>
                  </select>
                </div>

                <div style={{ backgroundColor: '#161B22', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
                  <h3 style={{ marginTop: 0, color: '#888' }}>LED Strip</h3>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '15px', color: ledOn ? '#00E5FF' : '#888' }}>{ledOn ? 'ON' : 'OFF'}</div>
                  <button onClick={() => { setLedOn(!ledOn); sendGcode(!ledOn ? "SET_LED LED=cavity_led WHITE=1" : "SET_LED LED=cavity_led WHITE=0"); }} style={{ width: '100%', padding: '10px', backgroundColor: '#222', fontSize: '16px', color: 'white', border: '1px solid #444' }}>Toggle LED</button>
                </div>
              </div>
            )}

            {/* 🖨️ TOOLHEADS TAB */}
            {cpTab === 'Toolheads' && (
              <div style={{ width: '800px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                  {[0, 1, 2, 3].map(i => (
                    <button key={i} onClick={() => setSelectedTool(i)} style={{ flex: 1, padding: '15px', fontSize: '18px', backgroundColor: selectedTool === i ? '#00E5FF' : '#161B22', color: selectedTool === i ? '#000' : '#888', fontWeight: 'bold', border: '1px solid #333' }}>
                      Toolhead {i + 1}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ backgroundColor: '#161B22', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
                    <h3 style={{ marginTop: 0, color: '#888', textAlign: 'center' }}>Nozzle Temp.</h3>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', textAlign: 'center', marginBottom: '15px' }}>{Number(toolTemps[selectedTool].current).toFixed(0)}°C / {Number(toolTemps[selectedTool].target).toFixed(0)}°C</div>
                    <select onChange={(e) => { 
                      if(e.target.value) {
                        const targetHeater = selectedTool === 0 ? "extruder" : `extruder${selectedTool}`;
                        sendGcode(`SET_HEATER_TEMPERATURE HEATER=${targetHeater} TARGET=${e.target.value}`);
                      }
                    }} style={{ width: '100%', padding: '10px', backgroundColor: '#222', color: 'white', border: '1px solid #444', fontSize: '16px' }}>
                      <option value="">Set Temp...</option><option value="0">❌ Turn Off</option><option value="200">♨ 200°C (PLA)</option><option value="240">♨ 240°C (PETG)</option><option value="260">♨ 260°C (ABS)</option>
                    </select>
                  </div>

                  <div style={{ backgroundColor: '#161B22', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
                    <h3 style={{ marginTop: 0, color: '#888', textAlign: 'center' }}>Extrusion (Tool {selectedTool + 1})</h3>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
                      <button onClick={() => sendGcode(`T${selectedTool}\nM83\nG1 E-20 F300\nM82`)} style={{ flex: 1, padding: '15px', backgroundColor: '#333', fontSize: '16px', color: 'white', border: 'none', borderRadius: '4px' }}>⬆ Unload</button>
                      <button onClick={() => sendGcode(`T${selectedTool}\nM83\nG1 E20 F300\nM82`)} style={{ flex: 1, padding: '15px', backgroundColor: '#333', fontSize: '16px', color: 'white', border: 'none', borderRadius: '4px' }}>⬇ Load</button>
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#161B22', padding: '20px', borderRadius: '8px', border: '1px solid #333', gridColumn: 'span 2' }}>
                    <h3 style={{ marginTop: 0, color: '#888', textAlign: 'center' }}>Live Z-Offset (Babystepping)</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => sendGcode("SET_GCODE_OFFSET Z_ADJUST=0.01 MOVE=1")} style={{ flex: 1, padding: '15px', backgroundColor: '#2A3B5C', fontSize: '16px', color: 'white', border: 'none', borderRadius: '4px' }}>⬆ UP (+0.01)</button>
                      <button onClick={() => sendGcode("SET_GCODE_OFFSET Z_ADJUST=-0.01 MOVE=1")} style={{ flex: 1, padding: '15px', backgroundColor: '#2A3B5C', fontSize: '16px', color: 'white', border: 'none', borderRadius: '4px' }}>⬇ DOWN (-0.01)</button>
                    </div>
                  </div>

                  <button onClick={() => {
                    if(activeTool === selectedTool) sendGcode(selectedTool===0?"park_extruder":`park_extruder${selectedTool}`);
                    else sendGcode(selectedTool===0?"pick_extruder":`pick_extruder${selectedTool}`);
                  }} style={{ gridColumn: 'span 2', padding: '20px', fontSize: '18px', fontWeight: 'bold', backgroundColor: '#1e2836', color: activeTool === selectedTool ? '#ff4f4f' : '#00E5FF', border: '1px solid #2d3b55', borderRadius: '4px' }}>
                    {activeTool === selectedTool ? `Detach Toolhead ${selectedTool + 1}` : `Attach Toolhead ${selectedTool + 1}`}
                  </button>
                </div>
              </div>
            )}

            {/* 🏃‍♂️ MOVEMENT TAB */}
            {cpTab === 'Movement' && (
              <div style={{ display: 'flex', gap: '50px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[10, 1, 0.1].map(step => (
                    <button key={step} onClick={() => setJogStep(step)} style={{ padding: '15px 30px', backgroundColor: jogStep === step ? '#2A3B5C' : '#161B22', color: 'white', border: '1px solid #333', borderRadius: '4px', fontSize: '16px', fontWeight: 'bold' }}>{step}mm</button>
                  ))}
                  <button onClick={() => sendGcode("G28")} style={{ padding: '15px 30px', backgroundColor: '#161B22', color: 'white', border: '1px solid #333', borderRadius: '4px', fontSize: '16px', fontWeight: 'bold', marginTop: '20px' }}>🏠 HOME</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '60px 60px 60px', gridTemplateRows: '60px 60px 60px', gap: '10px' }}>
                  <div/>
                  <button onClick={() => handleJog('Y', jogStep)} style={{ backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '4px', fontSize: '24px' }}>▲</button>
                  <div/>
                  <button onClick={() => handleJog('X', -jogStep)} style={{ backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '4px', fontSize: '24px' }}>◀</button>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#111', color: 'white', borderRadius: '4px', fontWeight: 'bold' }}>XY</div>
                  <button onClick={() => handleJog('X', jogStep)} style={{ backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '4px', fontSize: '24px' }}>▶</button>
                  <div/>
                  <button onClick={() => handleJog('Y', -jogStep)} style={{ backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '4px', fontSize: '24px' }}>▼</button>
                  <div/>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: '30px' }}>
                  <button onClick={() => handleJog('Z', -jogStep)} style={{ width: '60px', height: '60px', backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '4px', fontSize: '24px' }}>▲</button>
                  <div style={{ height: '60px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', color: '#00E5FF' }}>Z</div>
                  <button onClick={() => handleJog('Z', jogStep)} style={{ width: '60px', height: '60px', backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '4px', fontSize: '24px' }}>▼</button>
                </div>
              </div>
            )}

            {/* 💻 TERMINAL TAB */}
            {cpTab === 'Terminal' && (
              <div style={{ width: '100%', maxWidth: '1000px', height: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ flex: 1, backgroundColor: '#000', color: '#00E5FF', fontFamily: 'monospace', padding: '15px', overflowY: 'auto', borderRadius: '4px', border: '1px solid #333', fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                  {termLogs || 'Connecting to Klipper Console...'}
                  <div ref={termEndRef} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" value={termInput} onChange={(e) => setTermInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter' && termInput) { setTermLogs(prev => prev + `\n> ${termInput}\n`); sendGcode(termInput); setTermInput(''); } }} placeholder="Send G-Code..." style={{ flex: 1, padding: '12px', backgroundColor: '#161B22', color: 'white', border: '1px solid #333', borderRadius: '4px', fontFamily: 'monospace', fontSize: '14px' }} />
                  <button onClick={() => { if(termInput) { setTermLogs(prev => prev + `\n> ${termInput}\n`); sendGcode(termInput); setTermInput(''); } }} style={{ padding: '0 30px', backgroundColor: '#2A3B5C', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Send</button>
                </div>
              </div>
            )}

            {/* 📊 HISTORY TAB */}
            {cpTab === 'History' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '800px' }}>
                <div style={{ backgroundColor: '#161B22', padding: '30px', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' }}>
                  <h3 style={{ margin: 0, color: '#888' }}>Total Print Time</h3>
                  <div style={{ fontSize: '48px', fontWeight: 'bold', marginTop: '15px' }}>{Number(historyStats.hrs).toFixed(1)} hrs</div>
                </div>
                <div style={{ backgroundColor: '#161B22', padding: '30px', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' }}>
                  <h3 style={{ margin: 0, color: '#888' }}>Filament Used</h3>
                  <div style={{ fontSize: '48px', fontWeight: 'bold', marginTop: '15px' }}>{Number(historyStats.fil).toFixed(1)} m</div>
                </div>
                <div style={{ backgroundColor: '#161B22', padding: '30px', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' }}>
                  <h3 style={{ margin: 0, color: '#888' }}>Success Rate</h3>
                  <div style={{ fontSize: '48px', fontWeight: 'bold', marginTop: '15px', color: '#00E5FF' }}>{Number(historyStats.success).toFixed(1)} %</div>
                </div>
                <div style={{ backgroundColor: '#161B22', padding: '30px', borderRadius: '8px', border: '1px solid #333', textAlign: 'center' }}>
                  <h3 style={{ margin: 0, color: '#888' }}>Total Print Jobs</h3>
                  <div style={{ fontSize: '48px', fontWeight: 'bold', marginTop: '15px' }}>{historyStats.jobs}</div>
                </div>
              </div>
            )}

            {/* 🌐 FLUIDD TAB */}
            {cpTab === 'Fluidd' && (
              <div style={{ width: '100%', height: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                <iframe src={`http://${printerIp}/`} title="Fluidd Web Page" style={{ width: '100%', height: '100%', border: 'none' }} />
              </div>
            )}

            {/* ⚙️ FIRMWARE CONFIG TAB */}
            {cpTab === 'Firmware Config' && (
              <div style={{ width: '100%', height: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                <iframe src={`http://${printerIp}/firmware-config/`} title="Firmware Config Web Page" style={{ width: '100%', height: '100%', border: 'none' }} />
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
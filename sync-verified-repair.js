(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const CONFIG_KEY = "mileage_logger_sync_config_v1";
  const SESSION_KEY = "mileage_logger_sync_session_v1";
  const DEVICE_ID_KEY = "mileage_logger_sync_device_id_v1";
  const VERIFIED_META_KEY = "mileage_logger_verified_sync_v1";
  const TYPES = new Set(["active_trip", "trip", "inspection", "timesheet_entry", "timesheet_week", "active_job", "facility_profile", "active_job_import", "active_job_proposal", "preferences"]);
  let inFlight = null;
  let suppressObserver = false;

  const text = (v) => v == null ? "" : String(v);
  const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (_) { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const keyOf = (type, id) => `${type}:${id}`;
  const hash = (value) => {
    const stable = (v) => Array.isArray(v) ? v.map(stable) : (v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
    const s = JSON.stringify(stable(value));
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  };

  function config() {
    const c = read(CONFIG_KEY, {});
    return { enabled: c.enabled !== false, projectUrl: text(c.projectUrl).replace(/\/$/, ""), publishableKey: text(c.publishableKey) };
  }
  function session() { return read(SESSION_KEY, null); }
  function deviceId() { return localStorage.getItem(DEVICE_ID_KEY) || "verified-sync-guard"; }
  function ready() { const c = config(), s = session(); return Boolean(c.enabled && c.projectUrl && c.publishableKey && s?.access_token && s?.user?.id && navigator.onLine); }

  function preferences(state) {
    const s = state?.settings || {}, w = state?.workflow || {};
    return { settings: {
      roundMiles:s.roundMiles, autoCaptureGps:s.autoCaptureGps, maxGpsAccuracy:s.maxGpsAccuracy, differenceWarning:s.differenceWarning,
      customers:Array.isArray(s.customers)?s.customers:[], vendors:Array.isArray(s.vendors)?s.vendors:[], purposes:Array.isArray(s.purposes)?s.purposes:[],
      vendorLocations:Array.isArray(s.vendorLocations)?s.vendorLocations:[], inspectionIgnoredTripIds:Array.isArray(s.inspectionIgnoredTripIds)?s.inspectionIgnoredTripIds:[]
    }, workflow:{ mileageRate:w.mileageRate ?? "" } };
  }

  function records(state) {
    const m = new Map();
    if (!state) return m;
    if (state.activeTrip?.id) m.set(keyOf("active_trip","current"), {type:"active_trip",id:"current",payload:state.activeTrip});
    (state.trips || []).forEach((x) => x?.id && m.set(keyOf("trip",x.id), {type:"trip",id:x.id,payload:x}));
    (state.settings?.inspections || []).forEach((x) => x?.id && m.set(keyOf("inspection",x.id), {type:"inspection",id:x.id,payload:x}));
    (state.activeJobs || []).forEach((x) => x?.aj && m.set(keyOf("active_job",x.aj), {type:"active_job",id:x.aj,payload:x}));
    (state.facilityProfiles || []).forEach((x) => x?.id && m.set(keyOf("facility_profile",x.id), {type:"facility_profile",id:x.id,payload:x}));
    (state.activeJobImports || []).forEach((x) => x?.id && m.set(keyOf("active_job_import",x.id), {type:"active_job_import",id:x.id,payload:x}));
    (state.activeJobUpdateProposals || []).forEach((x) => x?.id && m.set(keyOf("active_job_proposal",x.id), {type:"active_job_proposal",id:x.id,payload:x}));
    (state.workflow?.timesheetEntries || []).forEach((x) => x?.id && m.set(keyOf("timesheet_entry",x.id), {type:"timesheet_entry",id:x.id,payload:x}));
    Object.entries(state.workflow?.timesheetWeeks || {}).forEach(([id,payload]) => m.set(keyOf("timesheet_week",id), {type:"timesheet_week",id,payload}));
    m.set(keyOf("preferences","durable"), {type:"preferences",id:"durable",payload:preferences(state)});
    return m;
  }

  function shape(state) {
    state = state && typeof state === "object" ? state : {};
    state.trips = Array.isArray(state.trips) ? state.trips : [];
    state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
    state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
    state.workflow = state.workflow && typeof state.workflow === "object" ? state.workflow : {};
    state.workflow.timesheetEntries = Array.isArray(state.workflow.timesheetEntries) ? state.workflow.timesheetEntries : [];
    state.workflow.timesheetWeeks = state.workflow.timesheetWeeks && typeof state.workflow.timesheetWeeks === "object" ? state.workflow.timesheetWeeks : {};
    state.activeJobs = Array.isArray(state.activeJobs) ? state.activeJobs : [];
    state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];
    state.activeJobImports = Array.isArray(state.activeJobImports) ? state.activeJobImports : [];
    state.activeJobUpdateProposals = Array.isArray(state.activeJobUpdateProposals) ? state.activeJobUpdateProposals : [];
    return state;
  }

  function replace(arr, field, id, payload, deleted) {
    const i = arr.findIndex((x) => x?.[field] === id);
    if (deleted) { if (i >= 0) arr.splice(i,1); }
    else if (i >= 0) arr[i] = payload; else arr.push(payload);
  }

  function apply(state, row) {
    const t=row.record_type,id=row.record_id,p=row.payload,d=Boolean(row.tombstone);
    if (t==="active_trip" && id==="current") { state.activeTrip=d?null:p; return; }
    if (t==="trip") return replace(state.trips,"id",id,p,d);
    if (t==="inspection") return replace(state.settings.inspections,"id",id,p,d);
    if (t==="active_job") return replace(state.activeJobs,"aj",id,p,d);
    if (t==="facility_profile") return replace(state.facilityProfiles,"id",id,p,d);
    if (t==="active_job_import") return replace(state.activeJobImports,"id",id,p,d);
    if (t==="active_job_proposal") return replace(state.activeJobUpdateProposals,"id",id,p,d);
    if (t==="timesheet_entry") return replace(state.workflow.timesheetEntries,"id",id,p,d);
    if (t==="timesheet_week") { if(d) delete state.workflow.timesheetWeeks[id]; else state.workflow.timesheetWeeks[id]=p; return; }
    if (t==="preferences" && id==="durable" && !d && p) {
      const s=p.settings||{};
      ["roundMiles","autoCaptureGps","maxGpsAccuracy","differenceWarning"].forEach((f)=>{ if(s[f]!==undefined) state.settings[f]=s[f]; });
      ["customers","vendors","purposes","vendorLocations","inspectionIgnoredTripIds"].forEach((f)=>{ if(Array.isArray(s[f])) state.settings[f]=s[f]; });
      if(p.workflow?.mileageRate!==undefined) state.workflow.mileageRate=p.workflow.mileageRate;
    }
  }

  function recalc(state) {
    const latest=[...(state.trips||[])].filter((t)=>t?.endOdometer!==undefined&&t?.endOdometer!==null&&t?.endOdometer!=="").sort((a,b)=>text(b.endISO||b.date).localeCompare(text(a.endISO||a.date)))[0];
    if(latest) state.lastOdometer=latest.endOdometer;
  }

  async function api(path, options={}) {
    const c=config(),s=session();
    const headers=new Headers(options.headers||{}); headers.set("apikey",c.publishableKey); headers.set("Authorization",`Bearer ${s.access_token}`);
    if(options.body && !headers.has("Content-Type")) headers.set("Content-Type","application/json");
    const r=await fetch(`${c.projectUrl}${path}`,{...options,headers}); const raw=await r.text(); const body=raw?(()=>{try{return JSON.parse(raw)}catch(_){return raw}})():null;
    if(!r.ok) throw new Error(body?.message||body?.msg||body?.error||`${r.status} ${r.statusText}`); return body;
  }
  async function cloudRows() {
    const rows=await api("/rest/v1/mileage_sync_records?select=record_type,record_id,payload,modified_at,device_id,tombstone&order=modified_at.asc");
    return Array.isArray(rows)?rows.filter((r)=>TYPES.has(r.record_type)):[];
  }
  async function push(rows) {
    if(!rows.length) return;
    await api("/rest/v1/mileage_sync_records?on_conflict=user_id,record_type,record_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
  }

  function setBadge(state,message) {
    suppressObserver=true;
    const indicator=document.getElementById("multiDeviceSyncIndicator");
    if(indicator){indicator.textContent=state;indicator.dataset.syncState=state==="SYNCED"?"ready":state==="ERROR"?"error":"warn";indicator.title=message;}
    const status=document.getElementById("multiDeviceSyncStatus"); if(status){status.textContent=message;status.dataset.syncState=indicator?.dataset.syncState||"warn";}
    suppressObserver=false;
  }

  function summary(local,cloud) {
    const cm=new Map(cloud.map((r)=>[keyOf(r.record_type,r.record_id),r])); const bad=[];
    cloud.forEach((r)=>{const k=keyOf(r.record_type,r.record_id),l=local.get(k);if(r.tombstone){if(l)bad.push(k);}else if(!l||hash(l.payload)!==hash(r.payload))bad.push(k);});
    local.forEach((_,k)=>{const r=cm.get(k);if(!r||r.tombstone)bad.push(k);});
    const counts={}; cloud.filter((r)=>!r.tombstone).forEach((r)=>counts[r.record_type]=(counts[r.record_type]||0)+1);
    return {bad:[...new Set(bad)],counts};
  }

  async function verifyAndRepair(reason="verify") {
    if(inFlight) return inFlight;
    if(!ready()) return false;
    inFlight=(async()=>{
      setBadge("CHECK","Checking this device against the cloud…");
      try {
        let state=shape(read(STATE_KEY,{}));
        let cloud=await cloudRows();
        let local=records(state);
        const cloudMap=new Map(cloud.map((r)=>[keyOf(r.record_type,r.record_id),r]));
        const badgeText=document.getElementById("multiDeviceSyncIndicator")?.textContent?.trim() || "";
        const authoritative = reason === "badge-verification" || reason === "manual-wrapper" || badgeText === "SYNCED";

        // Before the normal engine completes, only restore records that are entirely missing.
        // Never overwrite a same-ID local edit until the normal sync pass has had a chance to push it.
        let changed=false;
        cloud.forEach((r)=>{
          const k=keyOf(r.record_type,r.record_id),l=local.get(k);
          const shouldApply = r.tombstone ? (authoritative && Boolean(l)) : (!l || (authoritative && hash(l.payload)!==hash(r.payload)));
          if(shouldApply){apply(state,r);changed=true;}
        });
        if(changed){recalc(state);localStorage.setItem(STATE_KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent("mileage:state-changed",{detail:{source:"verified-sync-repair"}}));}

        // Preserve any local-only records by uploading them rather than deleting them.
        state=shape(read(STATE_KEY,{})); local=records(state);
        const s=session(); const outgoing=[];
        local.forEach((r,k)=>{if(!cloudMap.has(k))outgoing.push({user_id:s.user.id,record_type:r.type,record_id:r.id,payload:r.payload,device_id:deviceId(),tombstone:false});});
        if(outgoing.length){await push(outgoing);cloud=await cloudRows();}

        // Final cloud-to-local equality pass. Same-ID overwrite is allowed only after the normal engine reports success.
        state=shape(read(STATE_KEY,{})); local=records(state); changed=false;
        cloud.forEach((r)=>{
          const k=keyOf(r.record_type,r.record_id),l=local.get(k);
          const shouldApply = r.tombstone ? (authoritative && Boolean(l)) : (!l || (authoritative && hash(l.payload)!==hash(r.payload)));
          if(shouldApply){apply(state,r);changed=true;}
        });
        if(changed){recalc(state);localStorage.setItem(STATE_KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent("mileage:state-changed",{detail:{source:"verified-sync-repair"}}));}

        state=shape(read(STATE_KEY,{})); local=records(state); const check=summary(local,cloud); const now=new Date().toISOString();
        write(VERIFIED_META_KEY,{lastVerifiedISO:check.bad.length?"":now,lastCheckedISO:now,mismatchCount:check.bad.length,counts:check.counts});
        if(check.bad.length){setBadge("CHECK",`${check.bad.length} record${check.bad.length===1?"":"s"} still differ from cloud. Tap Sync Now and keep this device open.`);return false;}
        setBadge("SYNCED",`Verified ${new Date(now).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}: ${check.counts.trip||0} trips, ${check.counts.inspection||0} inspections, ${check.counts.active_job||0} Active Jobs match cloud.`);
        return true;
      } catch(error){console.warn("Verified sync repair failed:",error);setBadge("ERROR",`Sync verification failed: ${error.message}`);return false;}
      finally{inFlight=null;}
    })();
    return inFlight;
  }

  function install() {
    // Run before the legacy engine's delayed startup sync so incomplete devices are repaired first.
    setTimeout(()=>verifyAndRepair("startup-preflight"),150);
    setInterval(()=>verifyAndRepair("interval"),23000);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")setTimeout(()=>verifyAndRepair("visible"),100);});
    window.addEventListener("online",()=>setTimeout(()=>verifyAndRepair("online"),100));
    window.addEventListener("mileage:state-changed",(e)=>{if(e.detail?.source==="verified-sync-repair")return;setTimeout(()=>verifyAndRepair("state-change"),2200);});

    const observer=new MutationObserver(()=>{
      if(suppressObserver)return;
      const indicator=document.getElementById("multiDeviceSyncIndicator");
      if(indicator?.textContent?.trim()==="SYNCED") setTimeout(()=>verifyAndRepair("badge-verification"),50);
    });
    const attach=()=>{const indicator=document.getElementById("multiDeviceSyncIndicator");if(indicator)observer.observe(indicator,{childList:true,characterData:true,subtree:true});else setTimeout(attach,250);}; attach();

    const base=window.MileageMultiDeviceSync;
    if(base?.syncNow){const original=base.syncNow.bind(base);base.syncNow=async(options={})=>{const result=await original(options);await verifyAndRepair("manual-wrapper");return result;};base.verifyAndRepair=verifyAndRepair;}
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
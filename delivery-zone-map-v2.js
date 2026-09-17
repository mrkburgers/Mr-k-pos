/* Owner-only delivery zone map editor. Existing POS workflows remain untouched. */
(function(){
 const BAMAKO_CENTER=[12.6392,-8.0029];
 const BAMAKO_ZOOM=12;
 const MAPBOX_PUBLIC_TOKEN="pk.eyJ1IjoibXJrYnVyZ2VycyIsImEiOiJjbXU1YTA3a3cwYXkyMnpzNzRpODRvYjBnIn0.NRPWmNW1VICsTRRtJJ777YQ";
 let map=null;
 let mapZones=[];
 let selectedZoneId="";
 let editPoints=[];
 let editMarkers=[];
 let editPolygon=null;
 let otherLayers=[];
 let leafletPromise=null;

 function ensureLeaflet(){
  if(window.L)return Promise.resolve(window.L);
  if(leafletPromise)return leafletPromise;
  leafletPromise=new Promise((resolve,reject)=>{
   if(!document.querySelector('link[data-mrk-leaflet="1"]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.dataset.mrkLeaflet="1";
    document.head.appendChild(link);
   }
   const existing=document.querySelector('script[data-mrk-leaflet="1"]');
   if(existing){
    existing.addEventListener("load",()=>resolve(window.L),{once:true});
    existing.addEventListener("error",()=>reject(new Error("Unable to load map library")),{once:true});
    return;
   }
   const script=document.createElement("script");
   script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
   script.dataset.mrkLeaflet="1";
   script.onload=()=>resolve(window.L);
   script.onerror=()=>reject(new Error("Unable to load map library"));
   document.head.appendChild(script);
  });
  return leafletPromise;
 }

 async function fetchMapZones(){
  const response=await fetch("/api/delivery-zones/map",{cache:"no-store"});
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data.error||"Unable to load delivery zone map data");
  mapZones=Array.isArray(data)?data:[];
  return mapZones;
 }

 function cleanupMap(){
  if(map){
   map.off();
   map.remove();
   map=null;
  }
  editMarkers=[];
  editPolygon=null;
  otherLayers=[];
 }

 function pointToLatLng(point){
  return [Number(point.lat),Number(point.lng)];
 }

 function zoneBoundary(zone){
  return Array.isArray(zone?.boundary)?zone.boundary:[];
 }

 function selectedZone(){
  return mapZones.find(zone=>zone.id===selectedZoneId)||null;
 }

 function setStatus(message,type="note"){
  const el=document.getElementById("v2ZoneMapStatus");
  if(!el)return;
  el.className=type==="error"?"system-note":"muted";
  el.textContent=message||"";
 }

 function syncEditPolygon(){
  if(!map||!window.L)return;
  const latlngs=editPoints.map(point=>[point.lat,point.lng]);
  if(editPolygon){
   editPolygon.setLatLngs(latlngs);
  }else if(latlngs.length>=2){
   editPolygon=L.polygon(latlngs,{weight:4,fillOpacity:.18}).addTo(map);
  }
 }

 function clearEditMarkers(){
  editMarkers.forEach(marker=>map?.removeLayer(marker));
  editMarkers=[];
  if(editPolygon){map?.removeLayer(editPolygon);editPolygon=null;}
 }

 function rebuildEditMarkers(){
  if(!map||!window.L)return;
  clearEditMarkers();
  editMarkers=editPoints.map((point,index)=>{
   const marker=L.marker([point.lat,point.lng],{draggable:true}).addTo(map);
   marker.bindTooltip(`Point ${index+1}`,{permanent:false});
   marker.on("drag",event=>{
    const latlng=event.target.getLatLng();
    editPoints[index]={lat:latlng.lat,lng:latlng.lng};
    syncEditPolygon();
   });
   return marker;
  });
  syncEditPolygon();
 }

 function renderOtherZones(){
  if(!map||!window.L)return;
  otherLayers.forEach(layer=>map.removeLayer(layer));
  otherLayers=[];
  mapZones.forEach(zone=>{
   if(zone.id===selectedZoneId)return;
   const boundary=zoneBoundary(zone);
   if(boundary.length<3)return;
   const layer=L.polygon(boundary.map(pointToLatLng),{
    weight:2,
    fillOpacity:.12,
    opacity:.8
   }).addTo(map);
   layer.bindTooltip(`${zone.name} — ${Number(zone.fee||0).toLocaleString()} CFA`);
   otherLayers.push(layer);
  });
 }

 function fitMapToZones(){
  const points=[];
  mapZones.forEach(zone=>zoneBoundary(zone).forEach(point=>points.push(pointToLatLng(point))));
  if(points.length&&map){
   map.fitBounds(L.latLngBounds(points),{padding:[25,25],maxZoom:15});
  }
 }

 function loadSelectedZoneBoundary({fit=true}={}){
  const zone=selectedZone();
  editPoints=zoneBoundary(zone).map(point=>({lat:Number(point.lat),lng:Number(point.lng)}));
  renderOtherZones();
  rebuildEditMarkers();
  if(fit&&editPoints.length>=3&&map){
   map.fitBounds(L.latLngBounds(editPoints.map(pointToLatLng)),{padding:[30,30],maxZoom:16});
  }else if(fit){
   fitMapToZones();
  }
  setStatus(editPoints.length>=3
   ?`Editing ${zone?.name||"zone"}. Drag points to adjust the boundary, or tap the map to add more points.`
   :`Tap the map to draw ${zone?.name||"this zone"}. Add at least 3 points.`);
 }

 function addPoint(latlng){
  if(!selectedZoneId)return;
  editPoints.push({lat:latlng.lat,lng:latlng.lng});
  rebuildEditMarkers();
  setStatus(`${editPoints.length} point${editPoints.length===1?"":"s"} set. Add at least 3 points, then save.`);
 }

 async function initMap(){
  await ensureLeaflet();
  const container=document.getElementById("v2DeliveryZoneMap");
  if(!container)return;
  cleanupMap();
  map=L.map(container,{zoomControl:true}).setView(BAMAKO_CENTER,BAMAKO_ZOOM);
  L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(MAPBOX_PUBLIC_TOKEN)}`,{
   maxZoom:19,
   tileSize:256,
   zoomOffset:0,
   attribution:'© Mapbox © OpenStreetMap contributors'
  }).addTo(map);
  map.on("click",event=>addPoint(event.latlng));
  loadSelectedZoneBoundary({fit:true});
  setTimeout(()=>map?.invalidateSize(),100);
 }

 function zoneOptions(){
  return mapZones.map(zone=>`<option value="${esc(zone.id)}" ${zone.id===selectedZoneId?"selected":""}>${esc(zone.name)} — ${Number(zone.fee||0).toLocaleString()} CFA${zone.active?"":" (inactive)"}</option>`).join("");
 }

 window.v2DeliveryZoneMapPage=async function v2DeliveryZoneMapPage(zoneId=""){
  if(role!=="owner"){
   alert("Only the owner can manage delivery zone map areas.");
   return;
  }
  clearInterval(timerInterval);
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="v2DeliveryZonesPage()">← BACK</button>
    <div class="logo">MR K BURGERS<span>OWNER — DELIVERY ZONE MAP</span></div>
    <div class="panel"><p class="muted">Loading delivery zones and map...</p></div>
   </div>`;
  try{
   await fetchMapZones();
   if(!mapZones.length){
    document.querySelector("#root .panel").innerHTML=`
     <div class="system-note">Create at least one delivery zone before drawing map areas.</div>`;
    return;
   }
   selectedZoneId=mapZones.some(zone=>zone.id===zoneId)?zoneId:mapZones[0].id;
   document.querySelector("#root .panel").innerHTML=`
    <span class="badge">🗺️ DELIVERY ZONE MAP</span>
    <h1>Map Areas</h1>
    <p class="muted">All saved delivery zones stay visible. Only the selected zone can be edited. Overlapping saved zones are rejected automatically.</p>
    <label>SELECT ZONE</label>
    <select id="v2ZoneMapSelect" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#0d0d0d;color:white;margin:8px 0 12px" onchange="v2ZoneMapSelectChanged(this.value)">
     ${zoneOptions()}
    </select>
    <div id="v2DeliveryZoneMap" style="height:58vh;min-height:420px;border-radius:12px;overflow:hidden;border:1px solid #333;background:#1b1b1b"></div>
    <div id="v2ZoneMapStatus" class="muted" style="margin-top:12px"></div>
    <div class="actions" style="margin-top:14px">
     <button class="secondary" onclick="v2ZoneMapUndo()">UNDO LAST POINT</button>
     <button class="danger" onclick="v2ZoneMapClear()">CLEAR</button>
     <button class="primary" onclick="v2ZoneMapSave()">SAVE AREA</button>
    </div>
   `;
   await initMap();
  }catch(error){
   document.querySelector("#root .panel").innerHTML=`<div class="system-note">${esc(error.message||"Unable to open delivery zone map.")}</div>`;
  }
 };

 window.v2ZoneMapSelectChanged=function v2ZoneMapSelectChanged(id){
  selectedZoneId=String(id||"");
  loadSelectedZoneBoundary({fit:true});
 };

 window.v2ZoneMapUndo=function v2ZoneMapUndo(){
  if(!editPoints.length)return;
  editPoints.pop();
  rebuildEditMarkers();
  setStatus(`${editPoints.length} point${editPoints.length===1?"":"s"} remaining.`);
 };

 window.v2ZoneMapClear=async function v2ZoneMapClear(){
  const zone=selectedZone();
  if(!zone)return;
  if(!editPoints.length&&!zoneBoundary(zone).length)return;
  if(!confirm(`Clear the saved map area for "${zone.name}"?`))return;
  try{
   const response=await fetch(`/api/delivery-zones/${encodeURIComponent(zone.id)}/boundary`,{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({boundary:null})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to clear map area");
   await fetchMapZones();
   editPoints=[];
   renderOtherZones();
   rebuildEditMarkers();
   setStatus(`${zone.name} map area cleared.`);
  }catch(error){
   alert(error.message||"Unable to clear delivery zone map area.");
  }
 };

 window.v2ZoneMapSave=async function v2ZoneMapSave(){
  const zone=selectedZone();
  if(!zone)return;
  if(editPoints.length<3){
   alert("Add at least 3 map points before saving the delivery zone area.");
   return;
  }
  try{
   setStatus("Saving map area...");
   const response=await fetch(`/api/delivery-zones/${encodeURIComponent(zone.id)}/boundary`,{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({boundary:editPoints})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to save map area");
   await fetchMapZones();
   loadSelectedZoneBoundary({fit:false});
   setStatus(`${zone.name} map area saved successfully.`);
  }catch(error){
   setStatus(error.message||"Unable to save map area.","error");
   alert(error.message||"Unable to save delivery zone map area.");
  }
 };

 function addMapButtons(){
  if(role!=="owner")return;
  const label=String(document.querySelector("#root .logo span")?.textContent||"");
  if(!label.includes("DELIVERY ZONES")||label.includes("MAP"))return;
  const panel=document.querySelector("#root .panel");
  if(!panel||document.getElementById("v2DeliveryZoneMapButton"))return;
  const addButton=[...panel.querySelectorAll("button")].find(button=>String(button.textContent||"").includes("ADD DELIVERY ZONE"));
  const button=document.createElement("button");
  button.id="v2DeliveryZoneMapButton";
  button.className="secondary";
  button.style.width="100%";
  button.style.margin="0 0 18px";
  button.textContent="🗺️ MAP AREAS";
  button.onclick=()=>v2DeliveryZoneMapPage();
  if(addButton)addButton.insertAdjacentElement("afterend",button);
  else panel.prepend(button);

  panel.querySelectorAll(".card").forEach(card=>{
   const name=card.querySelector("h3")?.textContent?.trim();
   const zone=mapZones.find(entry=>entry.name===name);
   if(!zone||card.querySelector(".v2-zone-map-edit"))return;
   const actions=card.querySelector(".actions");
   if(!actions)return;
   const edit=document.createElement("button");
   edit.className="secondary v2-zone-map-edit";
   edit.textContent=zoneBoundary(zone).length>=3?"EDIT MAP AREA":"SET MAP AREA";
   edit.onclick=()=>v2DeliveryZoneMapPage(zone.id);
   actions.appendChild(edit);
  });
 }

 const originalDeliveryZonesPage=window.v2DeliveryZonesPage;
 if(typeof originalDeliveryZonesPage==="function"){
  window.v2DeliveryZonesPage=async function v2DeliveryZonesPage(...args){
   const result=await originalDeliveryZonesPage.apply(this,args);
   try{
    await fetchMapZones();
    addMapButtons();
   }catch(error){
    console.error("Unable to add delivery zone map controls",error);
   }
   return result;
  };
 }
})();

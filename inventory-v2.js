let v2InventoryCache=null;

async function loadV2Inventory(force=false){
 if(v2InventoryCache && !force)return v2InventoryCache;
 const response=await fetch('/api/inventory',{cache:'no-store'});
 if(!response.ok)throw new Error('Unable to load inventory');
 v2InventoryCache=await response.json();
 return v2InventoryCache;
}

function v2InventoryCard(item,canEdit){
 return `
  <div class="order-card">
   <div class="order-top">
    <div>
     <div class="order-number">${esc(item.name)}</div>
     <div class="muted">${item.tracked?'Tracked':'Not tracked'} · ${esc(item.unit||'unit')}</div>
    </div>
    <span class="status ${item.low_stock?'':'ready'}">${item.low_stock?'LOW STOCK':'OK'}</span>
   </div>
   <div class="info-row"><span>Stock</span><strong>${Number(item.stock||0).toLocaleString()}</strong></div>
   <div class="info-row"><span>Low-stock level</span><strong>${Number(item.low_stock_level||0).toLocaleString()}</strong></div>
   ${canEdit?`
   <div class="form" style="margin-top:14px">
    <label><input id="inv-track-${item.id}" type="checkbox" ${item.tracked?'checked':''}> Track in inventory</label>
    <label>Unit</label><input id="inv-unit-${item.id}" value="${esc(item.unit||'unit')}">
    <label>Low-stock level</label><input id="inv-low-${item.id}" type="number" min="0" step="0.01" value="${Number(item.low_stock_level||0)}">
    <button class="secondary" onclick="v2SaveInventorySettings('${item.id}')">SAVE SETTINGS</button>
    <label>Stock adjustment</label><input id="inv-adjust-${item.id}" type="number" step="0.01" placeholder="Example: 10 or -2">
    <input id="inv-note-${item.id}" placeholder="Reason / note">
    <button class="primary" onclick="v2AdjustInventory('${item.id}')">APPLY STOCK ADJUSTMENT</button>
   </div>`:''}
  </div>`;
}

async function v2RenderInventory(title,backFn,canEdit){
 try{
  const data=await loadV2Inventory(true);
  document.getElementById('root').innerHTML=`
   <div class="app">
    <button class="back" onclick="${backFn}()">← BACK</button>
    <div class="logo">MR K BURGERS<span>${title}</span></div>
    <div class="panel">
     <div class="system-note">Tracked ingredients are deducted automatically when a paid cashier order is saved.</div>
     ${(data.items||[]).map(item=>v2InventoryCard(item,canEdit)).join('')||'<p class="muted">No inventory ingredients.</p>'}
    </div>
   </div>`;
 }catch(error){
  alert('Unable to load inventory from the restaurant server.');
 }
}

window.ownerInventory=function ownerInventory(){
 return v2RenderInventory('OWNER — INVENTORY','ownerHome',true);
};

window.managerInventory=function managerInventory(){
 return v2RenderInventory('MANAGER — INVENTORY','managerHome',true);
};

window.v2SaveInventorySettings=async function v2SaveInventorySettings(id){
 const tracked=document.getElementById(`inv-track-${id}`).checked;
 const unit=document.getElementById(`inv-unit-${id}`).value.trim()||'unit';
 const low_stock_level=Number(document.getElementById(`inv-low-${id}`).value||0);
 try{
  const response=await fetch(`/api/inventory/${encodeURIComponent(id)}`,{
   method:'PATCH',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({tracked,unit,low_stock_level})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Unable to save inventory settings');
  v2InventoryCache=null;
  if(role==='owner')ownerInventory();else managerInventory();
 }catch(error){alert(error.message);}
};

window.v2AdjustInventory=async function v2AdjustInventory(id){
 const quantity=Number(document.getElementById(`inv-adjust-${id}`).value);
 const note=document.getElementById(`inv-note-${id}`).value.trim();
 if(!Number.isFinite(quantity)||quantity===0)return alert('Enter a non-zero stock adjustment.');
 try{
  const response=await fetch(`/api/inventory/${encodeURIComponent(id)}/adjust`,{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    quantity,
    movement_type:quantity>0?'DELIVERY':'ADJUSTMENT',
    note,
    created_by:currentStaffName||currentStaffId||role
   })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Unable to adjust stock');
  v2InventoryCache=null;
  if(role==='owner')ownerInventory();else managerInventory();
 }catch(error){alert(error.message);}
};

if(typeof socket!=='undefined' && socket?.on){
 socket.on('inventory-changed',()=>{
  v2InventoryCache=null;
  const text=document.getElementById('root')?.innerText||'';
  if(text.includes('INVENTORY')){
   if(role==='owner')ownerInventory();
   else if(role==='manager')managerInventory();
  }
 });
}

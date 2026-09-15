window.addEventListener("load",()=>{
 function decorateChoiceGroups(){
  const editor=document.getElementById("v2ChoiceGroupsEditor");
  if(!editor)return;
  const state=window.v2ComboAdminState||null;
  const comboName=document.getElementById("v2ComboName")?.value.trim()||"";
  const combo=(state?.combos||[]).find(entry=>entry.name===comboName);
  const savedGroups=combo?.choice_groups||[];

  [...editor.querySelectorAll(".card")].forEach((card,index)=>{
   if(card.querySelector(".v2-choice-count"))return;
   const nameInput=card.querySelector(".v2-choice-name");
   if(!nameInput)return;
   const saved=savedGroups[index]||{};
   const count=Math.max(1,Number(saved.selection_count||1));
   const allowDuplicates=saved.allow_duplicates!==false;

   const block=document.createElement("div");
   block.className="v2-choice-settings";
   block.innerHTML=`
    <label>NUMBER OF CHOICES REQUIRED</label>
    <input type="number" min="1" step="1" value="${count}" class="v2-choice-count" data-choice-index="${index}">
    <label style="margin-top:10px">ALLOW SAME ITEM MORE THAN ONCE</label>
    <select class="v2-choice-duplicates" data-choice-index="${index}" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#0d0d0d;color:white;margin-bottom:10px">
     <option value="true" ${allowDuplicates?"selected":""}>Yes</option>
     <option value="false" ${!allowDuplicates?"selected":""}>No</option>
    </select>
    <p class="muted">Example: quantity 2 can be 2 × Coca Cola, or Coca Cola + Sprite when duplicates are allowed.</p>`;
   nameInput.insertAdjacentElement("afterend",block);

   const label=[...card.querySelectorAll("p.muted")].find(p=>String(p.textContent||"").includes("Customer chooses"));
   if(label)label.textContent=`Customer chooses ${count} from:`;
  });
 }

 function readChoiceGroupsFromDom(){
  const editor=document.getElementById("v2ChoiceGroupsEditor");
  if(!editor)return [];
  return [...editor.querySelectorAll(".card")].map((card,index)=>({
   name:card.querySelector(`.v2-choice-name[data-choice-index="${index}"]`)?.value.trim()||"",
   selection_count:Math.max(1,Number(card.querySelector(`.v2-choice-count[data-choice-index="${index}"]`)?.value||1)),
   allow_duplicates:card.querySelector(`.v2-choice-duplicates[data-choice-index="${index}"]`)?.value!=="false",
   item_ids:[...card.querySelectorAll(`.v2-choice-item[data-choice-index="${index}"]:checked`)].map(input=>input.dataset.itemId)
  }));
 }

 async function persistChoiceGroups(comboId,groups){
  const response=await fetch(`/api/combos/${encodeURIComponent(comboId)}/choice-groups`,{
   method:"PUT",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({choice_groups:groups})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Unable to save choice group settings");
  if(typeof v2LoadComboAdminState==="function")await v2LoadComboAdminState(true);
 }

 const originalAdd=window.v2OwnerAddCombo;
 if(typeof originalAdd==="function"){
  window.v2OwnerAddCombo=async function v2OwnerAddCombo(categoryId){
   const result=await originalAdd(categoryId);
   decorateChoiceGroups();
   return result;
  };
 }

 const originalEdit=window.v2OwnerEditCombo;
 if(typeof originalEdit==="function"){
  window.v2OwnerEditCombo=async function v2OwnerEditCombo(comboId){
   const result=await originalEdit(comboId);
   decorateChoiceGroups();
   return result;
  };
 }

 const originalAddGroup=window.v2AddChoiceGroup;
 if(typeof originalAddGroup==="function"){
  window.v2AddChoiceGroup=function v2AddChoiceGroup(){
   const result=originalAddGroup();
   decorateChoiceGroups();
   return result;
  };
 }

 const originalRemoveGroup=window.v2RemoveChoiceGroup;
 if(typeof originalRemoveGroup==="function"){
  window.v2RemoveChoiceGroup=function v2RemoveChoiceGroup(index){
   const result=originalRemoveGroup(index);
   decorateChoiceGroups();
   return result;
  };
 }

 const originalSaveNew=window.v2SaveNewCombo;
 if(typeof originalSaveNew==="function"){
  window.v2SaveNewCombo=async function v2SaveNewCombo(categoryId){
   const groups=readChoiceGroupsFromDom();
   for(const group of groups){
    if(!Number.isInteger(group.selection_count)||group.selection_count<1){alert("Choice quantity must be a whole number of 1 or more.");return;}
    if(!group.allow_duplicates&&group.selection_count>group.item_ids.length){alert(`Choice group "${group.name}" needs at least ${group.selection_count} different allowed items when duplicates are disabled.`);return;}
   }
   const comboName=document.getElementById("v2ComboName")?.value.trim()||"";
   await originalSaveNew(categoryId);
   if(!comboName||!groups.length)return;
   try{
    const state=await v2LoadComboAdminState(true);
    const combo=(state.combos||[]).find(entry=>entry.name===comboName);
    if(combo){
     await persistChoiceGroups(combo.id,groups);
     await v2OwnerComboCategory(categoryId);
    }
   }catch(error){alert(error.message||"Unable to save choice group quantity.");}
  };
 }

 const originalSaveEdit=window.v2SaveEditedCombo;
 if(typeof originalSaveEdit==="function"){
  window.v2SaveEditedCombo=async function v2SaveEditedCombo(comboId,oldCategoryId){
   const groups=readChoiceGroupsFromDom();
   for(const group of groups){
    if(!Number.isInteger(group.selection_count)||group.selection_count<1){alert("Choice quantity must be a whole number of 1 or more.");return;}
    if(!group.allow_duplicates&&group.selection_count>group.item_ids.length){alert(`Choice group "${group.name}" needs at least ${group.selection_count} different allowed items when duplicates are disabled.`);return;}
   }
   await originalSaveEdit(comboId,oldCategoryId);
   try{
    await persistChoiceGroups(comboId,groups);
    const state=await v2LoadComboAdminState(true);
    const combo=(state.combos||[]).find(entry=>entry.id===comboId);
    if(combo)await v2OwnerComboCategory(combo.category_id);
   }catch(error){alert(error.message||"Unable to save choice group quantity.");}
  };
 }

 const originalCategory=window.v2OwnerComboCategory;
 if(typeof originalCategory==="function"){
  window.v2OwnerComboCategory=async function v2OwnerComboCategory(categoryId){
   const result=await originalCategory(categoryId);
   try{
    const state=await v2LoadComboAdminState(true);
    const combos=(state.combos||[]).filter(combo=>combo.category_id===categoryId);
    document.querySelectorAll("#root .card").forEach(card=>{
     const name=card.querySelector("h3")?.textContent.trim();
     const combo=combos.find(entry=>entry.name===name);
     if(!combo)return;
     card.querySelectorAll("p.muted").forEach(p=>{
      const text=String(p.textContent||"");
      (combo.choice_groups||[]).forEach(group=>{
       if(text.includes(`${group.name}: choose 1 from`)){
        p.innerHTML=p.innerHTML.replace(`${esc(group.name)}: choose 1 from`,`${esc(group.name)}: choose ${Number(group.selection_count||1)} from`);
       }
      });
     });
    });
   }catch(error){console.error("Unable to display choice quantities",error);}
   return result;
  };
 }
});

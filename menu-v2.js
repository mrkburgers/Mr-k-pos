const v2FallbackMenuItems=[
 {id:"v2-burger-classic",name:"Mr K Classic",category:"burgers",price:3000,active:true},
 {id:"v2-burger-mushroom",name:"Mushroom & Swiss",category:"burgers",price:5500,active:true},
 {id:"v2-burger-honky",name:"Honky Tonk",category:"burgers",price:5000,active:true},
 {id:"v2-burger-philly",name:"Philly Cheesesteak",category:"burgers",price:5500,active:true},
 {id:"v2-burger-brave",name:"Only The Brave",category:"burgers",price:9000,active:true},
 {id:"v2-burger-bohemian",name:"Bohemian",category:"burgers",price:5000,active:true},
 {id:"v2-burger-chicken",name:"Chicken Chimichurri",category:"burgers",price:5500,active:true},

 {id:"v2-side-fries",name:"French Fries",category:"sides",price:1000,active:true},
 {id:"v2-side-plantain",name:"Plantain Tostones",category:"sides",price:1000,active:true},
 {id:"v2-side-onion",name:"Onion Rings",category:"sides",price:1000,active:true},
 {id:"v2-side-cheese",name:"Cheese Fries",category:"sides",price:3500,active:true},
 {id:"v2-side-fajita",name:"Fajita Cheese Fries",category:"sides",price:4500,active:true},
 {id:"v2-side-dirty",name:"Dirty Fries",category:"sides",price:4500,active:true},

 {id:"v2-salad-coleslaw",name:"Mr K Coleslaw",category:"salads",price:1000,active:true},
 {id:"v2-salad-cheeseburger",name:"Cheeseburger Salad",category:"salads",price:3500,active:true},

 {id:"v2-drink-small-water",name:"Small Water",category:"softDrinks",price:500,active:true},
 {id:"v2-drink-big-water",name:"Big Water",category:"softDrinks",price:1000,active:true},
 {id:"v2-drink-coke",name:"Coca Cola",category:"softDrinks",price:1000,active:true},
 {id:"v2-drink-sprite",name:"Sprite",category:"softDrinks",price:1000,active:true},
 {id:"v2-drink-fanta",name:"Fanta",category:"softDrinks",price:1000,active:true},

 {id:"v2-sauce-mrk",name:"Mr K Sauce",category:"sauces",price:500,active:true},
 {id:"v2-sauce-chimichurri",name:"Chimichurri",category:"sauces",price:500,active:true},
 {id:"v2-sauce-ketchup",name:"Ketchup",category:"sauces",price:0,active:true},
 {id:"v2-sauce-mayo",name:"Mayonnaise",category:"sauces",price:0,active:true},
 {id:"v2-sauce-honey-mustard",name:"Honey Mustard",category:"sauces",price:500,active:true},
 {id:"v2-sauce-honey-bbq",name:"Honey BBQ",category:"sauces",price:500,active:true},

 {id:"v2-extra-beef",name:"Extra beef patty",category:"extraToppings",price:2000,active:true},
 {id:"v2-extra-chicken",name:"Extra chicken steak",category:"extraToppings",price:2500,active:true},
 {id:"v2-extra-cheddar",name:"Extra cheddar cheese",category:"extraToppings",price:1000,active:true},
 {id:"v2-extra-emmental",name:"Extra emmental cheese",category:"extraToppings",price:1000,active:true},
 {id:"v2-extra-swiss",name:"Extra Swiss cheese",category:"extraToppings",price:1000,active:true},
 {id:"v2-extra-mushroom",name:"Extra mushroom",category:"extraToppings",price:1000,active:true},
 {id:"v2-extra-onion-rings",name:"Extra onion rings",category:"extraToppings",price:1000,active:true},
 {id:"v2-extra-bacon",name:"Extra bacon",category:"extraToppings",price:1500,active:true},
 {id:"v2-extra-grated-cheese",name:"Extra grated cheese",category:"extraToppings",price:1500,active:true}
];

const v2CategoryDefaults={
 burgers:{name:"Burgers",icon:"🍔"},
 sides:{name:"Sides",icon:"🍟"},
 salads:{name:"Salads",icon:"🥗"},
 softDrinks:{name:"Soft Drinks",icon:"🥤"},
 sauces:{name:"Sauces",icon:"🥣"}
};

const v2BurgerConfig={
 "Mr K Classic":{
  ingredients:["Beef patty 120g","Tomato","Onions","Pickled cucumbers","Mr K Sauce"],
  extras:["Extra beef patty","Extra cheddar cheese","Extra emmental cheese","Extra Swiss cheese","Extra mushroom","Extra onion rings","Extra bacon"]
 },
 "Mushroom & Swiss":{
  ingredients:["Beef patty 120g","Sautéed mushrooms","Caramelised onions","Swiss cheese ×2","Pickled cucumbers","Rocket lettuce","Mr K Sauce"],
  extras:["Extra beef patty","Extra cheddar cheese","Extra emmental cheese","Extra Swiss cheese","Extra mushroom","Extra onion rings","Extra bacon"]
 },
 "Honky Tonk":{
  ingredients:["Beef patty 120g","Cheddar cheese","Emmental cheese","Onion rings","Pickled cucumbers","Rocket lettuce","BBQ sauce","Mr K Sauce"],
  extras:["Extra beef patty","Extra cheddar cheese","Extra emmental cheese","Extra Swiss cheese","Extra mushroom","Extra onion rings","Extra bacon"]
 },
 "Philly Cheesesteak":{
  ingredients:["Beef patty 120g","Sautéed beef tenderloin 100g","Onions","Green pepper","Emmental cheese","Cheddar cheese","Mr K Sauce"],
  extras:["Extra beef patty","Extra cheddar cheese","Extra emmental cheese","Extra Swiss cheese","Extra mushroom","Extra onion rings","Extra bacon"]
 },
 "Only The Brave":{
  ingredients:["Beef patty 120g ×3","Cheddar cheese ×3","Pickled cucumbers","Bacon","Mr K Sauce"],
  extras:["Extra beef patty","Extra cheddar cheese","Extra emmental cheese","Extra Swiss cheese","Extra mushroom","Extra onion rings","Extra bacon"]
 },
 "Bohemian":{
  ingredients:["Beef patty 120g","Emmental cheese","Smoked turkey","Fresh tomato","Fresh cucumber","Rocket lettuce","Pesto mayo sauce"],
  extras:["Extra beef patty","Extra cheddar cheese","Extra emmental cheese","Extra Swiss cheese","Extra mushroom","Extra onion rings","Extra bacon"]
 },
 "Chicken Chimichurri":{
  ingredients:["Grilled chicken breast 120g","Emmental cheese ×2","Rocket lettuce","Pickled cucumbers","Mayonnaise","Chimichurri sauce"],
  extras:["Extra chicken steak","Extra cheddar cheese","Extra emmental cheese","Extra Swiss cheese","Extra mushroom","Extra onion rings","Extra bacon"]
 }
};

function installV2FallbackMenu(){
 if(!Array.isArray(ownerMenuData) || ownerMenuData.length===0){
  ownerMenuData=v2FallbackMenuItems.map(item=>({
   ...item,
   ingredientIds:[],
   ingredientQuantities:{},
   removableIngredientIds:[],
   allowedExtraIds:[]
  }));
  saveOwnerMenuData();
 }

 if(Array.isArray(menuCategoryData)){
  Object.entries(v2CategoryDefaults).forEach(([id,defaults])=>{
   const category=menuCategoryData.find(item=>item.id===id);
   if(category){
    category.name=defaults.name;
    if(!category.icon || category.icon==="🍽️"){
     category.icon=defaults.icon;
    }
    category.active=true;
   }else{
    menuCategoryData.push({
     id,
     name:defaults.name,
     icon:defaults.icon,
     active:true
    });
   }
  });
  saveMenuCategories();
 }
}

installV2FallbackMenu();

const legacyV2BurgerCustomize=window.burgerCustomize;

window.burgerCustomize=function burgerCustomize(name){
 const config=v2BurgerConfig[name];
 if(!config){
  return legacyV2BurgerCustomize(name);
 }

 currentCustomizeItem=name;
 resetExtras(config.extras);
 resetIngredients();

 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="openCategory('${currentCategory}')">← BACK</button>
  <div class="logo">MR K BURGERS<span>CUSTOMIZE</span></div>
  <div class="panel">
   <h2>${esc(name)}</h2>
   <h3>Ingredients</h3>
   <p class="muted">Uncheck any ingredient the customer does not want.</p>
   ${ingredientRows(config.ingredients,config.ingredients)}
   <h3>Extras</h3>
   ${extraRows(config.extras)}
   <h3>PRODUCT QUANTITY</h3>
   ${qtyHtml()}
   <button class="primary" style="margin-top:20px;width:100%" onclick='addCustomizedItem(${JSON.stringify(name)})'>ADD TO ORDER</button>
  </div>
 </div>`;
};

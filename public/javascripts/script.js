// TOOLTIP
 $(document).ready(function(){
     $('[data-toggle="tooltip"]').tooltip();
 });

if(!!document.getElementById("layerMapNew")){
    // NEW LAYER GEOMETRY MAP
    var mylayermapnew = L.map('layerMapNew').setView([parcelLat, parcelLng], 16);

    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 20,
        id: 'mapbox.satellite',
        accessToken: 'pk.eyJ1IjoicmVnZW5mYXJtZXIiLCJhIjoiY2puazNiNTJrMHp6MjN2dGExZmx3Y2xidSJ9.w9Hya5NzRLZZO3FcS1rDyA'
    }).addTo(mylayermapnew);

// FeatureGroup is to store editable layers
    var editableLayers = new L.FeatureGroup();
    mylayermapnew.addLayer(editableLayers);

    var drawPluginOptions = {
        position: 'topright',
        draw: {

            // disable toolbar item by setting it to false
            polyline: false,
            circle: false, // Turns off this drawing tool
            rectangle: false,
            marker: false,
            circlemarker: false,
        },
        edit: {
            featureGroup: editableLayers, //REQUIRED!!
            remove: false
        }
    };

// Initialise the draw control and pass it the FeatureGroup of editable layers
    var drawControl = new L.Control.Draw(drawPluginOptions);
    mylayermapnew.addControl(drawControl);

    mylayermapnew.on('draw:created', function(e) {
        var type = e.layerType,
            layer = e.layer;

        if (type === 'marker') {
            layer.bindPopup('A popup!');
        }

        editableLayers.addLayer(layer);

        // CHANGE FORMAT FOR LAYER
        var shape = layer.toGeoJSON();
        var shape_for_db = JSON.stringify(shape);

        // Try and send to HTML
        alert('An area geometry has successfully been created and you may click the "Create New Area" button below to create the new area');
        // document.getElementById("coordinates").innerHTML = "A layer geometry has successfully been created and you may click the button below to create the new layer";
        document.getElementById("geometry").value = shape_for_db;

        // Calculate area
        var shapeArea = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);

        // Send area to document input
        document.getElementById("layersize").value = shapeArea;

    });
}

if(!!document.getElementById("rowMapNew")){
    console.log("map here");
    // NEW LAYER GEOMETRY MAP
    var mylayermapnew = L.map('rowMapNew').setView([areaLat, areaLng], 16);

    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 20,
        id: 'mapbox.satellite',
        accessToken: 'pk.eyJ1IjoicmVnZW5mYXJtZXIiLCJhIjoiY2puazNiNTJrMHp6MjN2dGExZmx3Y2xidSJ9.w9Hya5NzRLZZO3FcS1rDyA'
    }).addTo(mylayermapnew);

// FeatureGroup is to store editable layers
    var editableLayers = new L.FeatureGroup();
    mylayermapnew.addLayer(editableLayers);

    var drawPluginOptions = {
        position: 'topright',
        draw: {

            // disable toolbar item by setting it to false
            polygon: false,
            circle: false, // Turns off this drawing tool
            rectangle: false,
            marker: false,
            circlemarker: false,
        },
        edit: {
            featureGroup: editableLayers, //REQUIRED!!
            remove: false
        }
    };

// Initialise the draw control and pass it the FeatureGroup of editable layers
    var drawControl = new L.Control.Draw(drawPluginOptions);
    mylayermapnew.addControl(drawControl);

    mylayermapnew.on('draw:created', function(e) {
        var type = e.layerType,
            layer = e.layer;

        if (type === 'marker') {
            layer.bindPopup('A popup!');
        }

        editableLayers.addLayer(layer);

        // CHANGE FORMAT FOR LAYER
        var shape = layer.toGeoJSON();
        var shape_for_db = JSON.stringify(shape);

        // Try and send to HTML
        alert('An row has successfully been created and you may click the "Create New row" button below to create the new row');
        // document.getElementById("coordinates").innerHTML = "A layer geometry has successfully been created and you may click the button below to create the new layer";
        document.getElementById("geometry").value = shape_for_db;

        // Calculate area
        var shapeArea = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);

        // Send area to document input
        document.getElementById("layersize").value = shapeArea;

        // Remove draw control? Maybe not edit, but draw control yes.
    });
}


if(!!document.getElementById("map3")){
    // SHOW LAYER GEOMETRY MAP
    var mylayermapshow = L.map('map3').setView([51.505, -0.09], 17);

    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox.satellite',
        accessToken: 'pk.eyJ1IjoicmVnZW5mYXJtZXIiLCJhIjoiY2puazNiNTJrMHp6MjN2dGExZmx3Y2xidSJ9.w9Hya5NzRLZZO3FcS1rDyA'
    }).addTo(mylayermapshow);
}

// ADD DATA INPUT
function addFields() {
    // Container <div> where dynamic content will be placed
    var container = document.getElementById("container");
    // Create an <input> element, set its type and name attributes
    var input = document.createElement("input");
    input.type = "number";
    input.step = ".01";
    input.classList.add("form-control");
    input.name = "flow[data]";
    container.appendChild(input);
}

// ADD BUDGET INPUT ROW
function addBudgetFields() {
    // Container <div> where dynamic content will be placed
    var container = document.getElementById("budgetcontainer");
    // Create an <div> element, set its class
    var div = document.createElement("div");
    div.classList.add("form-row");
    // Create first input
    var inputTypeDiv = document.createElement("div");
    inputTypeDiv.classList.add("form-group");
    inputTypeDiv.classList.add("col-md-4");
    var inputType = document.createElement("select");
    inputType.classList.add("form-control");
    inputType.name = "budget[postings][][type]";
    var option1 = document.createElement("option");
    option1.text = "Product revenue";
    option1.value = "product";
    inputType.add(option1);
    var option2 = document.createElement("option");
    option2.text = "Services";
    option2.value = "service";
    inputType.add(option2);
    var option3 = document.createElement("option");
    option3.text = "Material costs";
    option3.value = "material";
    inputType.add(option3);
    var option4 = document.createElement("option");
    option4.text = "Labor";
    option4.value = "labor";
    inputType.add(option4);
    inputTypeDiv.appendChild(inputType);
    // Create second input
    var inputAmountDiv = document.createElement("div");
    inputAmountDiv.classList.add("form-group");
    inputAmountDiv.classList.add("col-md-4");
    var inputAmount = document.createElement("input");
    inputAmount.type = "number";
    inputAmount.step = ".01";
    inputAmount.classList.add("form-control");
    inputAmount.name = "budget[postings][][amount]";
    inputAmountDiv.appendChild(inputAmount);
    // Create third input
    var inputValueDiv = document.createElement("div");
    inputValueDiv.classList.add("form-group");
    inputValueDiv.classList.add("col-md-4");
    var inputValue = document.createElement("input");
    inputValue.type = "number";
    inputValue.step = ".01";
    inputValue.classList.add("form-control");
    inputValue.name = "budget[postings][][value]";
    inputValueDiv.appendChild(inputValue);
    div.appendChild(inputTypeDiv);
    div.appendChild(inputAmountDiv);
    div.appendChild(inputValueDiv);
    container.appendChild(div);
}

// LOCATION SEARCH
function activatePlaceSearch(){
    var input = document.getElementById("search_input");
    var autocomplete = new google.maps.places.Autocomplete(input);
}

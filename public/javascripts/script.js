// TOOLTIP
// $(document).ready(function(){
//     $('[data-toggle="tooltip"]').tooltip();
// });

// NEW LAYER GEOMETRY MAP
var mylayermapnew = L.map('layerMapNew').setView([parcelLat, parcelLng], 16);

L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
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

// SHOW LAYER GEOMETRY MAP
var mylayermapshow = L.map('map').setView([51.505, -0.09], 17);

L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox.satellite',
    accessToken: 'pk.eyJ1IjoicmVnZW5mYXJtZXIiLCJhIjoiY2puazNiNTJrMHp6MjN2dGExZmx3Y2xidSJ9.w9Hya5NzRLZZO3FcS1rDyA'
}).addTo(mylayermapshow);

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

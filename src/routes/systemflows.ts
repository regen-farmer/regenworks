var express = require("express");
var router = express.Router();
import Systemflow from "../models/systemflow";
import System from "../models/system";
import Species from "../models/species";
var middleware = require("../middleware");

// SYSTEMFLOW INDEX ROUTE

// NESTED SYSTEM SYSTEMFLOW NEW ROUTE
router.get("/systems/:id/flows/new", middleware.isLoggedIn, function(req, res){
    // FIND SYSTEM ID
    System.findById(req.params.id, function(err, foundSystem){
        if(err) {
            console.log(err);
        } else {
            Species.find(function(err, foundSpecies){
                if(err){
                    console.log(err);
                } else {
                    // SORT SPECIES
                    function compare( a, b ) {
                        if ( a.nameCommon < b.nameCommon ){
                            return -1;
                        }
                        if ( a.nameCommon > b.nameCommon ){
                            return 1;
                        }
                        return 0;
                    }
                    foundSpecies.sort(compare);
                    res.render("systemflows/new", {system: foundSystem, species: foundSpecies});
                }
            });
        }
    });
});

// NESTED SYSTEM SYSTEMFLOW CREATE ROUTE
router.post("/systems/:id/flows", middleware.isLoggedIn, function(req, res){
    // FIND SYSTEM
    System.findById(req.params.id, function(err, foundSystem){
        if(err){
            console.log(err);
        } else {
            var flow = req.body.flow;
            var data: any[] = [];
            for(let i=0;i<flow.data.length;i++) {
                if (!(flow.data[i].species === "")) {
                    data.push(flow.data[i]);
                }
            }
            flow.data = data;
            Systemflow.create(req.body.flow, function(err, createdSystemflow){
                if(err){
                    console.log(err);
                } else {
                    foundSystem.flows.push(createdSystemflow);
                    foundSystem.save();
                    res.redirect("/systems/" + foundSystem._id);
                }
            })
        }
    })
})

module.exports = router;
var express = require("express");
var router = express.Router();
var Project = require("../models/project");
var Layer = require("../models/layer");
var Area = require("../models/area");
var middleware = require("../middleware");

//

// DELETE AREA ON PROJECT
router.delete("/projects/:id/areas/:pid", middleware.isLoggedIn, function(req, res){
    // FIND LAYER
    Project.findById(req.params.id, function(err, updatedProject){
        if(err){
            console.log(err);
        } else {
            // REMOVE ROW
            console.log("Length before " + updatedProject.areas.length);
            updatedProject.areas.remove(req.params.pid);
            updatedProject.save();
            // DELETE ROW
            Area.findByIdAndRemove(req.params.pid, function(err){
                if(err){
                    console.log(err);
                } else {
                    console.log("Length after " + updatedProject.areas.length);
                    res.redirect("/projects/" + updatedProject._id + "/layout");
                }
            });
        }
    });
});

module.exports = router;
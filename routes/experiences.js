var express = require("express");
var router = express.Router();

// EXPERIENCESS INDEX ROUTE
router.get("/experiences", function(req, res){
    res.render("experiences/index");
});

module.exports = router;
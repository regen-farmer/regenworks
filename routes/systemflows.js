const express = require('express');

const router = express.Router();
const Systemflow = require('../models/systemflow');
const System = require('../models/system');
const Species = require('../models/species');
const middleware = require('../middleware');

// SYSTEMFLOW INDEX ROUTE

// NESTED SYSTEM SYSTEMFLOW NEW ROUTE
router.get('/systems/:id/flows/new', middleware.isLoggedIn, (req, res) => {
  // FIND SYSTEM ID
  System.findById(req.params.id, (err, foundSystem) => {
    if (err) {
      console.log(err);
    } else {
      Species.find((err, foundSpecies) => {
        if (err) {
          console.log(err);
        } else {
          // SORT SPECIES
          function compare(a, b) {
            if (a.nameCommon < b.nameCommon) {
              return -1;
            }
            if (a.nameCommon > b.nameCommon) {
              return 1;
            }
            return 0;
          }
          foundSpecies.sort(compare);
          res.render('systemflows/new', { system: foundSystem, species: foundSpecies });
        }
      });
    }
  });
});

// NESTED SYSTEM SYSTEMFLOW CREATE ROUTE
router.post('/systems/:id/flows', middleware.isLoggedIn, (req, res) => {
  // FIND SYSTEM
  System.findById(req.params.id, (err, foundSystem) => {
    if (err) {
      console.log(err);
    } else {
      const { flow } = req.body;
      const data = [];
      for (i = 0; i < flow.data.length; i++) {
        if (!(flow.data[i].species === '')) {
          data.push(flow.data[i]);
        }
      }
      flow.data = data;
      Systemflow.create(req.body.flow, (err, createdSystemflow) => {
        if (err) {
          console.log(err);
        } else {
          foundSystem.flows.push(createdSystemflow);
          foundSystem.save();
          res.redirect(`/systems/${foundSystem._id}`);
        }
      });
    }
  });
});

module.exports = router;

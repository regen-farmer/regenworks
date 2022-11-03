const express = require('express');

const router = express.Router();
const passport = require('passport');
const async = require('async'); // “waterfall” - makes sure the function are called in sequence without using any callbacks.
const nodemailer = require('nodemailer'); // used to send emails from node.js - for example via gmail.
const crypto = require('crypto');
const User = require('../models/user');
const Parcel = require('../models/parcel');
const Activity = require('../models/activity');
const rateLimiterIP = require('../models/rateLimiterIP');
const middleware = require('../middleware'); // Will automatically require the middleware "index" file as the standard
const logger = require('../middleware/logger');
const Log = require('../models/log');

// ROOT ROUTE
router.get('/', (req, res) => {
  res.redirect('/login');
});

// ABOUT ROUTE
router.get('/about', (req, res) => {
  res.render('about');
});

// TERMS ROUTE
router.get('/terms', (req, res) => {
  res.render('terms');
});

// PRIVACY ROUTE
router.get('/privacy', (req, res) => {
  res.render('privacy');
});

// FEEDBACK ROUTE
router.get('/feedback', middleware.isLoggedIn, (req, res) => {
  res.render('feedback');
});

// COMPOSITION ROUTE
router.get('/composition', middleware.isLoggedIn, (req, res) => {
  res.render('composition');
});

// SUCCESSION ROUTE
router.get('/succession', middleware.isLoggedIn, (req, res) => {
  res.render('succession');
});

// QUESTIONNAIRE ROUTE
router.get('/questionnaire', (req, res) => {
  res.render('questionnaire');
});

// SUPPORT ROUTE
router.get('/support', (req, res) => {
  res.render('support');
});

// PLANNING ROUTE
router.get('/planning', middleware.isLoggedIn, (req, res) => {
  res.render('planning');
});

// DASHBOARD ROUTE
router.get('/dashboard', middleware.isLoggedIn, (req, res) => {
  Parcel.find({ 'owner.id': req.user._id }, (err, allParcels) => {
    if (err) {
      console.log(err);
    } else {
      Activity.find({ 'owner.id': req.user._id }, (err, allActivities) => {
        if (err) {
          console.log(err);
        } else {
          allActivities.sort((a, b) => Date.parse(a.start.date) - Date.parse(b.start.date));
          allActivities.slice(0, 4);
          res.render('dashboard', { activities: allActivities, parcels: allParcels });
        }
      });
    }
  });
});

// NEW USER ROUTE
router.get('/users/new', (req, res) => {
  logger.info('Sign up page requested', { timestamp: Date.now() });
  res.render('users/new');
});

// robots.txt
router.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /');
});

// ADMIN PANEL
router.get('/admindash', middleware.adminIsLoggedIn, (req, res) => {
  // GET LOGS

  res.render('admin');
});

// CREATE USER ROUTE
router.post('/users', (req, res) => {
  if (req.body.secret === '899af01m4maiq5k3' || req.body.secret === '9afa81hf1flqmfah2' || req.body.secret === 'jf18af910f87ah1jnn' || req.body.secret === '9aoqi1k3uaf7q8qh1a') {
    logger.info('Secret correct', { timestamp: Date.now() });
    const newUser = new User({
      username: req.body.username, email: req.body.email, registrationDate: Date.now(), membership: 1209600000, farmLimit: 1,
    });
    User.register(newUser, req.body.password, (err, user) => {
      if (err) {
        // req.flash("error", err.message);
        logger.error(err.message);
        return res.render('users/new');
      }
      logger.info(`New user "${user.username}" was created`, { timestamp: Date.now() });
      passport.authenticate('local')(req, res, () => {
        // req.flash("success", "Welcome to Regen Farmer " + user.username + ". Please start out by creating your first parcel of land below.");
        // res.redirect("/users/" + req.user.id); // Redirect to user account page
        if (req.body.secret === '9afa81hf1flqmfah2') {
          user.isNursery = true;
          user.save();
          res.redirect('/nurseries/new');
        } else if (req.body.secret === 'jf18af910f87ah1jnn') {
          user.isManagement = true;
          user.save();
          res.redirect('/parcels/new');
        } else if (req.body.secret === '9aoqi1k3uaf7q8qh1a') {
          user.isManagement = true;
          user.isProject = true;
          user.save();
          res.redirect('/parcels/new');
        } else {
          user.isProject = true;
          user.save();
          res.redirect('/parcels/new');
        }
      });
    });
  } else {
    logger.error('Secret is wrong', { timestamp: Date.now() });
    req.flash('error', 'Secret not correct');
    res.redirect('/users/new');
  }
});

// SHOW USER ROUTE
router.get('/users/:id', middleware.checkUserOwnership, (req, res) => {
  User.findById(req.params.id).populate('favorites').populate('parcels').exec((err, foundUser) => {
    if (err) {
      console.log(err);
    } else {
      res.render('users/show', { user: foundUser });
    }
  });
});

// USER EDIT ROUTE
router.get('/users/:id/edit', middleware.checkUserOwnership, (req, res) => {
  User.findById(req.params.id, (err, foundUser) => {
    if (err) {
      console.log(err);
    } else {
      res.render('users/edit', { user: foundUser });
    }
  });
});

// USER UPDATE ROUTE
router.put('/users/:id', middleware.checkUserOwnership, (req, res) => {
  User.findByIdAndUpdate(req.params.id, req.body.user, (err, updatedUser) => {
    if (err) {
      // flash with updatedUser
      console.log(err);
    } else {
      // flash with updatedUser
      res.redirect(`/users/${req.params.id}`);
    }
  });
});

// USER DELETE ROUTE
router.delete('/users/:id', middleware.checkUserOwnership, (req, res) => {
  User.findByIdAndRemove(req.params.id, (err, user) => {
    if (err) {
      console.log(err);
      // Flash message
      res.redirect('/parcels');
    } else {
      // Flash message
      logger.info(`User "${user.username}" was deleted`, { timestamp: Date.now() });
      res.redirect('/parcels');
    }
  });
});

// SHOW LOGIN FORM
router.get('/login', (req, res) => {
  logger.info('Login page requested', { timestamp: Date.now() });
  // DO LOGIN PAGE REQUEST TRACKING

  res.render('login');
});

// HANDLE LOGIN LOGIC
router.post('/login', passport.authenticate('local', { failureRedirect: '/login' }), (req, res) => {
/*
    logger.info(req.user.username + " has logged in", {timestamp: Date.now()});
*/
  const newLog = {
    message: `${req.user.username} logged in`,
    level: 'info',
    timestamp: Date.now(),
  };
  Log.create(newLog, (err, createdLog) => {
    if (err) {
      console.log(err);
    } else {
      if ((req.user.membership + req.user.registrationDate) > Date.now()) {
        console.log('membership test passed');
      }
      if (req.user.isNursery && req.user.isNursery === true) {
        res.redirect('/nurseries');
      } else {
        res.redirect(`/users/${req.user.id}`);
      }
    }
  });
});

/* // HANDLE LOGIN LOGIC
router.post("/login", function (req, res) {
    // SANITIZE?
    // IP VAR
    var ip = req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
    ip = (ip || '').split(',')[0];
    var limiterObject = {};
    // CHECK RATE LIMITER
    rateLimiterIP.findOneAndUpdate({ip: ip},{$inc: {hits: 1}},{upsert: false}).exec(function(error, limiter){
        // IF EXISTING LIMITER, ADD HIT
        if(error){
            console.log(error)
        } else if (!limiter){
            // IF NO LIMITER, CREATE NEW ONE
            rateLimiterIP.create({createdAt: new Date(), ip: ip}, function(err, createdLimiter){
                if(err){
                    console.log(err);
                } else {
                    // SET LIMITER AND NEXT
                    limiterObject = createdLimiter;
                }
            })
        } else {
            // IF TIME HAS EXPIRED, SET HIT TO 1
            if(new Date() - limiter.createdAt > 300000){
                limiter.hits = 1;
                limiter.createdAt = new Date();
                limiter.save();
            }
            // SET LIMITER AND NEXT
            limiterObject = limiter;
        }
        // CHECK RATE LIMITER AMOUNT OR TIME
        if(limiterObject.hits < 6){
            // LOGIN
            passport.authenticate("local", {failureRedirect: '/login'})(req, res, function(){
                // ON SUCCESSFUL LOGIN
                var newLog = {
                    message: req.user.username + " logged in",
                    level: "info",
                    timestamp: Date.now()
                };
                Log.create(newLog, function(err, createdLog){
                    if(err){
                        console.log(err);
                    } else {
                        res.redirect('/users/' + req.user.id);
                    }
                });
            });
            /!*passport.authenticate("local") function(err, user){
                console.log("reach this");
                if (err) { console.log(err); }
                if (!user) { res.redirect('/login'); }
                req.logIn(user, function(err) {
                    if (err) { console.log(err); }
                    // ON SUCCESSFUL LOGIN
                    var newLog = {
                        message: req.user.username + " logged in",
                        level: "info",
                        timestamp: Date.now()
                    };
                    Log.create(newLog, function(err, createdLog){
                        if(err){
                            console.log(err);
                        } else {
                            console.log("Logeed in!");
                            res.redirect('/users/' + req.user.id);
                        }
                    });
                });
            });*!/
        } else {
            res.redirect("/login");
        }
    });
}); */

// LOGOUT ROUTE
router.get('/logout', (req, res) => {
  logger.info('User requested to log out', { timestamp: Date.now() });
  req.logout();
  logger.info('User was logged out', { timestamp: Date.now() });
  // req.flash("success", "Logged you out!");
  res.redirect('/login');
});

// SHOW FORGOT PASSWORD PAGE
router.get('/forgot', (req, res) => {
  res.render('forgot');
});

// POST FORGOT PASSWORD REQUEST
router.post('/forgot', (req, res, next) => {
  async.waterfall([ // AN ARRAY OF FUNCTIONS THAT GETS CALLED ONE AFTER THE OTHER
    function (done) {
      // CREATES A RANDOM UNIQUE TOKEN USED TO RESET THE PASSWORD
      crypto.randomBytes(20, (err, buf) => {
        const token = buf.toString('hex');
        done(err, token);
      });
    },
    function (token, done) {
      User.findOne({ email: req.body.email }, (err, user) => {
        if (!user) {
          // req.flash('error', "No account with that email address exists.");
          return res.redirect('/forgot');
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 HOUR

        user.save((err) => {
          done(err, token, user);
        });
      });
    },
    function (token, user, done) {
      const smtpTransport = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          user: 'grownlocalmailer@gmail.com',
          pass: process.env.GMAILPW,
        },
      });
      const mailOptions = {
        to: user.email,
        from: 'hello@regenfarmer.com',
        subject: 'Regen Farmer - Reset Password',
        text: `http://${req.headers.host}/reset/${token}\n\n`,
      };
      smtpTransport.sendMail(mailOptions, (err) => {
        console.log('mail sent');
        // req.flash("success", "An email has been sent to " + user.email + " with further instructions.")
        done(err, 'done');
      });
    },
  ], (err) => {
    if (err) return next(err);
    res.redirect('/forgot');
  });
});

// SHOW NEW PASSWORD PAGE
router.get('/reset/:token', (req, res) => {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, (err, user) => {
    if (!user) {
      // req.flash("error", "Password reset token invalid or expired.");
      return res.redirect('/forgot');
    }
    res.render('reset', { token: req.params.token });
  });
});

// POST NEW PASSWORD REQUEST
router.post('/reset/:token', (req, res) => {
  async.waterfall([
    function (done) {
      User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, (err, user) => {
        if (!user) {
          req.flash('error', 'Password reset token invalid or has expired');
          return res.redirect('back');
        }
        if (req.body.password === req.body.confirm) {
          user.setPassword(req.body.password, (err) => { // SALT AND HASH NEW PASSWORD
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;

            user.save((err) => { // SAVES TO MONGODB
              req.logIn(user, (err) => {
                done(err, user);
              });
            });
          });
        } else {
          req.flash('error', 'Passwords do not match.');
          return res.redirect('back');
        }
      });
    },
    function (user, done) {
      const smtpTransport = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          user: 'grownlocalmailer@gmail.com',
          pass: process.env.GMAILPW,
        },
      });
      const mailOptions = {
        to: user.email,
        from: 'hello@regenfarmer.com',
        subject: 'Your password has been changed',
        text: 'Hello, \n\n',
      };
      smtpTransport.sendMail(mailOptions, (err) => {
        req.flash('success', 'Success! Your password has been changed.');
        done(err);
      });
    },
  ], (err) => {
    if (err) {
      console.log(err);
    } else {
      res.redirect('back');
    }
  });
});

// SET CURRENTPROJECT //
router.post('/users/:id/currentproject/', middleware.checkUserOwnership, (req, res) => {
  User.findById(req.user._id, (err, foundUser) => {
    if (err) {
      console.log(err);
    } else {
      Parcel.findById(req.body.parcelid, (err, foundParcel) => {
        if (err) {
          console.log(err);
        } else {
          foundUser.currentProject = foundParcel;
          foundUser.save();
          console.log(`${foundParcel.name} has been set to active project`);
          res.redirect(`/parcels/${foundParcel._id}`);
        }
      });
    }
  });
});

// PARCEL STATUS PAGE
router.get('/parcels/:id/status', middleware.isLoggedIn, (req, res) => {
  // FIND PARCEL
  Parcel.findById(req.params.id).populate({ path: 'layers', populate: { path: 'soiltests' } }).exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      // RENDER ACTIVITIES
      res.render('status', { parcel: foundParcel });
    }
  });
});

module.exports = router;

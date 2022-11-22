import express from 'express';
import Parcel from '../models/parcel';
import Note from '../models/note';
import Row from '../models/row';
import Area from '../models/area';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';

const router = express.Router();

// PARCEL NOTES
router.get('/parcels/:id/notes', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // FIND PARCEL
  Parcel.findById(req.params.id).populate({ path: 'layers', populate: { path: 'rows', populate: { path: 'notes' } } }).populate({ path: 'layers', populate: { path: 'areas', populate: { path: 'notes' } } }).exec((err, foundParcel) => {
    if (err) {
      console.log(err);
    } else {
      // RENDER ACTIVITIES
      res.render('notes/index', { parcel: foundParcel });
    }
  });
});

// --------------- NESTED ROUTES ROW BASED ---------------- //

router.get('/parcels/:id/layers/:pid/rows/:rid/notes/new', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // RENDER NEW ACTIVITY PAGE
  res.render('notes/rownew', { parcelid: req.params.id, layerid: req.params.pid, rowid: req.params.rid });
});

// CREATE NOTE ON ROW
router.post('/parcels/:id/layers/:pid/rows/:rid/notes', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // CREATE ACTIVITY
  try {
    const createdNote = await Note.create(req.body.note);
    try {
      await Row.findByIdAndUpdate(req.params.rid, { $push: { notes: createdNote } });
      res.redirect(`/parcels/${req.params.id}/notes`);
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// --------------- NESTED ROUTES ROW BASED ---------------- //

router.get('/parcels/:id/layers/:pid/areas/:rid/notes/new', middleware.isLoggedIn, (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // RENDER NEW ACTIVITY PAGE
  res.render('notes/areanew', { parcelid: req.params.id, layerid: req.params.pid, areaid: req.params.rid });
});

// CREATE NOTE ON ROW
router.post('/parcels/:id/layers/:pid/areas/:rid/notes', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // CREATE ACTIVITY
  const createdNote = await Note.create(req.body.note);

  Area.findByIdAndUpdate(req.params.rid, { $push: { notes: createdNote } }, (err) => {
    if (err) {
      console.log(err);
    } else {
      res.redirect(`/parcels/${req.params.id}/notes`);
    }
  });
});

export default router;

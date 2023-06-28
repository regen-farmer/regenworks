import express from 'express';
import Parcel from '../models/parcel.js';
import Note from '../models/note.js';
import Row from '../models/row.js';
import Area from '../models/area.js';
import middleware from '../middleware/index.js';
import { UserDocument } from '../models/user.js';
import { Auth0IDToken, Variables } from '../app.js';

import { Hono } from "hono";

// import logger from '../middleware/logger';

export default function indexRoutes(
  router: Hono<
    {
      Variables: Variables;
    },
    {},
    "/"
  >
) {

// PARCEL NOTES
router.get('/parcels/:entityid/notes', async (c) => {
await middleware.isLoggedIn(c);
  try {
  // FIND PARCEL
    const foundParcel = await Parcel.findById(c.req.param('entityid')).populate({ path: 'layers', populate: { path: 'rows', populate: { path: 'notes' } } }).populate({ path: 'layers', populate: { path: 'areas', populate: { path: 'notes' } } }).exec();
    // RENDER ACTIVITIES
    return c.json({ parcel: foundParcel });
  } catch (err) {
    console.log(err);
  }
});

// --------------- NESTED ROUTES ROW BASED ---------------- //

router.get('/parcels/:entityid/layers/:pid/rows/:rid/notes/new', async (c) => {
await middleware.isLoggedIn(c);
  // RENDER NEW ACTIVITY PAGE
  return c.json({ parcelid: c.req.param('entityid'), layerid: c.req.param('pid'), rowid: c.req.param('rid') });
});

// CREATE NOTE ON ROW
router.post('/parcels/:entityid/layers/:pid/rows/:rid/notes', async (c) => {
await middleware.isLoggedIn(c);
const payload = await c.req.json();
  // CREATE ACTIVITY
  try {
    const createdNote = await Note.create(payload.note);
    try {
      await Row.findByIdAndUpdate(c.req.param('rid'), { $push: { notes: createdNote } });
      return c.json(`/parcels/${c.req.param('entityid')}/notes`);
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// --------------- NESTED ROUTES ROW BASED ---------------- //

router.get('/parcels/:entityid/layers/:pid/areas/:rid/notes/new', async (c) => {
await middleware.isLoggedIn(c);
  // RENDER NEW ACTIVITY PAGE
  return c.json({ parcelid: c.req.param('entityid'), layerid: c.req.param('pid'), areaid: c.req.param('rid') });
});

// CREATE NOTE ON ROW
router.post('/parcels/:entityid/layers/:pid/areas/:rid/notes', async (c) => {
await middleware.isLoggedIn(c);
const payload = await c.req.json();
  // CREATE ACTIVITY
  const createdNote = await Note.create(payload.note);

  try {
    await Area.findByIdAndUpdate(c.req.param('rid'), { $push: { notes: createdNote } });
    return c.json(`/parcels/${c.req.param('entityid')}/notes`);
  } catch (err) {
    console.log(err);
  }
});

}

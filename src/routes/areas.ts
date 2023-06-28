import express from 'express';
import Project from '../models/project.js';
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

// NEW AREA ON PROJECT
router.get(
  '/projects/:id/areas/new',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'))
        .populate('layer')
        .exec();
      return c.json({ project: foundProject });
    } catch (err) {
      console.log(err);
    }
  },
);

// CREATE AREA ON PROJECT
router.post('/projects/:id/areas', async (c) => {
await middleware.isLoggedIn(c);
  // CREATE AREA HERE?
  const area = {
    geometry: (await c.req.json()).geometry,
    name: (await c.req.json()).area.name,
    size: (await c.req.json()).layersize,
  };
  // CREATE ROW
  try {
    const createdArea = await Area.create(area);
    // FIND PROJECT
    try {
      const updatedProject = await Project.findByIdAndUpdate(
        c.req.param('id'),
        { $addToSet: { areas: createdArea } },
      );
      if (updatedProject) {
        console.log('Area has been added to project');
        return c.json(`/projects/${updatedProject.id}/layout`);
      } else {
        console.log('Project wasn\'t updated');
      }
    } catch (err) {
      console.log(err);
    }
  } catch (err) {
    console.log(err);
  }
});

// DELETE AREA ON PROJECT
router.delete(
  '/projects/:id/areas/:pid',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const updatedProject = await Project.findById(c.req.param('id'));

      if (updatedProject) {
      // REMOVE ROW
        console.log(`Length before ${updatedProject.areas.length}`);
        updatedProject.areas.forEach(async (area) => {
          if (area._id.toString() === c.req.param('pid')) {
            await area.deleteOne();
          }
        });
        await updatedProject.save();
        // DELETE ROW
        try {
          await Area.findByIdAndRemove(c.req.param('pid'));
          console.log(`Length after ${updatedProject.areas.length}`);
          return c.json(`/projects/${updatedProject._id}/layout`);
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// PROJECT DELETE ALL ROWS, AND LATER ON AREAS ON PROJECT
router.get(
  '/projects/:id/deleteareas',
  async (c) => {
    await middleware.isLoggedIn(c)
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(c.req.param('id'));
      // DELETE AREAS
      if (foundProject) {
        try {
          await Area.deleteMany({ _id: { $in: foundProject.areas } });
          // CLEAR AREA ARRAY ON PROJECT
          try {
            const updatedProject = await Project.findByIdAndUpdate(c.req.param('id'), {
              $set: { areas: [] },
            });
            if (updatedProject) {
              return c.json(`/projects/${updatedProject._id}/layout`);
            } else {
              console.log('project wasn\'t updated');
            }
          } catch (err) {
            console.log(err);
          }
        } catch (err) {
          console.log(err);
        }
      }
    } catch (err) {
      console.log(err);
    }
  },
);

}

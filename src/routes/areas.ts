import express from 'express';
import Project from '../models/project';
import Area from '../models/area';
import middleware from '../middleware';
import { IUserSchema } from '../models/user';

const router = express.Router();

// NEW AREA ON PROJECT
router.get(
  '/projects/:id/areas/new',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND PROJECT
    Project.findById(req.params.id)
      .populate('layer')
      .exec((err, foundProject) => {
        if (err) {
          console.log(err);
        } else {
          res.render('areas/new', { project: foundProject });
        }
      });
  },
);

// CREATE AREA ON PROJECT
router.post('/projects/:id/areas', middleware.isLoggedIn, async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
  // CREATE AREA HERE?
  const area = {
    geometry: req.body.geometry,
    name: req.body.area.name,
    size: req.body.layersize,
  };
  // CREATE ROW
  Area.create(area, async (err, createdArea) => {
    if (err) {
      console.log(err);
    } else {
      // FIND PROJECT
      try {
        const updatedProject = await Project.findByIdAndUpdate(
          req.params.id,
          { $addToSet: { areas: createdArea } },
        );
        if (updatedProject) {
          console.log('Area has been added to project');
          res.redirect(`/projects/${updatedProject.id}/layout`);
        } else {
          console.log('Project wasn\'t updated');
        }
      } catch (err) {
        console.log(err);
      }
    }
  });
});

// DELETE AREA ON PROJECT
router.delete(
  '/projects/:id/areas/:pid',
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND PROJECT
    try {
      const updatedProject = await Project.findById(req.params.id);

      if (updatedProject) {
      // REMOVE ROW
        console.log(`Length before ${updatedProject.areas.length}`);
        updatedProject.areas.forEach(async (area) => {
          if (area._id === req.params.pid) {
            await area.remove();
          }
        });
        await updatedProject.save();
        // DELETE ROW
        try {
          await Area.findByIdAndRemove(req.params.pid);
          console.log(`Length after ${updatedProject.areas.length}`);
          res.redirect(`/projects/${updatedProject._id}/layout`);
        } catch (err: any) {
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
  middleware.isLoggedIn,
  async (req: express.Request & { user?: IUserSchema}, res: express.Response) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id);
      // DELETE AREAS
      if (foundProject) {
        try {
          await Area.deleteMany({ _id: { $in: foundProject.areas } });
          // CLEAR AREA ARRAY ON PROJECT
          try {
            const updatedProject = await Project.findByIdAndUpdate(req.params.id, {
              $set: { areas: [] },
            });
            if (updatedProject) {
              res.redirect(`/projects/${updatedProject._id}/layout`);
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

export default router;

import express from "express";
import Project from "@rw/db/schemas/project.ts";
import Area from "@rw/db/schemas/area.ts";
import middleware from "../middleware/index.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import type { Auth0IDToken } from "../app.ts";

const router = express.Router();

// NEW AREA ON PROJECT
router.get(
  "/projects/:id/areas/new",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const foundProject = await Project.findById(req.params.id).populate("layer").exec();
      res.send({ project: foundProject });
    } catch (err) {
      console.log(err);
    }
  },
);

// CREATE AREA ON PROJECT
router.post(
  "/projects/:id/areas",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // CREATE AREA HERE?
    const area = {
      geometry: req.body.geometry,
      name: req.body.area.name,
      size: req.body.layersize,
    };
    // CREATE ROW
    try {
      const createdArea = await Area.create(area);
      // FIND PROJECT
      try {
        const updatedProject = await Project.findByIdAndUpdate(req.params.id, {
          $addToSet: { areas: createdArea },
        });
        if (updatedProject) {
          console.log("Area has been added to project");
          res.send(`/projects/${updatedProject.id}/layout`);
        } else {
          console.log("Project wasn't updated");
        }
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
    }
  },
);

// DELETE AREA ON PROJECT
router.delete(
  "/projects/:id/areas/:pid",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    // FIND PROJECT
    try {
      const updatedProject = await Project.findById(req.params.id);

      if (updatedProject) {
        // REMOVE ROW
        console.log(`Length before ${updatedProject.areas.length}`);
        for (const area of updatedProject.areas) {
          if (area._id.toString() === req.params.pid) {
            await area.deleteOne();
          }
        }
        await updatedProject.save();
        // DELETE ROW
        try {
          await Area.findByIdAndDelete(req.params.pid);
          console.log(`Length after ${updatedProject.areas.length}`);
          res.send(`/projects/${updatedProject._id}/layout`);
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
  "/projects/:id/deleteareas",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
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
              res.send(`/projects/${updatedProject._id}/layout`);
            } else {
              console.log("project wasn't updated");
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

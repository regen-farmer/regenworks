import express from "express";
import unique from "array-unique";
import { area } from "@turf/turf";
import Budget from "../models/budget.js";
import Project from "../models/project.js";
import System from "../models/system.js";
import Posting, { IPostingSchema } from "../models/posting.js";
import Parcel from "../models/parcel.js";
import middleware from "../middleware/index.js";
import { systemBasedLayout } from "../middleware/gis/system_based_layout.js";
import { UserDocument } from "../models/user.js";
import { ISpeciesSchema } from "../models/species.js";
import { Auth0IDToken } from "../app.js";
import { rowBasedLayout } from "../middleware/gis/row_based_layout.js";

const router = express.Router();

// BUDGET INDEX ROUTE

// BUDGET NEW ROUTE

// BUDGET CREATE ROUTE

// BUDGET SHOW ROUTE
router.get(
	"/budgets/:id",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// CHECK OWNERSHIP ASAP
		try {
			const foundBudget = await Budget.findById(req.params.id)
				.populate("postings")
				.exec();
			// FIND BUDGET LENGTH
			let years = 0;
			// CREATE ARRAY TO STORE ANNUAL TOTALS AND POSTINGS
			const postingsArray: {
				year: number;
				postings: ArrayConstructor;
				total: number;
			}[] = [];

			if (foundBudget) {
				// SET YEARS
				for (let i = 0; i < foundBudget.postings.length; i++) {
					// IF YEAR IS LARGER, ADD TO YEARS
					if (foundBudget.postings[i].year > years) {
						years = foundBudget.postings[i].year;
					}
				}
				// SET ARRAY LENGTH
				for (let i = 0; i < years; i++) {
					const year = {
						year: i + 1,
						postings: Array,
						total: 0,
					};
					postingsArray.push(year);
				}
				// CHECK IF COST OR INCOME
				for (let i = 0; i < foundBudget.postings.length; i++) {
					for (let j = 0; j < postingsArray.length; j++) {
						// CHECK IF SAME YEAR
						if (foundBudget.postings[i].year === postingsArray[j].year) {
							// CHECK IF COST OR INCOME
							if (
								foundBudget.postings[i].postType === "labor" ||
								foundBudget.postings[i].postType === "material"
							) {
								postingsArray[j].total -=
									foundBudget.postings[i].value *
									foundBudget.postings[i].amount;
							} else if (
								foundBudget.postings[i].postType === "product" ||
								foundBudget.postings[i].postType === "service"
							) {
								postingsArray[j].total +=
									foundBudget.postings[i].value *
									foundBudget.postings[i].amount;
							}
						}
					}
				}
				res.send({
					budget: foundBudget,
					total: postingsArray,
					years,
				});
			} else {
				console.log("No foundBudget");
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// BUDGET EDIT ROUTE
router.get(
	"/budgets/:id/edit",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			const foundBudget = await Budget.findById(req.params.id);
			res.send({ budget: foundBudget });
		} catch (err) {
			console.log(err);
		}
	},
);

// BUDGET UPDATE ROUTE
router.post(
	"/budgets/:id",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			const updatedBudget = await Budget.findByIdAndUpdate(
				req.params.id,
				req.body.budget,
			);
			if (updatedBudget) {
				res.send(`/budgets/${updatedBudget._id}`);
			} else {
				console.log("No updatedBudget");
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// BUDGET DELETE ROUTE

// PARCEL BUDGET SHOW ROUTE
router.get(
	"/parcels/:id/accounts",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			const foundParcel = await Parcel.findById(req.params.id)
				.populate({
					path: "layers",
					populate: { path: "accounts", populate: { path: "postings" } },
				})
				.exec();
			res.send({ parcel: foundParcel });
		} catch (err) {
			console.log(err);
		}
	},
);

// PARCEL BUDGET

// PROJECT BUDGET NEW ROUTE
router.get(
	"/projects/:id/budgets/new",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		try {
			const foundProject = await Project.findById(req.params.id)
				.populate("system")
				.exec();

			if (foundProject) {
				try {
					const foundSystem = await System.findById(foundProject.system)
						.populate("model.species")
						.exec();

					if (foundSystem) {
						// FIND ALL SPECIES IN SYSTEM
						const allSpecies: ISpeciesSchema[] = [];
						foundSystem.model.forEach((species) => {
							allSpecies.push(species.species);
						});
						// FIND UNIQUE SPECIES / REMOVE DUPLICATES
						const uniqueSpecies = unique(allSpecies);
						res.send({
							project: foundProject,
							species: uniqueSpecies,
						});
					} else {
						console.log("No foundSystem");
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

// PROJECT BUDGET CREATE ROUTE
// router.post(
//   '/projects/:id/budgets',
//   middleware.isLoggedIn,
//   async (req: express.Request & { user?: UserDocument, idToken?: Auth0IDToken }, res: express.Response) => {
//     const foundProject = await Project.findById(req.params.id);
//     const createdBudget = await Budget.create(req.body.budget);

//     if (foundProject) {
//     // BUDGET OWNER
//       createdBudget.owner.id = req.user?._id;
//       createdBudget.save();
//       // SAVE BUDGET TO PROJECT

//       // TODO
//       foundProject.budget = createdBudget;
//       foundProject.save();
//       res.send(`/projects/${foundProject._id}`);
//     }
//   },
// );

// GENERATE NEW PROJECT ESTABLISHMENT BUDGET
router.get(
	"/projects/:id/generateestablishment",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND PROJECT
		try {
			const foundProject = await Project.findById(req.params.id)
				.populate("system")
				.populate({
					path: "rows",
					populate: { path: "sequence", populate: { path: "model.species" } },
				})
				.exec();

			if (foundProject) {
				try {
					const foundSystem = await System.findById(foundProject.system)
						.populate("model.species")
						.exec();

					// FIND ALL SPECIES IN SYSTEM OR ROWS
					const allSpecies: ISpeciesSchema[] = [];
					if (foundProject.rows && foundProject.rows.length > 0) {
						for (let i = 0; i < foundProject.rows.length; i++) {
							if (foundProject.rows[i].sequence) {
								for (
									let j = 0;
									j < foundProject.rows[i].sequence.model.length;
									j++
								) {
									allSpecies.push(
										foundProject.rows[i].sequence.model[j].species,
									);
								}
							}
						}
					} else {
						foundSystem?.model.forEach((species) => {
							if (
								species.species.form === "grass" ||
								species.species.form === "herb"
							) {
								// DO NOTHING XD
							} else {
								allSpecies.push(species.species);
							}
						});
					}
					console.log(`All species length: ${allSpecies.length}`);
					// FIND UNIQUE SPECIES / REMOVE DUPLICATES
					const uniqueSpecies = unique(allSpecies);
					// SEND ARRAY OF SUBTYPES
					const subtypes = ["bed", "plant", "method"];
					res.send({
						project: foundProject,
						species: uniqueSpecies,
						subtypes,
					});
					if (foundProject) {
						try {
							await System.findById(foundProject.system)
								.populate("model.species")
								.exec();
						} catch (err) {
							console.log(err);
						}
					}
				} catch (err) {
					console.log(err);
				}
			} else {
				console.log("No foundProject");
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// GENERATE ESTABLISHMENT BUDGET CREATE ROUTE
router.post(
	"/projects/:id/generateestablishment",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND PROJECT
		try {
			const foundProject = await Project.findById(req.params.id)
				.populate("layer")
				.populate({ path: "system", populate: { path: "model.species" } })
				.populate({
					path: "rows",
					populate: { path: "sequence", populate: { path: "model.species" } },
				})
				.populate({
					path: "areas",
					populate: {
						path: "rotation",
						populate: { path: "model.speciesmix.species" },
					},
				})
				.exec();
			if (foundProject) {
				// CREATE BUDGET AND PLACE IN PROJECT
				// const budget = req.body.budget;
				try {
					const createdBudget = await Budget.create({});
					foundProject.budgets.establishment = createdBudget;
					await foundProject.save();
					// PARSE QUERY
					const speciesPostings: string[] = req.body.speciespostings;
					const speciesPostingsArray: string[][] = [];
					for (let i = 0; i < speciesPostings.length; i++) {
						// REMOVE NONE ONES
						if (!(speciesPostings[i] === "none")) {
							const splitPostings = speciesPostings[i].split(" ");
							speciesPostingsArray.push(splitPostings);
						}
					}
					console.log(speciesPostingsArray);
					// FIND SYSTEM
					try {
						// const foundSystem = await System.findById(foundProject.system)
						//   .populate('model.species')
						//   .exec();
						// SET VARIABLES HERE
						let layout;
						// IF ROWS, DO XXX
						if (foundProject.rows && foundProject.rows.length > 0) {
							// DO ROW LAYOUT
							layout = rowBasedLayout(foundProject);
						} else {
							// DO PARAMETRIC LAYOUT
							layout = systemBasedLayout(foundProject);
						}

						let uniqueSpeciesCount: {
							id: string;
							uniqueCount: number;
						}[] = [];
						let uniqueSpecies: ISpeciesSchema[] = [];
						if (layout.uniqueSpeciesCount) {
							uniqueSpeciesCount = layout.uniqueSpeciesCount;
							uniqueSpecies = layout.uniqueSpecies;
						}
						/// //////////////////
						/// //////////////////
						// FIND SPECIES ACTIVITIES AND CREATE POSTINGS
						const postings: IPostingSchema[] = [];
						// RUN THROUGH ALL POSTINGS
						for (let i = 0; i < speciesPostingsArray.length; i++) {
							for (let j = 0; j < uniqueSpecies.length; j++) {
								// RUN THROUGH ALL ACTIVITIES
								if (speciesPostingsArray[i][0] === uniqueSpecies[j].id) {
									// CREATE THE POSTING HERE AND PUSH
									const posting: any = {
										name: `${uniqueSpecies[j].nameCommon} ${
											uniqueSpecies[j].activities[
												parseInt(speciesPostingsArray[i][1], 10)
											].subtype
										}: ${
											uniqueSpecies[j].activities[
												parseInt(speciesPostingsArray[i][1], 10)
											].name
										}`,
										postType: "material",
										amount: 1,
										value:
											uniqueSpecies[j].activities[
												parseInt(speciesPostingsArray[i][1], 10)
											].price,
										year: 1,
									};
									// SET POSTTYPE DEPENDING ON POSTINGS TYPE
									if (
										uniqueSpecies[j].activities[
											parseInt(speciesPostingsArray[i][1], 10)
										].subtype === "bed" ||
										uniqueSpecies[j].activities[
											parseInt(speciesPostingsArray[i][1], 10)
										].subtype === "method"
									) {
										posting.postType = "labor";
									}
									for (let k = 0; k < uniqueSpeciesCount.length; k++) {
										if (
											uniqueSpecies[j].nameCommon === uniqueSpeciesCount[k].id
										) {
											posting.amount = uniqueSpeciesCount[k].uniqueCount;
										}
									}
									postings.push(posting);

									// console.log(speciesPostingsArray);
									// // FIND SYSTEM
									// System.findById(foundProject.system).populate("model.species").exec(function(err, foundSystem){
									//     if(err){
									//         console.log(err);
									//     } else {
									//         // SET VARIABLES HERE
									//         var layout: any = {};
									//         // IF ROWS, DO XXX
									//         if(foundProject.rows && foundProject.rows.length > 0){
									//             // DO ROW LAYOUT
									//             layout = rowBasedLayout(foundProject);
									//         } else {
									//             // DO PARAMETRIC LAYOUT
									//             layout = systemBasedLayout(foundProject);
									//         }
									//         var uniqueSpeciesCount: any[] = [];
									//         var uniqueSpecies: any[] = [];
									//         if(layout.uniqueSpeciesCount) {
									//             uniqueSpeciesCount = layout.uniqueSpeciesCount;
									//             uniqueSpecies = layout.uniqueSpecies;
									//         }
									//         /////////////////////
									//         /////////////////////
									//         // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
									//         var postings: any[] = [];
									//         // RUN THROUGH ALL POSTINGS
									//         for(let i=0;i<speciesPostingsArray.length;i++){
									//             for(let j=0;j<uniqueSpecies.length;j++){
									//                 // RUN THROUGH ALL ACTIVITIES
									//                 if(speciesPostingsArray[i][0] === uniqueSpecies[j].id){
									//                     // CREATE THE POSTING HERE AND PUSH
									//                     var posting: any = {
									//                         name:  uniqueSpecies[j].nameCommon + " " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype + ": " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].name,
									//                         postType: "material",
									//                         amount: 1,
									//                         value: uniqueSpecies[j].activities[speciesPostingsArray[i][1]].price,
									//                         year: 1
									//                     };
									//                     // SET POSTTYPE DEPENDING ON POSTINGS TYPE
									//                     if(uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "bed" || uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "method"){
									//                         posting.postType = "labor";
									//                     }
									//                     for(let k=0;k<uniqueSpeciesCount.length;k++){
									//                         if(uniqueSpecies[j].nameCommon === uniqueSpeciesCount[k].id){
									//                             posting.amount = uniqueSpeciesCount[k].uniqueCount;
									//                         }
									//                     }
									//                     postings.push(posting);
									//                 }
									//             }
									//         }
									//         console.log(postings);
									//         // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?!

									//         // CREATE POSTINGS
									//         Posting.insertMany(postings, function(err, createdPostings){
									//             if(err){
									//                 console.log(err);
									//             } else {
									//                 // ADD POSTINGS TO BUDGET
									//                 Budget.findByIdAndUpdate(createdBudget._id, { $push: { postings: { $each: createdPostings } } }, function(err, updatedBudget){
									//                     if(err){
									//                         console.log(err);
									//                     } else {
									//                         console.log("Postings added to budget");
									//                         res.send("/projects/" + foundProject._id);
									//                     }
									//                 });
									//             }
									//         });
									//     }
									// });
								}
							}
						}
						console.log(postings);
						// SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?!

						// CREATE POSTINGS
						try {
							const createdPostings = await Posting.insertMany(postings);
							try {
								await Budget.findByIdAndUpdate(createdBudget._id, {
									$push: { postings: { $each: createdPostings } },
								});
								console.log("Postings added to budget");
								res.send(`/projects/${foundProject._id}`);
							} catch (err) {
								console.log(err);
							}
						} catch (err) {
							console.log(err);
						}
					} catch (err) {
						console.log(err);
					}
				} catch (err) {
					console.log(err);
				}
			} else {
				console.log("No foundProject");
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// GENERATE NEW PROJECT CASH-FLOW BUDGET
router.get(
	"/projects/:id/generatemanagement",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND PROJECT
		try {
			const foundProject = await Project.findById(req.params.id)
				.populate({
					path: "rows",
					populate: { path: "sequence", populate: { path: "model.species" } },
				})
				.populate({
					path: "areas",
					populate: {
						path: "rotation",
						populate: { path: "model.speciesmix.species" },
					},
				})
				.exec();
			if (foundProject) {
				// FIND SYSTEM
				try {
					const foundSystem = await System.findById(foundProject.system)
						.populate("model.species")
						.exec();
					// FIND ALL SPECIES IN SYSTEM OR ROWS
					const allSpecies: ISpeciesSchema[] = [];
					if (foundProject.rows && foundProject.rows.length > 0) {
						for (let i = 0; i < foundProject.rows.length; i++) {
							if (foundProject.rows[i].sequence) {
								for (
									let j = 0;
									j < foundProject.rows[i].sequence.model.length;
									j++
								) {
									allSpecies.push(
										foundProject.rows[i].sequence.model[j].species,
									);
								}
							}
						}
						if (foundProject.areas && foundProject.areas.length > 0) {
							for (let i = 0; i < foundProject.areas.length; i++) {
								if (foundProject.areas[i].rotation) {
									for (
										let j = 0;
										j < foundProject.areas[i].rotation.model.length;
										j++
									) {
										for (
											let k = 0;
											k <
											foundProject.areas[i].rotation.model[j].speciesmix.length;
											k++
										) {
											allSpecies.push(
												foundProject.areas[i].rotation.model[j].speciesmix[k]
													.species,
											);
										}
									}
								}
							}
						}
					} else {
						foundSystem?.model.forEach((species) => {
							allSpecies.push(species.species);
						});
					}
					console.log(`All species length: ${allSpecies.length}`);
					// FIND UNIQUE SPECIES / REMOVE DUPLICATES
					const uniqueSpecies = unique(allSpecies);
					// SEND ARRAY OF SUBTYPES
					const subtypes = ["compost", "pruning", "weedcontrol", "harvest"];
					res.send({
						project: foundProject,
						species: uniqueSpecies,
						subtypes,
					});
				} catch (err) {
					console.log(err);
				}
			} else {
				console.log("No foundProject");
			}
		} catch (err) {
			console.log(err);
		}
	},
);

// GENERATE CASH-FLOW BUDGET CREATE ROUTE
router.post(
	"/projects/:id/generatemanagement",
	middleware.isLoggedIn,
	async (
		req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
		res: express.Response,
	) => {
		// FIND PROJECT
		try {
			const foundProject = await Project.findById(req.params.id)
				.populate("layer")
				.populate({
					path: "system",
					populate: { path: "model.species", populate: { path: "flows" } },
				})
				.populate({
					path: "rows",
					populate: {
						path: "sequence",
						populate: { path: "model.species", populate: { path: "flows" } },
					},
				})
				.populate({
					path: "areas",
					populate: {
						path: "rotation",
						populate: {
							path: "model.speciesmix.species",
							populate: { path: "flows" },
						},
					},
				})
				.exec();

			if (foundProject) {
				// CREATE BUDGET AND PLACE IN PROJECT
				const budget = req.body.budget;
				try {
					const createdBudget = await Budget.create(budget);
					foundProject.budgets.management = createdBudget;
					await foundProject.save();
					// PARSE QUERY
					const speciesPostings: string[] = req.body.speciespostings;
					const speciesPostingsArray: string[][] = [];
					for (let i = 0; i < speciesPostings.length; i++) {
						// REMOVE NONE ONES
						if (!(speciesPostings[i] === "none")) {
							const splitPostings = speciesPostings[i].split(" ");
							speciesPostingsArray.push(splitPostings);
						}
					}
					console.log(speciesPostingsArray);
					// FIND SYSTEM
					try {
						// const foundSystem = await System.findById(foundProject.system)
						//   .populate({
						//     path: 'model.species',
						//     populate: { path: 'flows' },
						//   })
						//   .exec();
						let layout;
						// IF ROWS, DO XXX
						if (foundProject.rows && foundProject.rows.length > 0) {
							// DO ROW LAYOUT
							layout = rowBasedLayout(foundProject);
						} else {
							// DO PARAMETRIC LAYOUT
							layout = systemBasedLayout(foundProject);
						}
						let uniqueSpeciesCount: {
							id: string;
							uniqueCount: number;
						}[] = [];
						let uniqueSpecies: ISpeciesSchema[] = [];
						if (layout.uniqueSpeciesCount) {
							uniqueSpeciesCount = layout.uniqueSpeciesCount;
							uniqueSpecies = layout.uniqueSpecies;
						}
						/// //////////////////
						/// //////////////////
						// FIND SPECIES ACTIVITIES AND CREATE POSTINGS
						const postings: IPostingSchema[] = [];
						const period = req.body.period;
						// FIND UNIQUE AREA SPECIES
						const uniqueAreaSpecies: ISpeciesSchema[] = [];
						// AREA SIZES IN PERIOD BASED ON AREAS AND SPECIES IN ROTATIONS
						const areaArray = layout.alleyPolygonArray;
						const areaSpeciesRotation: ISpeciesSchema[][] =
							layout.alleySpeciesArray;
						const speciesPeriodAreaArray: {
							id: any;
							count: number;
						}[][] = [];
						for (let i = 0; i < period; i++) {
							const countArray: {
								id: any;
								count: number;
							}[] = [];
							for (let j = 0; areaArray.length > j; j++) {
								for (let k = 0; k < areaSpeciesRotation[j].length; k++) {
									console.log(
										`rotation length: ${areaSpeciesRotation[j].length}`,
									);
									console.log(`rotation check${(i + 1) % (k + 1)}`);
									// CHECK IF YEAR IS IN ROTATION
									if (
										(i + areaSpeciesRotation[j].length) %
											areaSpeciesRotation[j].length ===
										k
									) {
										uniqueAreaSpecies.push(areaSpeciesRotation[j][k]);
										let count = 0;
										for (let l = 0; l < countArray.length; l++) {
											if (areaSpeciesRotation[j][k] === countArray[l].id) {
												countArray[l].count += area(areaArray[j]);
												count += 1;
											}
										}
										if (count < 1) {
											const speciesArea = {
												id: areaSpeciesRotation[j][k],
												count: area(areaArray[j]),
											};
											countArray.push(speciesArea);
										}
									}

									// console.log(speciesPostingsArray);
									// // FIND SYSTEM
									// System.findById(foundProject.system).populate({path:'model.species',populate:{path:'flows'}}).exec(function(err, foundSystem){
									//     if(err){
									//         console.log(err);
									//     } else {
									//         // UNIQUE SPECIES
									//         var layout: any = {};
									//         // IF ROWS, DO XXX
									//         if(foundProject.rows && foundProject.rows.length > 0){
									//             // DO ROW LAYOUT
									//             layout = rowBasedLayout(foundProject);
									//         } else {
									//             // DO PARAMETRIC LAYOUT
									//             layout = systemBasedLayout(foundProject);
									//         }
									//         var uniqueSpeciesCount: any[] = [];
									//         var uniqueSpecies: any[] = [];
									//         if(layout.uniqueSpeciesCount) {
									//             uniqueSpeciesCount = layout.uniqueSpeciesCount;
									//             uniqueSpecies = layout.uniqueSpecies;
									//         }
									//         /////////////////////
									//         /////////////////////
									//         // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
									//         var postings: any[] = [];
									//         var period = req.body.period;
									//         // FIND UNIQUE AREA SPECIES
									//         var uniqueAreaSpecies: any[] = [];
									//         // AREA SIZES IN PERIOD BASED ON AREAS AND SPECIES IN ROTATIONS
									//         var areaArray = layout.alleyPolygonArray;
									//         var areaSpeciesRotation = layout.alleySpeciesArray;
									//         var speciesPeriodAreaArray: any[] = [];
									//         for(let i=0;i<period;i++){
									//             var countArray: any[] = [];
									//             for(let j=0;areaArray.length > j;j++){
									//                 for(let k = 0; k < areaSpeciesRotation[j].length; k++){
									//                     console.log("rotation length: " + areaSpeciesRotation[j].length);
									//                     console.log("rotation check" + ((i+1) % (k+1)));
									//                     // CHECK IF YEAR IS IN ROTATION
									//                     if((i+areaSpeciesRotation[j].length) % (areaSpeciesRotation[j].length) === k){
									//                         uniqueAreaSpecies.push(areaSpeciesRotation[j][k]);
									//                         var count = 0;
									//                         for(let l=0;l<countArray.length;l++){
									//                             if(areaSpeciesRotation[j][k] === countArray[l].id){
									//                                 countArray[l].count = countArray[l].count + area(areaArray[j]);
									//                                 count = count + 1;
									//                             }
									//                         }
									//                         if(count < 1){
									//                             let speciesArea = {
									//                                 id: areaSpeciesRotation[j][k],
									//                                 count: area(areaArray[j])
									//                             };
									//                             countArray.push(speciesArea);
									//                         }
									//                     }
									//                 }
									//             }
									//             speciesPeriodAreaArray.push(countArray);
									//         }
									//         console.log("Species area count " + speciesPeriodAreaArray[1][0].count);
									//         console.log("Species area species " + speciesPeriodAreaArray[1][0].id);
									//         console.log("Species area first year length " + speciesPeriodAreaArray[1].length);
									//         // UNIQUE AREA SPECIES
									//         var uniqueAreaSpeciesSorted = unique(uniqueAreaSpecies);
									//         console.log("Unique area species " + uniqueAreaSpeciesSorted.length);
									//         // RUN THROUGH ALL POSTINGS
									//         for(let i=0;i<speciesPostingsArray.length;i++){
									//             for(let j=0;j<uniqueSpecies.length;j++){
									//                 // RUN THROUGH ALL ACTIVITIES
									//                 if(speciesPostingsArray[i][0] === uniqueSpecies[j].id){
									//                     // ITERATE FOR EACH YEAR
									//                     for(let k=0;k<period;k++){
									//                         // CREATE THE POSTING HERE AND PUSH
									//                         var posting: any = {
									//                             name:  uniqueSpecies[j].nameCommon + " " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype + ": " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].name,
									//                             postType: "material",
									//                             amount: 1,
									//                             value: uniqueSpecies[j].activities[speciesPostingsArray[i][1]].price,
									//                             year: k + 1
									//                         };
									//                         // SET POSTTYPE DEPENDING ON POSTINGS TYPE
									//                         if(uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "pruning" || uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "harvest"){
									//                             posting.postType = "labor";
									//                         }
									//                         for(let l=0;l<uniqueSpeciesCount.length;l++){
									//                             if(uniqueSpecies[j].nameCommon === uniqueSpeciesCount[l].id){
									//                                 posting.amount = uniqueSpeciesCount[l].uniqueCount;
									//                             }
									//                         }
									//                         // CHECK ROTATION HERE FOR SPECIES AREA SIZES -
									//                         // JUST CHECK EACH AREA
									//                         // ADD TO COUNTER
									//                         // THEN SET AMOUNT TO COUNTER

									//                         postings.push(posting);
									//                     }
									//                 }
									//             }
									//         }
									//         console.log(postings.length + " postings excluding yields");
									//         // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?! CHECK FOR EACH YEAR?!

									//         // CREATE POSTINGS FOR YIELDS ;)
									//         for(let i=0;i<uniqueSpecies.length;i++){
									//             // CYCLE THROUGH ALL YEARS
									//             for(let j=0;j<period;j++) {
									//                 // CREATE YIELD POSTING
									//                 var posting: any = {
									//                     name: uniqueSpecies[i].nameCommon + " yields",
									//                     postType: "product",
									//                     amount: 0,
									//                     value: 1,
									//                     year: j + 1
									//                 };
									//                 if(uniqueSpecies[i].flows && uniqueSpecies[i].flows.length > 0 && uniqueSpecies[i].flows[0].unit === "food" && (uniqueSpecies[i].flows[0].data.length >= (j+1))){
									//                     for(let k=0;k<uniqueSpeciesCount.length;k++){
									//                         if(uniqueSpecies[i].nameCommon === uniqueSpeciesCount[k].id){
									//                             posting.amount = uniqueSpeciesCount[k].uniqueCount * uniqueSpecies[i].flows[0].data[j];
									//                         }
									//                     }
									//                     /*for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
									//                         if(uniqueSpecies[i].nameCommon === speciesPeriodAreaArray[j][k].id){
									//                             posting.amount = speciesPeriodAreaArray[j][k].count * uniqueSpecies[i].flows[0].data[j];
									//                         }
									//                     }*/
									//                 }
									//                 // DO IF AREA SIZE HERE TO CHECK WITH ROTATION. OK TO HAVE IT HERE SINCE IT OVERWRITE ABOVE FLOWS?

									//                 // ADD TO POSTINGS
									//                 postings.push(posting);
									//             }
									//         }
									//         // AREA YIELDS
									//         for(let i=0;i<uniqueAreaSpeciesSorted.length;i++){
									//             // CYCLE THROUGH ALL YEARS
									//             for(let j=0;j<period;j++) {
									//                 // CREATE YIELD POSTING
									//                 var posting:any = {
									//                     name: uniqueAreaSpeciesSorted[i].nameCommon + " yields",
									//                     postType: "product",
									//                     amount: 0,
									//                     value: 1,
									//                     year: j + 1
									//                 };
									//                 if(uniqueAreaSpeciesSorted[i].flows && uniqueAreaSpeciesSorted[i].flows.length > 0 && uniqueAreaSpeciesSorted[i].flows[0].unit === "food"){
									//                     for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
									//                         if(uniqueAreaSpeciesSorted[i].nameCommon === speciesPeriodAreaArray[j][k].id.nameCommon){
									//                             posting.amount = Math.round(speciesPeriodAreaArray[j][k].count * uniqueAreaSpeciesSorted[i].flows[0].data[0]);
									//                         }
									//                     }
									//                 }
									//                 // ADD TO POSTINGS
									//                 postings.push(posting);
									//             }
									//         }
									//         console.log(postings.length + " postings including yields");
									//         // POSTINGS FOR AREAS SIZES?

									//         // CREATE POSTINGS
									//         Posting.insertMany(postings, function(err, createdPostings){
									//             if(err){
									//                 console.log(err);
									//             } else {
									//                 // ADD POSTINGS TO BUDGET
									//                 Budget.findByIdAndUpdate(createdBudget._id, { $push: { postings: { $each: createdPostings } } }, function(err, updatedBudget){
									//                     if(err){
									//                         console.log(err);
									//                     } else {
									//                         console.log("Postings added to budget");
									//                         res.send("/projects/" + foundProject._id);
									//                     }
									//                 });
									//             }
									//         });
									//     }
									// });
								}
							}
							speciesPeriodAreaArray.push(countArray);
						}
						console.log(
							`Species area count ${speciesPeriodAreaArray[1][0].count}`,
						);
						console.log(
							`Species area species ${speciesPeriodAreaArray[1][0].id}`,
						);
						console.log(
							`Species area first year length ${speciesPeriodAreaArray[1].length}`,
						);
						// UNIQUE AREA SPECIES
						const uniqueAreaSpeciesSorted = unique(uniqueAreaSpecies);
						console.log(
							`Unique area species ${uniqueAreaSpeciesSorted.length}`,
						);
						// RUN THROUGH ALL POSTINGS
						for (let i = 0; i < speciesPostingsArray.length; i++) {
							for (let j = 0; j < uniqueSpecies.length; j++) {
								// RUN THROUGH ALL ACTIVITIES
								if (speciesPostingsArray[i][0] === uniqueSpecies[j].id) {
									// ITERATE FOR EACH YEAR
									for (let k = 0; k < period; k++) {
										// CREATE THE POSTING HERE AND PUSH
										const posting: any = {
											name: `${uniqueSpecies[j].nameCommon} ${
												uniqueSpecies[j].activities[
													parseInt(speciesPostingsArray[i][1], 10)
												].subtype
											}: ${
												uniqueSpecies[j].activities[
													parseInt(speciesPostingsArray[i][1], 10)
												].name
											}`,
											postType: "material",
											amount: 1,
											value:
												uniqueSpecies[j].activities[
													parseInt(speciesPostingsArray[i][1], 10)
												].price,
											year: k + 1,
										};
										// SET POSTTYPE DEPENDING ON POSTINGS TYPE
										if (
											uniqueSpecies[j].activities[
												parseInt(speciesPostingsArray[i][1], 10)
											].subtype === "pruning" ||
											uniqueSpecies[j].activities[
												parseInt(speciesPostingsArray[i][1], 10)
											].subtype === "harvest"
										) {
											posting.postType = "labor";
										}
										for (let l = 0; l < uniqueSpeciesCount.length; l++) {
											if (
												uniqueSpecies[j].nameCommon === uniqueSpeciesCount[l].id
											) {
												posting.amount = uniqueSpeciesCount[l].uniqueCount;
											}
										}
										// CHECK ROTATION HERE FOR SPECIES AREA SIZES -
										// JUST CHECK EACH AREA
										// ADD TO COUNTER
										// THEN SET AMOUNT TO COUNTER

										postings.push(posting);
									}
								}
							}
						}
						console.log(`${postings.length} postings excluding yields`);
						// SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?! CHECK FOR EACH YEAR?!

						// CREATE POSTINGS FOR YIELDS ;)
						for (let i = 0; i < uniqueSpecies.length; i++) {
							// CYCLE THROUGH ALL YEARS
							for (let j = 0; j < period; j++) {
								// CREATE YIELD POSTING
								const posting: any = {
									name: `${uniqueSpecies[i].nameCommon} yields`,
									postType: "product",
									amount: 0,
									value: 1,
									year: j + 1,
								};
								if (
									uniqueSpecies[i].flows &&
									uniqueSpecies[i].flows.length > 0 &&
									uniqueSpecies[i].flows[0].unit === "food" &&
									uniqueSpecies[i].flows[0].data.length >= j + 1
								) {
									for (let k = 0; k < uniqueSpeciesCount.length; k++) {
										if (
											uniqueSpecies[i].nameCommon === uniqueSpeciesCount[k].id
										) {
											posting.amount =
												uniqueSpeciesCount[k].uniqueCount *
												uniqueSpecies[i].flows[0].data[j];
										}
									}
									/* for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
                                 if(uniqueSpecies[i].nameCommon === speciesPeriodAreaArray[j][k].id){
                                     posting.amount = speciesPeriodAreaArray[j][k].count * uniqueSpecies[i].flows[0].data[j];
                                 }
                             } */
								}
								// DO IF AREA SIZE HERE TO CHECK WITH ROTATION. OK TO HAVE IT HERE SINCE IT OVERWRITE ABOVE FLOWS?

								// ADD TO POSTINGS
								postings.push(posting);
							}
						}
						// AREA YIELDS
						for (let i = 0; i < uniqueAreaSpeciesSorted.length; i++) {
							// CYCLE THROUGH ALL YEARS
							for (let j = 0; j < period; j++) {
								// CREATE YIELD POSTING
								const posting: any = {
									name: `${uniqueAreaSpeciesSorted[i].nameCommon} yields`,
									postType: "product",
									amount: 0,
									value: 1,
									year: j + 1,
								};
								if (
									uniqueAreaSpeciesSorted[i].flows &&
									uniqueAreaSpeciesSorted[i].flows.length > 0 &&
									uniqueAreaSpeciesSorted[i].flows[0].unit === "food"
								) {
									for (let k = 0; k < speciesPeriodAreaArray[j].length; k++) {
										if (
											uniqueAreaSpeciesSorted[i].nameCommon ===
											speciesPeriodAreaArray[j][k].id.nameCommon
										) {
											posting.amount = Math.round(
												speciesPeriodAreaArray[j][k].count *
													uniqueAreaSpeciesSorted[i].flows[0].data[0],
											);
										}
									}
								}
								// ADD TO POSTINGS
								postings.push(posting);
							}
						}
						console.log(`${postings.length} postings including yields`);
						// POSTINGS FOR AREAS SIZES?

						// CREATE POSTINGS
						try {
							const createdPostings = await Posting.insertMany(postings);
							// ADD POSTINGS TO BUDGET
							try {
								await Budget.findByIdAndUpdate(createdBudget._id, {
									$push: { postings: { $each: createdPostings } },
								});
								console.log("Postings added to budget");
								res.send(`/projects/${foundProject._id}`);
							} catch (err) {
								console.log(err);
							}
						} catch (err) {
							console.log(err);
						}
					} catch (err) {
						console.log(err);
					}
				} catch (err) {
					console.log(err);
				}
			} else {
				console.log("No foundProject");
			}
		} catch (err) {
			console.log(err);
		}
	},
);

export default router;

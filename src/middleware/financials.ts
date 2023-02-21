import gisObj, { rowBasedLayout, systemBasedLayout } from '../middleware/gis'
import area from '@turf/area'
import unique from 'array-unique';
import { IProjectSchema } from "../models/project";
import _ from 'lodash';
import activity from '../models/activity';

// DYNAMIC ESTABLISHMENT BUDGET
export function establishment(project: IProjectSchema) {
  // DEFINE OBJECT FOR POSTINGS
  var postings: any[] = [];
  // GET SYSTEM LAYOUT FROM PROJECT
  var layout: any = {};
  // IF ROWS, DO XXX
  if (project.rows && project.rows.length > 0) {
    // DO ROW LAYOUT
    layout = gisObj.rowBasedLayout(project);


    project.rows.forEach((row, rowIdx) => {

      const trees = _.filter(layout.treeAssetArray, { rowRef: rowIdx });

      // console.log(`row ${rowIdx} has:`, trees)

      trees.forEach((tree, treeIdx) => {

        const speciesWithActivities = row.sequence.uniqueSpecies.find(uniqueSpecies => {
          // console.log(uniqueSpecies.id.toString(), tree.species)
          return uniqueSpecies.id.toString() === tree.species
        })


        if (speciesWithActivities && speciesWithActivities.activities && speciesWithActivities.activities.length > 0) {
          speciesWithActivities.activities.forEach((activity, activityIdx) => {

            // console.log("hello");
            // console.log(project.system.model[j].activities[k].activityType);
            if (
              activity.activityType === "establish"
            ) {
              // IF ESTABLISHMENT THEN ADD TO POSTINGS
              // console.log(project.system.model[j].activities[k].name);
              // INSERT SPECIES ID AND INDEX OF ACTIVITY ON SPECIES IN SPECIESPOSTINGSARRAY
              var postingint: any = {
                name:
                  `${tree.name} ${activity.subtype}: ${activity.name}`,
                postType: "material",
                amount: 1,
                value: activity.price,
                year: 1,
              };
              // SET POSTTYPE DEPENDING ON POSTINGS TYPE
              if (
                activity.subtype === "bed" ||
                activity.subtype === "method"
              ) {
                postingint.postType = "labor";
              }


// plant
// method
// pruning
// harvest

              // postingint.amount = activity.price;

              postings.push(postingint);
            }

          })
        }



      })

      // row.sequence.uniqueSpecies


    })

    // console.log('rows', JSON.stringify(project.rows[0]))
    // console.log('rows', JSON.stringify(project.rows[0]))

    // console.log('layout', JSON.stringify(layout))

    // console.log('postings', postings)

  } else {
    // DO PARAMETRIC LAYOUT
    layout = gisObj.systemBasedLayout(project);

    // GET SPECIES COUNT ARRAY
    var uniqueSpeciesCount: any[] = [];
    var uniqueSpecies: any[] = [];
    if (layout.uniqueSpeciesCount) {
      uniqueSpeciesCount = layout.uniqueSpeciesCount;
      uniqueSpecies = layout.uniqueSpecies;
    }
    // RUN THROUGH UNIQUE SPECIES AND CHECK IF ACTIVITIES ARE SPECIFIED

    for (let i = 0; i < uniqueSpecies.length; i++) {

      if (
        project.system.uniqueSpecies[i].activities &&
        project.system.uniqueSpecies[i].activities.length > 0
      ) {
        for (let k = 0; k < project.system.uniqueSpecies[i].activities.length; k++) {
          // console.log("hello");
          // console.log(project.system.model[j].activities[k].activityType);
          if (
            project.system.uniqueSpecies[i].activities[k].activityType === "establish"
          ) {
            // IF ESTABLISHMENT THEN ADD TO POSTINGS
            // console.log(project.system.model[j].activities[k].name);
            // INSERT SPECIES ID AND INDEX OF ACTIVITY ON SPECIES IN SPECIESPOSTINGSARRAY
            var postingint: any = {
              name:
                `${uniqueSpecies[i].nameCommon} ${project.system.uniqueSpecies[i].activities[k].subtype}: ${project.system.uniqueSpecies[i].activities[k].name}`,
              postType: "material",
              amount: 1,
              value: 2,
              year: 1,
            };
            // SET POSTTYPE DEPENDING ON POSTINGS TYPE
            if (
              project.system.uniqueSpecies[i].activities[k].subtype === "bed" ||
              project.system.uniqueSpecies[i].activities[k].subtype === "method"
            ) {
              postingint.postType = "labor";
            }
            for (let l = 0; l < uniqueSpeciesCount.length; l++) {
              if (uniqueSpecies[i].nameCommon === uniqueSpeciesCount[l].id) {
                postingint.amount = uniqueSpeciesCount[l].uniqueCount;
              }
            }
            postings.push(postingint);
          }
        }

      }
    }


  }



  // DEFINE ESTABLISHMENT BUDGET TOTAL
  let total = 0;
  // CALCULATE TOTAL PRICE
  for (let i = 0; i < postings.length; i++) {
    total += postings[i].amount * postings[i].value;
  }

  return { postings, total };
}

// DYNAMIC CASH-FLOW BUDGET
export function management(project: IProjectSchema) {
  // DEFINE OBJECT FOR POSTINGS
  var postings: any[] = [];
  // UNIQUE SPECIES
  var layout: any = {};

  // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
  var period = project.financial.period;

  // IF ROWS, DO XXX
  if (project.rows && project.rows.length > 0) {
    // DO ROW LAYOUT
    layout = gisObj.rowBasedLayout(project);



    for (let j = 0; j < period; j++) {

      project.rows.forEach((row, rowIdx) => {

        const trees = _.filter(layout.treeAssetArray, { rowRef: rowIdx });

        // console.log(`row ${rowIdx} has:`, trees)

        trees.forEach((tree, treeIdx) => {

          const speciesWithActivities = row.sequence.uniqueSpecies.find(uniqueSpecies => {
            // console.log(uniqueSpecies.id.toString(), tree.species)
            return uniqueSpecies.id.toString() === tree.species
          })


          if (speciesWithActivities && speciesWithActivities.activities && speciesWithActivities.activities.length > 0) {
            speciesWithActivities.activities.forEach((activity, activityIdx) => {

              // console.log("hello");
              // console.log(project.system.model[j].activities[k].activityType);
              if (
                activity.activityType === "manage"
              ) {
                // IF ESTABLISHMENT THEN ADD TO POSTINGS
                // console.log(project.system.model[j].activities[k].name);
                // INSERT SPECIES ID AND INDEX OF ACTIVITY ON SPECIES IN SPECIESPOSTINGSARRAY
                var postingint: any = {
                  name:
                    `${tree.name} ${activity.subtype}: ${activity.name}`,
                  postType: "material",
                  amount: 1,
                  value: -activity.price,
                  year: 1+j,
                };
                // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                if (
                  activity.subtype === "pruning" ||
                  activity.subtype === "harvest"
                ) {
                  postingint.postType = "labor";
                }

                // postingint.amount = activity.price;

                postings.push(postingint);
              }

            })
          }



        })

        // row.sequence.uniqueSpecies


      })

    }




    // FIND UNIQUE AREA SPECIES
    var uniqueAreaSpecies: any[] = [];
    // AREA SIZES IN PERIOD BASED ON AREAS AND SPECIES IN ROTATIONS
    var areaArray = layout.alleyPolygonArray;
    var areaSpeciesRotation = layout.alleySpeciesArray;
    var speciesPeriodAreaArray: any[] = [];
    for (let i = 0; i < period; i++) {
      var countArray: any[] = [];
      for (let j = 0; areaArray.length > j; j++) {
        for (let k = 0; k < areaSpeciesRotation[j].length; k++) {
          /*        console.log('rotation length: ' + areaSpeciesRotation[j].length)
          console.log('rotation check' + ((i + 1) % (k + 1)))*/
          // CHECK IF YEAR IS IN ROTATION
          if (
            (i + areaSpeciesRotation[j].length) %
            areaSpeciesRotation[j].length ===
            k
          ) {
            uniqueAreaSpecies.push(areaSpeciesRotation[j][k]);
            var count = 0;
            for (let l = 0; l < countArray.length; l++) {
              if (areaSpeciesRotation[j][k] === countArray[l].id) {
                countArray[l].count = countArray[l].count + area(areaArray[j]);
                count = count + 1;
              }
            }
            if (count < 1) {
              let speciesArea = {
                id: areaSpeciesRotation[j][k],
                count: area(areaArray[j]),
              };
              countArray.push(speciesArea);
            }
          }
        }
      }
      speciesPeriodAreaArray.push(countArray);
    }
    // UNIQUE AREA SPECIES
    var uniqueAreaSpeciesSorted = [...new Set(uniqueAreaSpecies)];
    // AREA YIELDS
    for (let i = 0; i < uniqueAreaSpeciesSorted.length; i++) {
      // CYCLE THROUGH ALL YEARS
      for (let j = 0; j < period; j++) {
        // CREATE YIELD POSTING
        var posting: any = {
          name: `${uniqueAreaSpeciesSorted[i].nameCommon} yields`,
          postType: "product",
          amount: 1,
          value: 10,
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

    // TODO: Row based tree yields
    // CREATE POSTINGS FOR TREE YIELDS ;)
    
    // CYCLE THROUGH ALL YEARS
    for (let j = 0; j < period; j++) {

      project.rows.forEach((row, rowIdx) => {

        const trees = _.filter(layout.treeAssetArray, { rowRef: rowIdx });

        // console.log(`row ${rowIdx} has:`, trees)

        trees.forEach((tree, treeIdx) => {


          const species = row.sequence.model.find(species => {
            // console.log(uniqueSpecies.id.toString(), tree.species)
            return species.species.id.toString() === tree.species
          })?.species
          // console.log("HERE")
          // console.log(species)

          

    //       // for (let i = 0; i < uniqueSpecies.length; i++) {
    //           // CREATE YIELD POSTING

    //           console.log('here')
              var posting: any = {
                name: `${species?.nameCommon} yields`,
                postType: "product",
                amount: 1,
                value: species?.price ?? 0,
                year: j + 1,
              };


    //           // if (
    //           //   species?.flows &&
    //           //   species?.flows.length > 0 &&
    //           //   species?.flows[0].unit === "food" &&
    //           //   species?.flows[0].data.length >= j + 1
    //           // ) {
    //             // for (let k = 0; k < uniqueSpeciesCount.length; k++) {
    //               // if (species?.nameCommon === uniqueSpeciesCount[k].id) {
    //               //   posting.amount =
    //               //     uniqueSpeciesCount[k].uniqueCount *
    //               //     species?.flows[0].data[j];
    //               // }
    //             // }
    //           // }
      
    //           // ADD TO POSTINGS

    console.log(posting)
              postings.push(posting);
    //         // }



            
        })
      })
    

    }



  } else {
    // DO PARAMETRIC LAYOUT
    layout = gisObj.systemBasedLayout(project);

    var uniqueSpeciesCount: any[] = [];
    var uniqueSpecies: any[] = [];
    if (layout.uniqueSpeciesCount) {
      uniqueSpeciesCount = layout.uniqueSpeciesCount;
      uniqueSpecies = layout.uniqueSpecies;
    }


    // ACTIVITY POSTINGS
    for (let i = 0; i < uniqueSpecies.length; i++) {
      // CHECK ALL ACTIVITIES FOR MATCH
      // console.log(project.system.model.length);

      // CHECK IF SPECIES IN MODEL AND UNIQUE IS THE SAME

      if (
        project.system.uniqueSpecies[i].activities &&
        project.system.uniqueSpecies[i].activities.length > 0
      ) {
        for (let k = 0; k < project.system.uniqueSpecies[i].activities.length; k++) {
          // console.log("hello");
          // console.log(project.system.model[j].activities[k].activityType);
          if (
            project.system.uniqueSpecies[i].activities[k].activityType === "manage"
          ) {
            // IF ESTABLISHMENT THEN ADD TO POSTINGS
            // console.log(project.system.model[j].activities[k].name);
            // RUN THROUGH EACH YEAR
            for (let m = 0; m < period; m++) {
              var postingint: any = {
                name: `${uniqueSpecies[i].nameCommon} ${project.system.uniqueSpecies[i].activities[k].subtype}: ${project.system.uniqueSpecies[i].activities[k].name}`,
                postType: "material",
                amount: 1,
                value: -1,
                year: 1 + m,
              };
              // SET POSTTYPE DEPENDING ON POSTINGS TYPE
              if (
                project.system.uniqueSpecies[i].activities[k].subtype === "pruning" ||
                project.system.uniqueSpecies[i].activities[k].subtype === "harvest"
              ) {
                postingint.postType = "labor";
              }
              for (let l = 0; l < uniqueSpeciesCount.length; l++) {
                if (
                  uniqueSpecies[i].nameCommon === uniqueSpeciesCount[l].id
                ) {
                  postingint.amount = uniqueSpeciesCount[l].uniqueCount;
                }
              }
              postings.push(postingint);
            }
          }
        }
      }
    }


    // console.log(`${postings.length} postings excluding yields`);
    // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?! CHECK FOR EACH YEAR?!

    // CREATE POSTINGS FOR TREE YIELDS ;)
    for (let i = 0; i < uniqueSpecies.length; i++) {
      // CYCLE THROUGH ALL YEARS
      for (let j = 0; j < period; j++) {
        // CREATE YIELD POSTING
        var posting: any = {
          name: `${uniqueSpecies[i].nameCommon} yields`,
          postType: "product",
          amount: 1,
          value: 340,
          year: j + 1,
        };
        if (
          uniqueSpecies[i].flows &&
          uniqueSpecies[i].flows.length > 0 &&
          uniqueSpecies[i].flows[0].unit === "food" &&
          uniqueSpecies[i].flows[0].data.length >= j + 1
        ) {
          for (let k = 0; k < uniqueSpeciesCount.length; k++) {
            if (uniqueSpecies[i].nameCommon === uniqueSpeciesCount[k].id) {
              posting.amount =
                uniqueSpeciesCount[k].uniqueCount *
                uniqueSpecies[i].flows[0].data[j];
            }
          }
          // for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
          //             if(uniqueSpecies[i].nameCommon === speciesPeriodAreaArray[j][k].id){
          //                 posting.amount = speciesPeriodAreaArray[j][k].count * uniqueSpecies[i].flows[0].data[j];
          //             }
          //         }
        }
        // DO IF AREA SIZE HERE TO CHECK WITH ROTATION. OK TO HAVE IT HERE SINCE IT OVERWRITE ABOVE FLOWS?

        // ADD TO POSTINGS
        postings.push(posting);
      }
    }

  }



  // CREATE ADDITIONAL POSTINGS FOR AREA SIZES???
  // console.log(`${postings.length} postings including yields`);
  const totals: any[] = [];
  // GENERATE INDEXES WITH 0 AND FILL YoY TOTALS
  for (let j = 0; j < period; j++) {
    var totalCount = 0;
    for (let k = 0; k < postings.length; k++) {
      if (postings[k].year === j + 1) {
        totalCount += postings[k].amount * postings[k].value;
      }
    }
    totals.push(totalCount);
  }
  // console.log(totals);
  return { postings, totals };
}

// FINANCIAL ANALYSIS
export function financialAnalysis(project: IProjectSchema) {
  // CREATE BOTH BUDGETS
  var financialAnalysis: any = {}
  var establishmentBudget = establishment

  // HARDCODE FINANCIAL OUTPUTS IN RETURN


  /*    financialAnalysis.irr = irr;
    financialAnalysis.npv = npv;*/
  return {};
}

export default {
  establishment, management, financialAnalysis,
};
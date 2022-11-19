var gisObj = require("../middleware/gis");
var area = require("@turf/area");

// DEFINE OBJECT TO HOLD FUNCTIONS FOR DYNAMIC FINANCIAL MODELLING
var dyFiMo: any = {};

// ESTABLISHMENT BUDGET
dyFiMo.establishment = function(project){
    // DEFINE OBJECT TO HOLD OUTPUT PARAMETERS OF ESTABLISHMENT BUDGET
    var establishmentBudget = any = {};
    // GET INPUT PARAMETERS
    var speciesPostings = req.body.speciespostings;
    var speciesPostingsArray: any[] = [];
    for(let i=0;i<speciesPostings.length;i++){
        // REMOVE NONE ONES
        if(!(speciesPostings[i] === "none")){
            var splitPostings = speciesPostings[i].split(" ");
            speciesPostingsArray.push(splitPostings);
        }
    }
    // GET SYSTEM LAYOUT FROM PROJECT
    var layout: any = {};
    // IF ROWS, DO XXX
    if(project.rows && project.rows.length > 0){
        // DO ROW LAYOUT
        layout = gisObj.rowBasedLayout(project);
    } else {
        // DO PARAMETRIC LAYOUT
        layout = gisObj.systemBasedLayout(project);
    }
    // GET SPECIES COUNT ARRAY
    var uniqueSpeciesCount: any[] = [];
    var uniqueSpecies: any[] = [];
    if(layout.uniqueSpeciesCount) {
        uniqueSpeciesCount = layout.uniqueSpeciesCount;
        uniqueSpecies = layout.uniqueSpecies;
    }
    // FIND SPECIES ACTIVITIES SPECIFIED BY INPUT PARAMETERS AND CREATE BUDGET POSTINGS
    var postings: any[] = [];
    // RUN THROUGH ALL POSTINGS
    for(let i=0;i<speciesPostingsArray.length;i++){
        for(let j=0;j<uniqueSpecies.length;j++){
            // RUN THROUGH ALL ACTIVITIES
            if(speciesPostingsArray[i][0] === uniqueSpecies[j].id){
                // CREATE THE POSTING HERE AND PUSH
                var posting: any = {
                    name:  uniqueSpecies[j].nameCommon + " " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype + ": " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].name,
                    postType: "material",
                    amount: 1,
                    value: uniqueSpecies[j].activities[speciesPostingsArray[i][1]].price,
                    year: 1
                };
                // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                if(uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "bed" || uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "method"){
                    posting.postType = "labor";
                }
                for(let k=0;k<uniqueSpeciesCount.length;k++){
                    if(uniqueSpecies[j].nameCommon === uniqueSpeciesCount[k].id){
                        posting.amount = uniqueSpeciesCount[k].uniqueCount;
                    }
                }
                postings.push(posting);
            }
        }
    }
    establishmentBudget.postings = postings;
    return (establishmentBudget);
}

// CASH-FLOW BUDGET
dyFiMo.management = function(project){
    // DEFINE OBJECT TO HOLD OUTPUT PARAMETERS OF CASH-FLOW BUDGET
    var managementBudget = any = {};
    // PARSE INPUT PARAMETER QUERY
    var speciesPostings = req.body.speciespostings;
    var speciesPostingsArray: any[] = [];
    for(let i=0;i<speciesPostings.length;i++){
        // REMOVE NONE ONES
        if(!(speciesPostings[i] === "none")){
            var splitPostings = speciesPostings[i].split(" ");
            speciesPostingsArray.push(splitPostings);
        }
    }
    // UNIQUE SPECIES
    var layout: any = {};
    // IF ROWS, DO XXX
    if(project.rows && project.rows.length > 0){
        // DO ROW LAYOUT
        layout = gisObj.rowBasedLayout(project);
    } else {
        // DO PARAMETRIC LAYOUT
        layout = gisObj.systemBasedLayout(project);
    }
    var uniqueSpeciesCount: any[] = [];
    var uniqueSpecies: any[] = [];
    if(layout.uniqueSpeciesCount) {
        uniqueSpeciesCount = layout.uniqueSpeciesCount;
        uniqueSpecies = layout.uniqueSpecies;
    }
    // FIND SPECIES ACTIVITIES AND CREATE POSTINGS
    var postings: any[] = [];
    var period = req.body.period;
    // FIND UNIQUE AREA SPECIES
    var uniqueAreaSpecies: any[] = [];
    // AREA SIZES IN PERIOD BASED ON AREAS AND SPECIES IN ROTATIONS
    var areaArray = layout.alleyPolygonArray;
    var areaSpeciesRotation = layout.alleySpeciesArray;
    var speciesPeriodAreaArray: any[] = [];
    for(let i=0;i<period;i++){
        var countArray: any[] = [];
        for(let j=0;areaArray.length > j;j++){
            for(let k = 0; k < areaSpeciesRotation[j].length; k++){
                console.log("rotation length: " + areaSpeciesRotation[j].length);
                console.log("rotation check" + ((i+1) % (k+1)));
                // CHECK IF YEAR IS IN ROTATION
                if((i+areaSpeciesRotation[j].length) % (areaSpeciesRotation[j].length) === k){
                    uniqueAreaSpecies.push(areaSpeciesRotation[j][k]);
                    var count = 0;
                    for(let l=0;l<countArray.length;l++){
                        if(areaSpeciesRotation[j][k] === countArray[l].id){
                            countArray[l].count = countArray[l].count + area(areaArray[j]);
                            count = count + 1;
                        }
                    }
                    if(count < 1){
                        let speciesArea = {
                            id: areaSpeciesRotation[j][k],
                            count: area(areaArray[j])
                        };
                        countArray.push(speciesArea);
                    }
                }
            }
        }
        speciesPeriodAreaArray.push(countArray);
    }
    console.log("Species area count " + speciesPeriodAreaArray[1][0].count);
    console.log("Species area species " + speciesPeriodAreaArray[1][0].id);
    console.log("Species area first year length " + speciesPeriodAreaArray[1].length);
    // UNIQUE AREA SPECIES
    var uniqueAreaSpeciesSorted = unique(uniqueAreaSpecies);
    console.log("Unique area species " + uniqueAreaSpeciesSorted.length);
    // RUN THROUGH ALL POSTINGS
    for(let i=0;i<speciesPostingsArray.length;i++){
        for(let j=0;j<uniqueSpecies.length;j++){
            // RUN THROUGH ALL ACTIVITIES
            if(speciesPostingsArray[i][0] === uniqueSpecies[j].id){
                // ITERATE FOR EACH YEAR
                for(let k=0;k<period;k++){
                    // CREATE THE POSTING HERE AND PUSH
                    var posting: any = {
                        name:  uniqueSpecies[j].nameCommon + " " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype + ": " + uniqueSpecies[j].activities[speciesPostingsArray[i][1]].name,
                        postType: "material",
                        amount: 1,
                        value: uniqueSpecies[j].activities[speciesPostingsArray[i][1]].price,
                        year: k + 1
                    };
                    // SET POSTTYPE DEPENDING ON POSTINGS TYPE
                    if(uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "pruning" || uniqueSpecies[j].activities[speciesPostingsArray[i][1]].subtype === "harvest"){
                        posting.postType = "labor";
                    }
                    for(let l=0;l<uniqueSpeciesCount.length;l++){
                        if(uniqueSpecies[j].nameCommon === uniqueSpeciesCount[l].id){
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
    console.log(postings.length + " postings excluding yields");
    // SETUP POSTINGS FOR AREA ACTIVITIES - HOW TO GET VALUES FOR THESE?! CHECK FOR EACH YEAR?!

    // CREATE POSTINGS FOR TREE YIELDS ;)
    for(let i=0;i<uniqueSpecies.length;i++){
        // CYCLE THROUGH ALL YEARS
        for(let j=0;j<period;j++) {
            // CREATE YIELD POSTING
            var posting: any = {
                name: uniqueSpecies[i].nameCommon + " yields",
                postType: "product",
                amount: 0,
                value: 1,
                year: j + 1
            };
            if(uniqueSpecies[i].flows && uniqueSpecies[i].flows.length > 0 && uniqueSpecies[i].flows[0].unit === "food" && (uniqueSpecies[i].flows[0].data.length >= (j+1))){
                for(let k=0;k<uniqueSpeciesCount.length;k++){
                    if(uniqueSpecies[i].nameCommon === uniqueSpeciesCount[k].id){
                        posting.amount = uniqueSpeciesCount[k].uniqueCount * uniqueSpecies[i].flows[0].data[j];
                    }
                }
                /*for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
                    if(uniqueSpecies[i].nameCommon === speciesPeriodAreaArray[j][k].id){
                        posting.amount = speciesPeriodAreaArray[j][k].count * uniqueSpecies[i].flows[0].data[j];
                    }
                }*/
            }
            // DO IF AREA SIZE HERE TO CHECK WITH ROTATION. OK TO HAVE IT HERE SINCE IT OVERWRITE ABOVE FLOWS?

            // ADD TO POSTINGS
            postings.push(posting);
        }
    }
    // AREA YIELDS
    for(let i=0;i<uniqueAreaSpeciesSorted.length;i++){
        // CYCLE THROUGH ALL YEARS
        for(let j=0;j<period;j++) {
            // CREATE YIELD POSTING
            var posting:any = {
                name: uniqueAreaSpeciesSorted[i].nameCommon + " yields",
                postType: "product",
                amount: 0,
                value: 1,
                year: j + 1
            };
            if(uniqueAreaSpeciesSorted[i].flows && uniqueAreaSpeciesSorted[i].flows.length > 0 && uniqueAreaSpeciesSorted[i].flows[0].unit === "food"){
                for(let k=0;k<speciesPeriodAreaArray[j].length;k++){
                    if(uniqueAreaSpeciesSorted[i].nameCommon === speciesPeriodAreaArray[j][k].id.nameCommon){
                        posting.amount = Math.round(speciesPeriodAreaArray[j][k].count * uniqueAreaSpeciesSorted[i].flows[0].data[0]);
                    }
                }
            }
            // ADD TO POSTINGS
            postings.push(posting);
        }
    }
    // CREATE ADDITIONAL POSTINGS FOR AREA SIZES???

    managementBudget.postings = postings;
    return (managementBudget);
}

// FINANCIAL ANALYSIS
dyFiMo.financialAnalysis = function(project){
    // CREATE BOTH BUDGETS
    var financialAnalysis: any = {};
    var establishmentBudget = dyFiMo.establishment;
    var managementBudget = dyFiMo.management;



/*    financialAnalysis.irr = irr;
    financialAnalysis.npv = npv;*/
    return (financialAnalysis);
}

module.exports = dyFiMo;
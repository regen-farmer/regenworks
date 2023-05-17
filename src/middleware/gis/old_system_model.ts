import { IProjectSchema } from '../../models/project';
import { ISpeciesSchema, SpeciesDocument } from '../../models/species';

export function oldSystemModel(project: IProjectSchema) {
  const systemModel: {
    species: SpeciesDocument,
    position: number[]
    width: number
  }[] = [];

  project.systemdesign.rows.forEach((row, rowIdx) => {
    row.sequence.forEach((sequenceElement, elementIdx) => {
      console.log('sequenceElement.species', sequenceElement.species);
      systemModel.push({
        position: [rowIdx, row.sequence.slice(0, elementIdx + 1).reduce((acc:number, curr):number => {
          acc += curr?.spacingAfter ?? 0;
          return acc;
        }, 0)],
        species: sequenceElement.species!,
        width: row.width,
      });
    });
  });

  // FIND SYSTEM ROWS
  const allSpecies: string[] = [];
  const systemRows: { array: {
    species: ISpeciesSchema;
    position: number[];
    width: number;
  }[], row: number }[] = [];

  systemModel.forEach((species) => {
    allSpecies.push(species.species.nameCommon);
    let count = 0;
    for (let i = 0; i < systemRows.length; i++) {
      if (systemRows[i].row === species.position[0]) {
        systemRows[i].array.push(species);
        count += 1;
      }
    }
    if (count === 0) {
      systemRows.push({ row: species.position[0], array: [species] });
    }
  });
  // SORT FIRST ROW ITEMS

  for (let i = 0; i < systemRows.length; i++) {
    systemRows[i].array.sort((a, b) => {
      if (a.position[1] < b.position[1]) {
        return -1;
      }
      if (a.position[1] > b.position[1]) {
        return 1;
      }
      return 0;
    });
  }

  return { allSpecies, systemRows };
}

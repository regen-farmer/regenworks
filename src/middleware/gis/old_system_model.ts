import { IProjectSchema } from '../../models/project';
import { SpeciesDocument } from '../../models/species';

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

  return systemModel;
}

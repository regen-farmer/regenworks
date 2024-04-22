export function absolutePosition(sequence, idx): number {
	return sequence.slice(0, idx + 1).reduce((acc: number, curr): number => {
		acc += curr?.spacingAfter ?? 0;
		return acc;
	}, 0);
}

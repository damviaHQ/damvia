export function compact<T>(array: (T | null | undefined)[]): T[] {
	return array.filter((value) => value !== undefined && value !== null)
}

/** Days when the number of listings behind the figure differs from the day before. */
export function coverageChanges(history: ReadonlyArray<{ day: string; listings: number }>): string[] {
  const days: string[] = [];
  for (let index = 1; index < history.length; index += 1) {
    if (history[index].listings !== history[index - 1].listings) days.push(history[index].day);
  }
  return days;
}

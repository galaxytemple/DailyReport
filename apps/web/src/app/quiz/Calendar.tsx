// Pure presentational month grid. `ym` is 'YYYY-MM'; `stats` maps day-of-month
// to correct count. Prev/next are 'YYYY-MM' strings for navigation links.
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function Calendar({ ym, stats }: { ym: string; stats: Map<number, number> }) {
  const [year, month] = ym.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <a
          href={`/quiz?ym=${shiftMonth(ym, -1)}`}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          ←
        </a>
        <h2 className="text-base font-semibold">
          {year}-{String(month).padStart(2, '0')}
        </h2>
        <a
          href={`/quiz?ym=${shiftMonth(ym, 1)}`}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          →
        </a>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-xs font-medium text-gray-400 py-1">{w}</div>
        ))}
        {cells.map((day, i) => {
          const count = day ? stats.get(day) ?? 0 : 0;
          return (
            <div
              key={i}
              className={`aspect-square rounded-md flex flex-col items-center justify-center text-xs ${
                day ? 'border border-gray-100' : ''
              } ${count > 0 ? 'bg-green-50' : ''}`}
            >
              {day && (
                <>
                  <span className="text-gray-500">{day}</span>
                  {count > 0 && (
                    <span className="text-green-700 font-semibold text-sm">{count}</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

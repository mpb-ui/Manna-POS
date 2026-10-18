import { picColor } from './item-workflow.js';

export const PROJECT_STAGES = [
  ['DESAIN', 'Operator Design'], ['CETAK', 'Proses Cetak'],
  ['FINISHING', 'Finishing'], ['SELESAI', 'Selesai']
];

// Stable sort of a copy; missing/invalid deadlines stay last in either direction.
// Grouping and item identity are handled independently by the existing workflow.
export function sortProjectDeadlines(jobs, direction = 'nearest') {
  const sign = direction === 'farthest' ? -1 : 1;
  return jobs.map((job, index) => ({ job, index, time: job.deadline ? Date.parse(job.deadline) : NaN }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.time), bValid = Number.isFinite(b.time);
      return aValid !== bValid ? (aValid ? -1 : 1)
        : aValid && a.time !== b.time ? sign * (a.time - b.time) : a.index - b.index;
    }).map(entry => entry.job);
}

// Presentation palette only. Persisted PIC IDs/colors remain unchanged, so
// renaming/deleting a PIC continues to preserve its historic identity and tone.
export function projectPicTone(item) {
  return { yellow: 'yellow', green: 'pink', blue: 'gray', purple: 'purple', rose: 'orange', teal: 'green' }[picColor(item)] || 'purple';
}

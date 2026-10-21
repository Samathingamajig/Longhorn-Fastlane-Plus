/** Which grade dataset the in-memory database was loaded from (bundled or a verified download). */
import bundled from './bundled-datasets.json';

export interface GradeDatasetInfo {
    version: string;
    updated: string;
    source: string;
    latestSemester?: string;
    origin: 'bundled' | 'downloaded';
}

const BUNDLED = bundled.datasets.find(d => d.id === 'grades')!;

export const BUNDLED_GRADE_DATASET: GradeDatasetInfo = {
    version: BUNDLED.version,
    updated: BUNDLED.publishedAt.slice(0, 10),
    source: 'UT Austin grade distributions (via UT_Grade_Parser / UT Registration Plus)',
    latestSemester: BUNDLED.latestSemester,
    origin: 'bundled',
};

let active: GradeDatasetInfo = BUNDLED_GRADE_DATASET;

export function getActiveGradeDataset(): GradeDatasetInfo {
    return active;
}

export function setActiveGradeDataset(info: GradeDatasetInfo): void {
    active = info;
}

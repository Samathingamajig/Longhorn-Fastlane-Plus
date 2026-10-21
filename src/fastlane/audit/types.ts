export type RequirementStatus = 'completed' | 'in-progress' | 'not-started';
export type Confidence = 'high' | 'medium' | 'low';
export type RequirementCategory = 'core' | 'major' | 'hours' | 'gpa' | 'other';

export interface Progress {
    value: number;
    unit: 'hours' | 'courses';
}

export interface AuditRequirement {
    id: string;
    section: string;
    text: string;
    category: RequirementCategory;
    status: RequirementStatus;
    required?: Progress;
    applied?: Progress;
    remaining?: Progress;
    /** normalized requirement tags, e.g. "CORE 050" */
    tags: string[];
    /** course codes listed as applied to this requirement */
    courses: string[];
    confidence: Confidence;
    /** why the parser is unsure; shown on the review screen */
    issues: string[];
    /** set once the student corrected or confirmed this item */
    reviewed?: boolean;
}

export type AuditCourseStatus = 'completed' | 'in-progress' | 'planned' | 'pending-transfer';

export interface AuditCourse {
    code: string;
    name: string;
    grade: string;
    unique: string;
    /** "In-Residence" | "Transfer" | "Credit By Exam" | other text as listed */
    type: string;
    hours: number;
    semester: string;
    status: AuditCourseStatus;
}

export interface ParsedAudit {
    source: 'html' | 'pdf';
    fileName?: string;
    parsedAt: number;
    program?: string;
    requirements: AuditRequirement[];
    courses: AuditCourse[];
    transfer: { accepted: AuditCourse[]; pending: AuditCourse[] };
    /** total degree hours if a rule states them */
    creditHours: { required?: number; applied?: number; remaining?: number; confidence: Confidence };
    /** prerequisite / restriction sentences found in the audit */
    restrictions: string[];
    warnings: string[];
}

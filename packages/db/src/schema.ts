export interface Topic {
  id: number;
  keyword: string;
  email: string;
  active: number;
  createdAt: Date;
}

export interface RawData {
  id: number;
  topicId: number;
  source: 'reddit' | 'twitter' | 'news';
  url: string | null;
  title: string | null;
  body: string | null;
  sentiment: number | null;
  createdAt: Date;
}

export interface DailyReport {
  id: number;
  topicId: number;
  theme: string | null;
  content: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface ArchivedSummary {
  id: number;
  topicId: number;
  reportDate: Date;
  rank: number;
  source: string;
  url: string | null;
  title: string | null;
  summary: string;
  sentiment: number | null;
  createdAt: Date;
}

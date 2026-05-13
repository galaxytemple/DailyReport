export interface CrawledItem {
  source: 'reddit' | 'news';
  url: string | null;
  title: string;
  body: string;
}

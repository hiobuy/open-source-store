export interface HelpCenterCategory {
  id: number;
  name: string;
  description: string;
  icon: string;
}

export interface HelpCenterArticleSummary {
  id: number;
  slug: string;
  title: string;
  category_id: number;
  curated: boolean;
}

export interface HelpCenterArticle extends HelpCenterArticleSummary {
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface HelpCenterLandingData {
  categories: HelpCenterCategory[];
  popularArticles: HelpCenterArticleSummary[];
}

export interface HelpCenterSearchData {
  articles: HelpCenterArticleSummary[];
  category: HelpCenterCategory | null;
}
